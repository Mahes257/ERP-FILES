package com.vishatech.erp.service.production;

import com.vishatech.erp.cad.CadConversionEngine;
import com.vishatech.erp.cad.CadConversionProvider;
import com.vishatech.erp.cad.CadConversionResult;
import com.vishatech.erp.cad.CadContentSniffer;
import com.vishatech.erp.cad.CadFileTypes;
import com.vishatech.erp.cad.ConversionProviderRegistry;
import com.vishatech.erp.dto.production.ModelDTO;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.DuplicateResourceException;
import com.vishatech.erp.dto.production.ModelHistoryDTO;
import com.vishatech.erp.dto.production.ModelStatsDTO;
import com.vishatech.erp.entity.production.Model;
import com.vishatech.erp.entity.production.ModelConversionStatus;
import com.vishatech.erp.entity.production.ModelHistory;
import com.vishatech.erp.entity.production.ModelStatus;
import com.vishatech.erp.repository.production.ModelHistoryRepository;
import com.vishatech.erp.repository.production.ModelRepository;
import com.vishatech.erp.util.UploadStreams;
import com.vishatech.erp.util.production.OrderMapper;
import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.stream.Collectors;

/**
 * Service for managing Model records.
 * Implements file storage, workflow validation, and business logic.
 */
@Service
@Transactional
public class ModelService {

    private static final Logger log = LoggerFactory.getLogger(ModelService.class);

    private final ModelRepository modelRepository;
    private final ModelHistoryRepository historyRepository;
    private final EntityManager entityManager;
    private final Executor cadConversionExecutor;
    private final ConversionProviderRegistry conversionRegistry;

    @Value("${app.storage.models:./uploads/models}")
    private String storagePath;

    @Value("${app.cad-convert.enabled:true}")
    private boolean cadConversionEnabled;

    /**
     * Uploadable model formats, grouped by how the pipeline really handles them
     * (see {@link CadFileTypes} and
     * {@link ConversionProviderRegistry} for the authoritative routing):
     *
     *  - direct browser mesh: stl, obj, glb, gltf, 3mf, fbx, wrl, vrml, ply, dae, 3ds
     *  - converted by an engine: step, stp, iges, igs, brep, sldprt, sldasm
     *  - accepted + stored only (no engine here): sat, x_t, x_b, 3dm, jt, 3dxml,
     *    slddrw, and the native vendor formats (CATIA / NX / Creo / Inventor /
     *    Solid Edge / Fusion 360 / FreeCAD / Blender / OpenSCAD)
     */
    private static final List<String> ALLOWED_EXTENSIONS = List.of(
        ".sldprt", ".sldasm", ".slddrw", ".sat", ".step", ".stp", ".iges", ".igs", ".brep",
        ".stl", ".obj", ".glb", ".gltf", ".3mf", ".fbx", ".wrl", ".vrml", ".ply", ".dae", ".3ds",
        ".x_t", ".x_b", ".3dm", ".jt", ".3dxml",
        ".catpart", ".catproduct", ".catdrawing",
        ".prt", ".asm", ".drw", ".ipt", ".iam", ".idw", ".par", ".dft",
        ".f3d", ".f3z", ".fcstd", ".blend", ".scad"
    );
    private static final long MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB for 3D models

    /** Model verification events — gated by Production Settings → Notifications. */
    private final ProductionNotificationPublisher notificationPublisher;

    public ModelService(ModelRepository modelRepository,
                        ModelHistoryRepository historyRepository,
                        EntityManager entityManager,
                        @Qualifier("cadConversionExecutor") Executor cadConversionExecutor,
                        ConversionProviderRegistry conversionRegistry,
                        ProductionNotificationPublisher notificationPublisher) {
        this.modelRepository = modelRepository;
        this.historyRepository = historyRepository;
        this.entityManager = entityManager;
        this.cadConversionExecutor = cadConversionExecutor;
        this.conversionRegistry = conversionRegistry;
        this.notificationPublisher = notificationPublisher;
    }

    // ========================
    // CRUD Operations
    // ========================

    /**
     * Create a new Model with file upload.
     */
    public ModelDTO createModel(ModelDTO request, MultipartFile file) throws IOException {
        validateRequest(request);

        // Use user-provided modelNumber if given, otherwise auto-generate
        String modelNumber = (request.getModelNumber() != null && !request.getModelNumber().isBlank())
            ? request.getModelNumber()
            : generateModelNumber();

        // Model number is unique; a user-picked duplicate is a conflict (409),
        // never an opaque 500 from the database constraint.
        if (modelRepository.existsByModelNumber(modelNumber)) {
            throw new DuplicateResourceException(
                "A Production Model with number '" + modelNumber + "' already exists.");
        }

        String filePath = null;
        String fileName = null;
        String fileType = null;
        Long fileSize = null;
        String fileChecksum = null;

        if (file != null && !file.isEmpty()) {
            validateFile(file);
            // Stored and hashed in one bounded-buffer pass — the upload is never
            // materialised in the heap (a 500 MB model costs one 64 KB buffer).
            UploadStreams.StoredFile stored = saveFile(file, modelNumber);
            filePath = stored.pathString();
            fileName = file.getOriginalFilename();
            fileType = detectTrueType(stored.path(), getFileExtension(fileName));
            fileSize = stored.size();
            fileChecksum = stored.sha256();
        }

        String conversionStatus = ModelConversionStatus.NOT_REQUIRED;
        if (fileType != null && needsConversion(fileType)) {
            conversionStatus = ModelConversionStatus.NOT_CONVERTED;
        }

        Model model = Model.builder()
            .modelNumber(modelNumber)
            .workOrderId(request.getWorkOrderId())
            .workOrderItemId(request.getWorkOrderItemId())
            .itemName(request.getItemName())
            .modelRevision(request.getModelRevision() != null ? request.getModelRevision() : "Rev A")
            .fileName(fileName)
            .fileType(fileType)
            .filePath(filePath)
            .fileSize(fileSize)
            .fileChecksum(fileChecksum)
            .conversionStatus(conversionStatus)
            .uploadedBy(request.getUploadedBy())
            .uploadedDate(Instant.now())
            .verificationStatus(ModelStatus.PENDING)
            .createdBy(request.getCreatedBy())
            .build();

        model = modelRepository.save(model);
        recordHistory(model, "Created", null, ModelStatus.PENDING, request.getCreatedBy(), "Model created.");

        publishEvent(ProductionNotificationPublisher.MDL_PENDING, model, "Model awaiting verification",
                "Model " + label(model) + " was uploaded and is awaiting verification.");

        entityManager.flush();
        entityManager.clear();

        // STEP/STP/IGES/IGS uploads are auto-queued for the backend STEP->GLB
        // stage when a real engine is registered, so the frontend can show
        // Processing -> Ready. With no engine registered they resolve to the
        // honest UNSUPPORTED state instead of a fake preview.
        // SLDPRT/SLDASM likewise auto-queue ONLY when a SolidWorks-capable
        // provider is present; otherwise they stay store-only (NOT_REQUIRED).
        if (fileType != null && needsConversion(fileType)) {
            return requestConversion(model.getId());
        }
        return OrderMapper.toModelDTO(modelRepository.findById(model.getId()).orElse(model));
    }

    /**
     * Update Model metadata.
     */
    public ModelDTO updateModel(Long id, ModelDTO request) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));

        if (model.getVerificationStatus() != ModelStatus.PENDING) {
            throw new BadRequestException("Can only edit Models in Pending status");
        }

        if (request.getWorkOrderId() != null) model.setWorkOrderId(request.getWorkOrderId());
        if (request.getWorkOrderItemId() != null) model.setWorkOrderItemId(request.getWorkOrderItemId());
        if (request.getItemName() != null) model.setItemName(request.getItemName());
        if (request.getModelRevision() != null) model.setModelRevision(request.getModelRevision());
        if (request.getUploadedBy() != null) model.setUploadedBy(request.getUploadedBy());
        if (request.getUpdatedBy() != null) model.setUpdatedBy(request.getUpdatedBy());

        model = modelRepository.save(model);
        recordHistory(model, "Updated", null, null, request.getUpdatedBy(), "Model metadata updated.");

        return OrderMapper.toModelDTO(model);
    }

    /**
     * Replace the file for an existing Model.
     */
    public ModelDTO updateModelFile(Long id, MultipartFile file, String performedBy) throws IOException {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));

        if (file != null && !file.isEmpty()) {
            validateFile(file);

            if (model.getFilePath() != null) {
                deleteFile(model.getFilePath());
            }

            // Replacing the file invalidates any previously converted GLB —
            // remove it from disk so it cannot become an orphaned preview.
            if (model.getConvertedFilePath() != null) {
                deleteFile(model.getConvertedFilePath());
            }

            UploadStreams.StoredFile stored = saveFile(file, model.getModelNumber());
            model.setFileName(file.getOriginalFilename());
            model.setFileType(detectTrueType(stored.path(), getFileExtension(file.getOriginalFilename())));
            model.setFilePath(stored.pathString());
            model.setFileSize(stored.size());
            model.setFileChecksum(stored.sha256());
            model.setUploadedBy(performedBy);
            model.setUploadedDate(Instant.now());

            // A new file invalidates any previously converted representation.
            String ft = getFileExtension(file.getOriginalFilename());
            if (needsConversion(ft)) {
                model.setConversionStatus(ModelConversionStatus.NOT_CONVERTED);
                model.setConvertedFilePath(null);
                model.setConversionError(null);
                model.setConversionStartedAt(null);
                model.setConversionCompletedAt(null);
            } else {
                model.setConversionStatus(ModelConversionStatus.NOT_REQUIRED);
                model.setConvertedFilePath(null);
                model.setConversionError(null);
            }

            model = modelRepository.save(model);
            recordHistory(model, "File Updated", null, null, performedBy, "Model file replaced.");

            // A convertible file replacement is re-queued for GLB conversion.
            if (needsConversion(ft)) {
                return requestConversion(model.getId());
            }
        }

        return OrderMapper.toModelDTO(model);
    }

    /**
     * Delete a Model.
     */
    public void deleteModel(Long id) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));

        if (model.getFilePath() != null) {
            deleteFile(model.getFilePath());
        }
        // Never leave a generated GLB orphaned on disk when its model is deleted.
        if (model.getConvertedFilePath() != null) {
            deleteFile(model.getConvertedFilePath());
        }

        historyRepository.deleteByModelId(id);
        modelRepository.delete(model);
    }

    /**
     * Get a Model by id.
     */
    @Transactional(readOnly = true)
    public ModelDTO getModel(Long id) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));
        return OrderMapper.toModelDTO(model);
    }

    /**
     * Get a Model by model number.
     */
    @Transactional(readOnly = true)
    public ModelDTO getModelByNumber(String modelNumber) {
        Model model = modelRepository.findByModelNumber(modelNumber)
            .orElseThrow(() -> new NoSuchElementException("Model not found with number: " + modelNumber));
        return OrderMapper.toModelDTO(model);
    }

    /**
     * Get all Models with pagination, search, and filters.
     */
    @Transactional(readOnly = true)
    public Page<ModelDTO> getAllModels(
            String search, String status, String workOrderId,
            int page, int size, String sort, String direction) {

        Sort sortOrder;
        if (sort != null && !sort.isBlank()) {
            Sort.Direction dir = "desc".equalsIgnoreCase(direction) ? Sort.Direction.DESC : Sort.Direction.ASC;
            sortOrder = Sort.by(dir, mapSortField(sort));
        } else {
            sortOrder = Sort.by(Sort.Direction.DESC, "createdAt");
        }

        PageRequest pageRequest = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 100)), sortOrder);

        Page<Model> result;
        boolean hasFilters = (status != null && !status.isBlank()) || (workOrderId != null && !workOrderId.isBlank());

        if (hasFilters) {
            result = modelRepository.findFiltered(
                search,
                status != null && !status.isBlank() ? ModelStatus.fromDisplayName(status) : null,
                workOrderId,
                pageRequest
            );
        } else {
            result = modelRepository.searchModels(search, pageRequest);
        }

        return result.map(OrderMapper::toModelDTO);
    }

    /**
     * Get Models for a Work Order.
     */
    @Transactional(readOnly = true)
    public List<ModelDTO> getModelsForOrder(String workOrderId) {
        return modelRepository.findByWorkOrderId(workOrderId).stream()
            .map(OrderMapper::toModelDTO)
            .collect(Collectors.toList());
    }

    /**
     * Get Models for a specific Work Order Item.
     */
    @Transactional(readOnly = true)
    public List<ModelDTO> getModelsForItem(String workOrderId, String workOrderItemId) {
        return modelRepository.findByWorkOrderIdAndWorkOrderItemId(workOrderId, workOrderItemId).stream()
            .map(OrderMapper::toModelDTO)
            .collect(Collectors.toList());
    }

    // ========================
    // Verification Workflow
    // ========================

    public ModelDTO verify(Long id, String performedBy, String remarks) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));

        ModelStatus oldStatus = model.getVerificationStatus();
        if (oldStatus != ModelStatus.PENDING) {
            throw new BadRequestException("Can only verify Models in Pending status");
        }

        model.setVerificationStatus(ModelStatus.VERIFIED);
        model.setVerifiedBy(performedBy);
        model.setVerificationDateTime(Instant.now());
        if (remarks != null && !remarks.isBlank()) {
            model.setVerificationRemarks(remarks);
        }

        model = modelRepository.save(model);
        recordHistory(model, "Verified", oldStatus, ModelStatus.VERIFIED, performedBy, remarks);

        publishEvent(ProductionNotificationPublisher.MDL_APPROVED, model, "Model approved",
                "Model " + label(model) + " was verified by " + safeUser(performedBy) + ".");
        return OrderMapper.toModelDTO(model);
    }

    public ModelDTO reject(Long id, String performedBy, String remarks) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));

        ModelStatus oldStatus = model.getVerificationStatus();
        if (oldStatus != ModelStatus.PENDING) {
            throw new BadRequestException("Can only reject Models in Pending status");
        }

        model.setVerificationStatus(ModelStatus.REJECTED);
        model.setVerifiedBy(performedBy);
        model.setVerificationDateTime(Instant.now());
        if (remarks != null && !remarks.isBlank()) {
            model.setVerificationRemarks(remarks);
        }

        model = modelRepository.save(model);
        recordHistory(model, "Rejected", oldStatus, ModelStatus.REJECTED, performedBy, remarks);

        publishEvent(ProductionNotificationPublisher.MDL_REJECTED, model, "Model rejected",
                "Model " + label(model) + " was rejected by " + safeUser(performedBy)
                        + reasonSuffix(remarks));
        return OrderMapper.toModelDTO(model);
    }

    /* ========================
     * Notifications
     * ======================== */

    /**
     * Publishes a model event through the shared notification system.
     *
     * <p>The occurrence discriminator is the number of history rows, so a
     * re-uploaded model that is verified again notifies again while a replayed
     * publish of the same transition is suppressed.
     */
    private void publishEvent(String event, Model model, String title, String message) {
        try {
            int occurrence = getHistory(model.getId()).size();
            notificationPublisher.publish(event, ProductionNotificationPublisher.REF_MODEL,
                    model.getId(), title, message, "NORMAL", occurrence);
        } catch (Exception e) {
            log.warn("Model notification skipped [model={}]: {}", model.getId(), e.getMessage());
        }
    }

    private static String label(Model model) {
        if (model.getModelNumber() != null && !model.getModelNumber().isBlank()) {
            return model.getModelNumber();
        }
        return "#" + model.getId();
    }

    private static String safeUser(String performedBy) {
        return performedBy == null || performedBy.isBlank() ? "the system" : performedBy;
    }

    private static String reasonSuffix(String remarks) {
        if (remarks == null || remarks.isBlank()) {
            return ".";
        }
        String reason = remarks.trim();
        return ": " + (reason.length() > 300 ? reason.substring(0, 300) + "…" : reason);
    }

    // ========================
    // 3D Conversion
    // ========================

    /**
     * Check the conversion status for a model's current file type.
     * Returns the persisted status, or a sensible default if not set.
     */
    @Transactional(readOnly = true)
    public String getConversionStatus(Long id) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));
        if (model.getConversionStatus() != null && !model.getConversionStatus().isBlank()) {
            return model.getConversionStatus();
        }
        String ft = model.getFileType();
        return CadFileTypes.requiresBackendConversion(ft)
            ? ModelConversionStatus.NOT_CONVERTED
            : ModelConversionStatus.NOT_REQUIRED;
    }

    /**
     * Trigger CAD conversion (STEP/STP/IGES/IGS -> GLB, or store-only formats
     * such as SLDPRT/SLDASM when a genuine provider is configured) asynchronously.
     *
     * Resolves the conversion provider for the file type and acts accordingly:
     *  - browser-native formats            -> NOT_REQUIRED (no conversion).
     *  - pipeline disabled by config       -> UNSUPPORTED (honest message).
     *  - formats with no real provider     -> UNSUPPORTED (honest message, e.g.
     *    SLDPRT/SLDASM on a server without a SolidWorks engine).
     *  - formats with an available engine  -> QUEUED, then PROCESSING once the
     *    worker picks the job up. The actual (potentially long-running) conversion
     *    runs on a dedicated worker pool so this HTTP request is never blocked.
     *
     * @return the ModelDTO reflecting the resulting state
     */
    public ModelDTO requestConversion(Long id) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));

        String ft = model.getFileType();
        ConversionProviderRegistry.ProviderResolution resolution = conversionRegistry.resolve(ft);

        // Browser-native formats never need backend conversion.
        if (resolution.provider == CadConversionProvider.DIRECT_BROWSER) {
            model.setConversionStatus(ModelConversionStatus.NOT_REQUIRED);
            model.setConvertedFilePath(model.getFilePath());
            model.setConversionError(null);
            model = modelRepository.save(model);
            return OrderMapper.toModelDTO(model);
        }

        // Conversion pipeline globally disabled by configuration -> honest
        // UNSUPPORTED state (never a fake success or a doomed job).
        if (!cadConversionEnabled) {
            model.setConversionStatus(ModelConversionStatus.UNSUPPORTED);
            model.setConversionError(
                "No compatible CAD conversion engine is configured. Enable the CAD conversion "
                + "service (app.cad-convert.enabled) or upload STL/OBJ/GLB for direct 3D viewing.");
            model.setConversionCompletedAt(Instant.now());
            model.setConvertedFilePath(null);
            model = modelRepository.save(model);
            return OrderMapper.toModelDTO(model);
        }

        // Proprietary format with no real conversion provider -> UNSUPPORTED.
        if (!resolution.available || resolution.engine == null) {
            model.setConversionStatus(ModelConversionStatus.UNSUPPORTED);
            model.setConversionError(resolution.unavailableMessage
                != null ? resolution.unavailableMessage
                : "No compatible CAD conversion engine is available for " + ft + " files.");
            model.setConversionCompletedAt(Instant.now());
            model.setConvertedFilePath(null);
            model = modelRepository.save(model);
            return OrderMapper.toModelDTO(model);
        }

        // Already in-flight — nothing to do. A READY row whose converted file
        // has disappeared from storage (e.g. cache/output dir cleaned while the
        // DB row survived) must be RECONVERTED, not reported as ready — a READY
        // status without a servable file is a fake success.
        if (ModelConversionStatus.isInFlight(model.getConversionStatus())) {
            return OrderMapper.toModelDTO(model);
        }
        if (ModelConversionStatus.READY.equals(model.getConversionStatus())) {
            boolean filePresent = model.getConvertedFilePath() != null
                && java.nio.file.Files.isRegularFile(java.nio.file.Paths.get(model.getConvertedFilePath()));
            if (filePresent) {
                return OrderMapper.toModelDTO(model);
            }
            log.warn("Model {} is READY but converted file {} is missing from storage — requeueing conversion",
                model.getId(), model.getConvertedFilePath());
        }

        // QUEUED while waiting for a worker slot; PROCESSING once started.
        model.setConversionStatus(ModelConversionStatus.QUEUED);
        model.setConversionError(null);
        model.setConversionStartedAt(Instant.now());
        model.setConversionCompletedAt(null);
        model.setConvertedFilePath(null);
        model = modelRepository.save(model);

        final CadConversionEngine engine = resolution.engine;
        final Long modelId = model.getId();
        Runnable job = () -> runConversionJob(modelId, engine);
        // Schedule the worker only AFTER the surrounding transaction commits, so
        // the worker's own transaction always sees the persisted QUEUED row.
        // Scheduling inline races the HTTP transaction commit: the worker could
        // read before the row is visible and fail (leaving a stuck QUEUED).
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cadConversionExecutor.execute(job);
                }
            });
        } else {
            cadConversionExecutor.execute(job);
        }
        return OrderMapper.toModelDTO(model);
    }

    /**
     * Complete the actual CAD conversion on a worker thread.
     * Loads a fresh entity (not the request-scoped one) so multi-threaded DB
     * access is safe, runs the engine, and persists the outcome.
     */
    void runConversionJob(Long modelId, CadConversionEngine engine) {
        try {
            // Belt-and-braces: give the committing transaction a moment to become
            // visible even if this job was scheduled outside an afterCommit hook.
            Model model = null;
            for (int attempt = 0; attempt < 10 && model == null; attempt++) {
                Optional<Model> maybe = modelRepository.findById(modelId);
                if (maybe.isPresent()) {
                    model = maybe.get();
                } else {
                    try {
                        Thread.sleep(500);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
            if (model == null) {
                markFailed(modelId, "Model no longer exists (id " + modelId + "); conversion cancelled.");
                return;
            }

            // Persist PROCESSING before doing any slow work.
            model.setConversionStatus(ModelConversionStatus.PROCESSING);
            model = modelRepository.save(model);

            Path source = Paths.get(model.getFilePath());
            if (!Files.exists(source)) {
                markFailed(modelId, "Source CAD file not found on server.");
                return;
            }

            String ft = model.getFileType();
            if (engine == null || !engine.supports(ft)) {
                markUnsupported(modelId, ConversionProviderRegistry.SLD_UNSUPPORTED_MESSAGE);
                return;
            }

            // Per-model/revision cache dir so the GLB for one revision is never
            // mistaken for another: <storage>/cache/<modelNumber>_<revision>/.
            // The original upload (model.getFilePath()) is never touched. Tokens
            // are sanitized to [A-Za-z0-9._-] so the key can never escape the
            // storage root or be influenced by arbitrary input.
            Path cacheRoot = Paths.get(storagePath).resolve("cache").normalize();
            String revTok = model.getModelRevision();
            String cacheKey = sanitizeFileToken(model.getModelNumber())
                + (revTok != null && !revTok.isBlank()
                    ? "_" + sanitizeFileToken(revTok)
                    : "");
            Path outDir = cacheRoot.resolve(cacheKey).normalize();
            if (!outDir.startsWith(cacheRoot)) {
                throw new IllegalStateException("Invalid conversion cache key");
            }
            Files.createDirectories(outDir);
            String outputBase = model.getModelNumber() + "_converted";

            // Bounded retry: subprocess conversion can fail transiently (OOM on
            // first mesh, AV interference with the spawned interpreter, races on
            // the fresh cache dir). Each retry re-runs the engine; success is
            // decided by the engine's own deep geometry validation.
            CadConversionResult result = null;
            int attempts = 0;
            final int MAX_ATTEMPTS = 2;
            Exception lastError = null;
            while (attempts < MAX_ATTEMPTS) {
                attempts++;
                try {
                    result = engine.convert(source, outputBase, outDir, ft);
                    if (result != null && result.isSuccess()) break;
                } catch (Exception e) {
                    lastError = e;
                    log.warn("CAD conversion attempt {} failed for model {}", attempts, modelId, e);
                }
                if (attempts < MAX_ATTEMPTS) {
                    try {
                        Thread.sleep(1500);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }

            if (result != null && result.isSuccess()) {
                Model reloaded = modelRepository.findById(modelId).orElse(null);
                if (reloaded == null) return;
                reloaded.setConversionStatus(ModelConversionStatus.READY);
                reloaded.setConvertedFilePath(result.getConvertedFilePath());
                reloaded.setConversionError(null);
                reloaded.setConversionCompletedAt(Instant.now());
                modelRepository.save(reloaded);
                recordHistory(reloaded, "Converted", null, null, "System",
                    "CAD to GLB conversion completed.");
                log.info("CAD conversion completed for model {}", modelId);
            } else {
                String reason = result != null && result.getError() != null
                    ? result.getError()
                    : (lastError != null ? lastError.getMessage() : "CAD conversion failed.");
                markFailed(modelId, reason);
            }
        } catch (Exception e) {
            log.error("CAD conversion job failed for model {}", modelId, e);
            markFailed(modelId, "CAD conversion failed: " + e.getMessage());
        }
    }

    /** Restrict a cache-key token to filesystem-safe characters. */
    private static String sanitizeFileToken(String token) {
        if (token == null) return "UNNAMED";
        String cleaned = token.trim().replaceAll("[^A-Za-z0-9._-]+", "_").replaceAll("^[_]+|[_]+$", "");
        return cleaned.isBlank() ? "UNNAMED" : (cleaned.length() > 80 ? cleaned.substring(0, 80) : cleaned);
    }

    private void markUnsupported(Long modelId, String message) {
        modelRepository.findById(modelId).ifPresent(m -> {
            m.setConversionStatus(ModelConversionStatus.UNSUPPORTED);
            m.setConversionError(message);
            m.setConversionCompletedAt(Instant.now());
            m.setConvertedFilePath(null);
            modelRepository.save(m);
        });
    }

    private void markFailed(Long modelId, String message) {
        modelRepository.findById(modelId).ifPresent(m -> {
            m.setConversionStatus(ModelConversionStatus.FAILED);
            m.setConversionError(message);
            m.setConversionCompletedAt(Instant.now());
            m.setConvertedFilePath(null);
            modelRepository.save(m);
        });
    }

    /**
     * Conversion status detail for the viewer: the persisted conversion state
     * plus the resolved conversion engine (name, display name, availability).
     * This lets the UI report the ACTUAL engine that would perform the work
     * instead of guessing (the engine is null while none is registered).
     */
    @Transactional(readOnly = true)
    public java.util.Map<String, Object> getConversionStatusDetail(Long id) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));

        ConversionProviderRegistry.ProviderResolution resolution = conversionRegistry.resolve(model.getFileType());
        java.util.Map<String, Object> detail = new java.util.LinkedHashMap<>();
        detail.put("id", model.getId());
        detail.put("conversionStatus", model.getConversionStatus());
        detail.put("conversionError", model.getConversionError());
        detail.put("conversionStartedAt", model.getConversionStartedAt());
        detail.put("conversionCompletedAt", model.getConversionCompletedAt());
        detail.put("conversionEngine", resolution.engine != null ? resolution.engine.getName() : null);
        detail.put("conversionEngineDisplayName", resolution.provider != null ? resolution.provider.getDisplayName() : null);
        detail.put("conversionEngineAvailable", resolution.available);
        detail.put("conversionMessage", resolution.unavailableMessage);
        detail.put("conversionRequired", CadFileTypes.requiresBackendConversion(model.getFileType()));
        return detail;
    }

    /**
     * Get the path to the browser-viewable 3D representation of a model.
     *
     * @return the converted GLB path when READY, otherwise the original file
     *         (for browser-native formats GLB/STL/OBJ, where the original IS the
     *         viewable representation). Never returns an SLDPRT/SLDASM original
     *         for viewing.
     */
    @Transactional(readOnly = true)
    public Path getConvertedFilePath(Long id) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));

        String status = model.getConversionStatus();
        String ft = model.getFileType();

        // Converted GLB is the preferred representation.
        if (ModelConversionStatus.READY.equals(status) && model.getConvertedFilePath() != null) {
            Path path = Paths.get(model.getConvertedFilePath());
            if (Files.exists(path)) return path;
        }

        // For browser-native formats, the original file can be served directly.
        if (CadFileTypes.isBrowserNative(ft)) {
            return getFilePath(id);
        }

        // Never expose a proprietary SLDPRT/SLDASM for viewing.
        throw new IllegalStateException(
            "No converted 3D representation is available for this model (status: " + status + ")."
        );
    }

    /**
     * Strict accessor for the converted GLB used by GET /models/{id}/3d.
     * Returns the converted file ONLY when the conversion is READY and the
     * converted file path is set and still exists on disk. Any other state
     * throws, so the controller can answer with a clean client response
     * instead of serving the original (or nothing) as if it were a preview.
     */
    @Transactional(readOnly = true)
    public Path getConvertedFileIfReady(Long id) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));

        String status = model.getConversionStatus();
        if (!ModelConversionStatus.READY.equals(status) || model.getConvertedFilePath() == null) {
            throw new IllegalStateException(
                "Converted 3D model is not available (conversion status: "
                    + (status == null ? "NONE" : status) + ").");
        }

        Path path = Paths.get(model.getConvertedFilePath());
        if (!Files.exists(path) || !Files.isRegularFile(path)) {
            throw new IllegalStateException("Converted model file is missing from storage.");
        }
        return path;
    }

    // ========================
    // File Operations
    // ========================

    /**
     * Whether a file type is browser-viewable without any backend conversion.
     * GLB/GLTF/STL/OBJ are parsed directly in the browser by Three.js loaders.
     */
    @Transactional(readOnly = true)
    public boolean isBrowserNative(String fileType) {
        return CadFileTypes.isBrowserNative(fileType);
    }

    /**
     * Whether an uploaded/updated file of this type should enter the backend
     * conversion flow (auto-queue on upload, NOT_CONVERTED initial status).
     *
     * Always true for STEP/STP/IGES/IGS. For SLDPRT/SLDASM it is true ONLY when
     * a SolidWorks-capable conversion provider is actually available on this
     * server — without one they remain store-only (NOT_REQUIRED), preserving
     * the honest lifecycle for servers without SolidWorks.
     */
    private boolean needsConversion(String fileType) {
        String ft = CadConversionEngine.normalizeFileType(fileType);
        if (CadFileTypes.requiresBackendConversion(ft)) {
            return true;
        }
        if ("sldprt".equals(ft) || "sldasm".equals(ft)) {
            ConversionProviderRegistry.ProviderResolution resolution = conversionRegistry.resolve(ft);
            return resolution.available && resolution.engine != null;
        }
        return false;
    }

    @Transactional(readOnly = true)
    public Path getFilePath(Long id) {
        Model model = modelRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Model not found with id: " + id));

        if (model.getFilePath() == null) {
            throw new BadRequestException("No file attached to this model");
        }

        Path path = Paths.get(model.getFilePath());
        if (!Files.exists(path)) {
            throw new BadRequestException("Model file not found on disk");
        }

        return path;
    }

    // ========================
    // Statistics
    // ========================

    @Transactional(readOnly = true)
    public ModelStatsDTO getStatistics() {
        return ModelStatsDTO.builder()
            .total(modelRepository.countAll())
            .pending(modelRepository.countPending())
            .verified(modelRepository.countVerified())
            .rejected(modelRepository.countRejected())
            .build();
    }

    // ========================
    // History
    // ========================

    @Transactional(readOnly = true)
    public List<ModelHistoryDTO> getHistory(Long modelId) {
        return historyRepository.findByModelIdOrderByPerformedAtDesc(modelId).stream()
            .map(OrderMapper::toModelHistoryDTO)
            .collect(Collectors.toList());
    }

    // ========================
    // Private Helpers
    // ========================

    private void validateRequest(ModelDTO request) {
        if (request.getWorkOrderId() == null || request.getWorkOrderId().isBlank()) {
            throw new IllegalArgumentException("Work Order is required");
        }
        if (request.getWorkOrderItemId() == null || request.getWorkOrderItemId().isBlank()) {
            throw new IllegalArgumentException("Item / Product is required");
        }
    }

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File is required");
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException("File size exceeds maximum allowed size (500MB)");
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || originalFilename.isBlank()) {
            throw new IllegalArgumentException("File name is required");
        }

        String ext = getFileExtension(originalFilename);
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw new IllegalArgumentException("Unsupported file type: " + ext + ". Allowed: " + ALLOWED_EXTENSIONS);
        }
    }

    private UploadStreams.StoredFile saveFile(MultipartFile file, String modelNumber) throws IOException {
        Path storageDir = Paths.get(storagePath);
        if (!Files.exists(storageDir)) {
            Files.createDirectories(storageDir);
        }

        String ext = getFileExtension(file.getOriginalFilename());
        String safeName = modelNumber + "_" + UUID.randomUUID().toString().substring(0, 8) + ext;
        Path targetPath = storageDir.resolve(safeName);

        return UploadStreams.copyWithSha256(file, targetPath);
    }

    private void deleteFile(String filePath) {
        try {
            Path path = Paths.get(filePath);
            if (Files.exists(path)) {
                Files.deleteIfExists(path);
            }
        } catch (IOException e) {
            // Log but don't fail
        }
    }

    private String getFileExtension(String filename) {
        if (filename == null) return "";
        int idx = filename.lastIndexOf('.');
        return idx >= 0 ? filename.substring(idx).toLowerCase() : "";
    }

    /**
     * Determine the file's TRUE type from its bytes, falling back to the
     * declared extension when the content carries no recognizable signature
     * (proprietary formats like SLDPRT/SLDASM are opaque binaries with no
     * public magic we can rely on, so their extension stays authoritative).
     *
     * This is what makes the pipeline robust against mislabeled uploads: a
     * ".sldprt"-named STEP file is a STEP and WILL render; a zero-byte or
     * text-junk file is rejected with a precise message at upload time instead
     * of producing a doomed conversion job or a broken viewer experience.
     */
    private String detectTrueType(Path storedFile, String declaredExt) {
        try {
            CadContentSniffer.Format sniffed = CadContentSniffer.sniff(storedFile);
            switch (sniffed) {
                case EMPTY:
                    throw new IllegalArgumentException(
                        "Uploaded file is empty — it cannot contain any 3D geometry.");
                case STEP, IGES, GLB, GLTF_JSON, STL_ASCII, STL_BINARY, OBJ, PLY, COLLADA,
                     THREE_DS, VRML, THREE_MF, FBX, BREP, PDF, SVG, DWG, DXF: {
                    String trueExt = CadContentSniffer.toExtension(sniffed);
                    if (trueExt != null) {
                        String declaredNorm = declaredExt == null ? "" : declaredExt.replace(".", "").toLowerCase();
                        // glTF JSON uploaded as .gltf is already correct; only
                        // CORRECT when the content signature disagrees.
                        if (!trueExt.equals(declaredNorm)) {
                            log.info("Uploaded file declared '{}' but content is '{}' — using true type.",
                                declaredNorm, trueExt);
                        }
                        // Only accept the corrected type if the pipeline allows it.
                        if (ALLOWED_EXTENSIONS.contains("." + trueExt)) {
                            return "." + trueExt;
                        }
                    }
                    return declaredExt;
                }
                case BINARY:
                    // Opaque binary: keep the declared extension (SLDPRT/SLDASM
                    // etc. are legitimate binaries). Zero-length was already rejected.
                    return declaredExt;
                case UNKNOWN:
                default:
                    // Unrecognised content: keep the declared extension only for
                    // formats whose bytes carry no reliable public signature
                    // (SolidWorks parts/assemblies, ACIS SAT and the native vendor
                    // CAD kernels are opaque text/binary with no magic we can
                    // trust). Everything else fails fast — the converter would
                    // reject it anyway, with far less context for the operator.
                    if (declaredExt != null && ALLOWED_EXTENSIONS.contains(declaredExt)
                            && (declaredExt.equals(".sldprt") || declaredExt.equals(".sldasm")
                                || declaredExt.equals(".sat")
                                || CadFileTypes.isRecognisedStoredOnly(declaredExt))) {
                        return declaredExt;
                    }
                    throw new IllegalArgumentException(
                        "Uploaded file content does not match any known 3D model format "
                        + "(declared type: " + declaredExt + ").");
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Content sniffing failed for {} — trusting declared extension", storedFile, e);
            return declaredExt;
        }
    }

    private void recordHistory(Model model, String action, ModelStatus from, ModelStatus to, String performedBy, String remarks) {
        ModelHistory history = ModelHistory.builder()
            .model(model)
            .action(action)
            .fromStatus(from)
            .toStatus(to)
            .performedBy(performedBy)
            .performedAt(Instant.now())
            .remarks(remarks)
            .build();
        historyRepository.save(history);
    }

    private synchronized String generateModelNumber() {
        Optional<String> latest = modelRepository.findLatestModelNumber();
        int nextNum = 1;
        if (latest.isPresent()) {
            String num = latest.get().replace("MDL-", "");
            try {
                nextNum = Integer.parseInt(num) + 1;
            } catch (NumberFormatException e) {
                nextNum = 1;
            }
        }
        return String.format("MDL-%04d", nextNum);
    }

    private String mapSortField(String frontendField) {
        return switch (frontendField.toLowerCase()) {
            case "modelnumber", "model_number" -> "modelNumber";
            case "createdat", "created_at" -> "createdAt";
            case "uploadeddate", "uploaded_date" -> "uploadedDate";
            case "verificationstatus", "verification_status" -> "verificationStatus";
            case "filename", "file_name" -> "fileName";
            case "workorderid", "work_order_id" -> "workOrderId";
            default -> "createdAt";
        };
    }
}
