package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.production.DrawingDTO;
import com.vishatech.erp.dto.production.DrawingHistoryDTO;
import com.vishatech.erp.dto.production.DrawingStatsDTO;
import com.vishatech.erp.entity.production.Drawing;
import com.vishatech.erp.entity.production.DrawingHistory;
import com.vishatech.erp.entity.production.DrawingStatus;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.production.DrawingHistoryRepository;
import com.vishatech.erp.repository.production.DrawingRepository;
import com.vishatech.erp.util.UploadStreams;
import com.vishatech.erp.util.production.OrderMapper;
import jakarta.persistence.EntityManager;
import org.springframework.beans.factory.annotation.Value;
import java.util.NoSuchElementException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Service for managing Drawing records.
 * Implements file storage, workflow validation, and business logic.
 */
@Service
@Transactional
public class DrawingService {

    private final DrawingRepository drawingRepository;
    private final DrawingHistoryRepository historyRepository;
    private final EntityManager entityManager;

    @Value("${app.storage.drawings:./uploads/drawings}")
    private String storagePath;

    /**
     * 2D drawing formats. Raster/PDF/SVG formats are the ones the browser can
     * render on its own; the CAD/plot formats (DWG, DXF, DGN, PLT, HPGL, HPG,
     * CGM, EPS, AI) are accepted and stored for the plant's downstream CAD tools
     * — this module has no 2D vector converter, so they are stored/downloadable
     * and never claim an in-app preview.
     */
    private static final List<String> ALLOWED_EXTENSIONS = List.of(
        ".pdf", ".dwg", ".dxf", ".dgn", ".plt", ".hpgl", ".hpg", ".cgm", ".eps", ".ai",
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".svg");
    private static final long MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

    private static final java.util.logging.Logger log =
            java.util.logging.Logger.getLogger(DrawingService.class.getName());

    /** Drawing verification events — gated by Production Settings → Notifications. */
    private final ProductionNotificationPublisher notificationPublisher;

    public DrawingService(DrawingRepository drawingRepository,
                          DrawingHistoryRepository historyRepository,
                          EntityManager entityManager,
                          ProductionNotificationPublisher notificationPublisher) {
        this.drawingRepository = drawingRepository;
        this.historyRepository = historyRepository;
        this.entityManager = entityManager;
        this.notificationPublisher = notificationPublisher;
    }

    // ========================
    // CRUD Operations
    // ========================

    /**
     * Create a new Drawing with file upload.
     */
    public DrawingDTO createDrawing(DrawingDTO request, MultipartFile file) throws IOException {
        // Validate
        validateRequest(request);

        // Use user-provided drawing number if given, otherwise generate one
        String drawingNumber = (request.getDrawingNumber() != null && !request.getDrawingNumber().isBlank())
            ? request.getDrawingNumber()
            : generateDrawingNumber();

        // Save file if provided
        String filePath = null;
        String fileName = null;
        String fileType = null;
        Long fileSize = null;
        String fileChecksum = null;

        if (file != null && !file.isEmpty()) {
            validateFile(file);
            // Stored and hashed in one bounded-buffer pass — the upload is never
            // materialised in the heap.
            UploadStreams.StoredFile stored = saveFile(file, drawingNumber);
            filePath = stored.pathString();
            fileName = file.getOriginalFilename();
            fileType = getFileExtension(fileName);
            fileSize = stored.size();
            fileChecksum = stored.sha256();
        }

        Drawing drawing = Drawing.builder()
            .drawingNumber(drawingNumber)
            .workOrderId(request.getWorkOrderId())
            .workOrderItemId(request.getWorkOrderItemId())
            .itemName(request.getItemName())
            .drawingRevision(request.getDrawingRevision() != null ? request.getDrawingRevision() : "Rev A")
            .fileName(fileName)
            .fileType(fileType)
            .filePath(filePath)
            .fileSize(fileSize)
            .fileChecksum(fileChecksum)
            .uploadedBy(request.getUploadedBy())
            .uploadedDate(Instant.now())
            .verificationStatus(DrawingStatus.PENDING)
            .createdBy(request.getCreatedBy())
            .build();

        drawing = drawingRepository.save(drawing);

        // Record history
        recordHistory(drawing, "Created", null, DrawingStatus.PENDING, request.getCreatedBy(), "Drawing created.");

        publishEvent(ProductionNotificationPublisher.DWG_PENDING, drawing, "Drawing awaiting verification",
                "Drawing " + label(drawing) + " was uploaded and is awaiting verification.");

        entityManager.flush();
        entityManager.clear();
        return OrderMapper.toDrawingDTO(drawingRepository.findById(drawing.getId()).orElse(drawing));
    }

    /**
     * Update Drawing metadata (not file).
     */
    public DrawingDTO updateDrawing(Long id, DrawingDTO request) {
        Drawing drawing = drawingRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Drawing not found with id: " + id));

        // Only allow editing in Pending status
        if (drawing.getVerificationStatus() != DrawingStatus.PENDING) {
            throw new BadRequestException("Can only edit Drawings in Pending status");
        }

        if (request.getWorkOrderId() != null) drawing.setWorkOrderId(request.getWorkOrderId());
        if (request.getWorkOrderItemId() != null) drawing.setWorkOrderItemId(request.getWorkOrderItemId());
        if (request.getItemName() != null) drawing.setItemName(request.getItemName());
        if (request.getDrawingRevision() != null) drawing.setDrawingRevision(request.getDrawingRevision());
        if (request.getUploadedBy() != null) drawing.setUploadedBy(request.getUploadedBy());
        if (request.getUpdatedBy() != null) drawing.setUpdatedBy(request.getUpdatedBy());

        drawing = drawingRepository.save(drawing);
        recordHistory(drawing, "Updated", null, null, request.getUpdatedBy(), "Drawing metadata updated.");

        return OrderMapper.toDrawingDTO(drawing);
    }

    /**
     * Replace the file for an existing Drawing.
     */
    public DrawingDTO updateDrawingFile(Long id, MultipartFile file, String performedBy) throws IOException {
        Drawing drawing = drawingRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Drawing not found with id: " + id));

        if (file != null && !file.isEmpty()) {
            validateFile(file);

            // Delete old file if exists
            if (drawing.getFilePath() != null) {
                deleteFile(drawing.getFilePath());
            }

            UploadStreams.StoredFile stored = saveFile(file, drawing.getDrawingNumber());
            drawing.setFileName(file.getOriginalFilename());
            drawing.setFileType(getFileExtension(file.getOriginalFilename()));
            drawing.setFilePath(stored.pathString());
            drawing.setFileSize(stored.size());
            drawing.setFileChecksum(stored.sha256());
            drawing.setUploadedBy(performedBy);
            drawing.setUploadedDate(Instant.now());

            drawing = drawingRepository.save(drawing);
            recordHistory(drawing, "File Updated", null, null, performedBy, "Drawing file replaced.");
        }

        return OrderMapper.toDrawingDTO(drawing);
    }

    /**
     * Delete a Drawing.
     */
    public void deleteDrawing(Long id) {
        Drawing drawing = drawingRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Drawing not found with id: " + id));

        // Delete file if exists
        if (drawing.getFilePath() != null) {
            deleteFile(drawing.getFilePath());
        }

        historyRepository.deleteByDrawingId(id);
        drawingRepository.delete(drawing);
    }

    /**
     * Get a Drawing by id.
     */
    @Transactional(readOnly = true)
    public DrawingDTO getDrawing(Long id) {
        Drawing drawing = drawingRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Drawing not found with id: " + id));
        return OrderMapper.toDrawingDTO(drawing);
    }

    /**
     * Get all Drawings with pagination, search, and filters.
     */
    @Transactional(readOnly = true)
    public Page<DrawingDTO> getAllDrawings(
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

        Page<Drawing> result;
        boolean hasFilters = (status != null && !status.isBlank()) || (workOrderId != null && !workOrderId.isBlank());

        if (hasFilters) {
            result = drawingRepository.findFiltered(
                search,
                status != null && !status.isBlank() ? DrawingStatus.fromDisplayName(status) : null,
                workOrderId,
                pageRequest
            );
        } else {
            result = drawingRepository.searchDrawings(search, pageRequest);
        }

        return result.map(OrderMapper::toDrawingDTO);
    }

    /**
     * Get Drawings for a Work Order.
     */
    @Transactional(readOnly = true)
    public List<DrawingDTO> getDrawingsForOrder(String workOrderId) {
        return drawingRepository.findByWorkOrderId(workOrderId).stream()
            .map(OrderMapper::toDrawingDTO)
            .collect(Collectors.toList());
    }

    /**
     * Get Drawings for a specific Work Order Item.
     */
    @Transactional(readOnly = true)
    public List<DrawingDTO> getDrawingsForItem(String workOrderId, String workOrderItemId) {
        return drawingRepository.findByWorkOrderIdAndWorkOrderItemId(workOrderId, workOrderItemId).stream()
            .map(OrderMapper::toDrawingDTO)
            .collect(Collectors.toList());
    }

    // ========================
    // Verification Workflow
    // ========================

    /**
     * Verify a Drawing.
     */
    public DrawingDTO verify(Long id, String performedBy, String remarks) {
        Drawing drawing = drawingRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Drawing not found with id: " + id));

        DrawingStatus oldStatus = drawing.getVerificationStatus();
        if (oldStatus != DrawingStatus.PENDING) {
            throw new BadRequestException("Can only verify Drawings in Pending status");
        }

        drawing.setVerificationStatus(DrawingStatus.VERIFIED);
        drawing.setVerifiedBy(performedBy);
        drawing.setVerificationDateTime(Instant.now());
        if (remarks != null && !remarks.isBlank()) {
            drawing.setVerificationRemarks(remarks);
        }

        drawing = drawingRepository.save(drawing);
        recordHistory(drawing, "Verified", oldStatus, DrawingStatus.VERIFIED, performedBy, remarks);

        publishEvent(ProductionNotificationPublisher.DWG_APPROVED, drawing, "Drawing approved",
                "Drawing " + label(drawing) + " was verified by " + safeUser(performedBy) + ".");
        return OrderMapper.toDrawingDTO(drawing);
    }

    /**
     * Reject a Drawing.
     */
    public DrawingDTO reject(Long id, String performedBy, String remarks) {
        Drawing drawing = drawingRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Drawing not found with id: " + id));

        DrawingStatus oldStatus = drawing.getVerificationStatus();
        if (oldStatus != DrawingStatus.PENDING) {
            throw new BadRequestException("Can only reject Drawings in Pending status");
        }

        drawing.setVerificationStatus(DrawingStatus.REJECTED);
        drawing.setVerifiedBy(performedBy);
        drawing.setVerificationDateTime(Instant.now());
        if (remarks != null && !remarks.isBlank()) {
            drawing.setVerificationRemarks(remarks);
        }

        drawing = drawingRepository.save(drawing);
        recordHistory(drawing, "Rejected", oldStatus, DrawingStatus.REJECTED, performedBy, remarks);

        publishEvent(ProductionNotificationPublisher.DWG_REJECTED, drawing, "Drawing rejected",
                "Drawing " + label(drawing) + " was rejected by " + safeUser(performedBy)
                        + reasonSuffix(remarks));
        return OrderMapper.toDrawingDTO(drawing);
    }

    /* ========================
     * Notifications
     * ======================== */

    /**
     * Publishes a drawing event through the shared notification system.
     *
     * <p>The occurrence discriminator is the number of history rows, so a
     * re-uploaded drawing that is verified again notifies again while a replayed
     * publish of the same transition is suppressed.
     */
    private void publishEvent(String event, Drawing drawing, String title, String message) {
        try {
            int occurrence = getHistory(drawing.getId()).size();
            notificationPublisher.publish(event, ProductionNotificationPublisher.REF_DRAWING,
                    drawing.getId(), title, message, "NORMAL", occurrence);
        } catch (Exception e) {
            log.warning("Drawing notification skipped [drawing=" + drawing.getId() + "]: " + e.getMessage());
        }
    }

    private static String label(Drawing drawing) {
        if (drawing.getDrawingNumber() != null && !drawing.getDrawingNumber().isBlank()) {
            return drawing.getDrawingNumber();
        }
        return "#" + drawing.getId();
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
    // File Operations
    // ========================

    /**
     * Get file path for download.
     */
    @Transactional(readOnly = true)
    public Path getFilePath(Long id) {
        Drawing drawing = drawingRepository.findById(id)
            .orElseThrow(() -> new NoSuchElementException("Drawing not found with id: " + id));

        if (drawing.getFilePath() == null) {
            throw new BadRequestException("No file attached to this drawing");
        }

        Path path = Paths.get(drawing.getFilePath());
        if (!Files.exists(path)) {
            throw new BadRequestException("Drawing file not found on disk");
        }

        return path;
    }

    // ========================
    // Statistics
    // ========================

    @Transactional(readOnly = true)
    public DrawingStatsDTO getStatistics() {
        return DrawingStatsDTO.builder()
            .total(drawingRepository.countAll())
            .pending(drawingRepository.countPending())
            .verified(drawingRepository.countVerified())
            .rejected(drawingRepository.countRejected())
            .build();
    }

    // ========================
    // History
    // ========================

    @Transactional(readOnly = true)
    public List<DrawingHistoryDTO> getHistory(Long drawingId) {
        return historyRepository.findByDrawingIdOrderByPerformedAtDesc(drawingId).stream()
            .map(OrderMapper::toDrawingHistoryDTO)
            .collect(Collectors.toList());
    }

    // ========================
    // Private Helpers
    // ========================

    private void validateRequest(DrawingDTO request) {
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
            throw new IllegalArgumentException("File size exceeds maximum allowed size (50MB)");
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

    private UploadStreams.StoredFile saveFile(MultipartFile file, String drawingNumber) throws IOException {
        Path storageDir = Paths.get(storagePath);
        if (!Files.exists(storageDir)) {
            Files.createDirectories(storageDir);
        }

        String ext = getFileExtension(file.getOriginalFilename());
        String safeName = drawingNumber + "_" + UUID.randomUUID().toString().substring(0, 8) + ext;
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
            // Log but don't fail - file might already be deleted
        }
    }

    private String getFileExtension(String filename) {
        if (filename == null) return "";
        int idx = filename.lastIndexOf('.');
        return idx >= 0 ? filename.substring(idx).toLowerCase() : "";
    }

    private void recordHistory(Drawing drawing, String action, DrawingStatus from, DrawingStatus to, String performedBy, String remarks) {
        DrawingHistory history = DrawingHistory.builder()
            .drawing(drawing)
            .action(action)
            .fromStatus(from)
            .toStatus(to)
            .performedBy(performedBy)
            .performedAt(Instant.now())
            .remarks(remarks)
            .build();
        historyRepository.save(history);
    }

    private synchronized String generateDrawingNumber() {
        Optional<String> latest = drawingRepository.findLatestDrawingNumber();
        int nextNum = 1;
        if (latest.isPresent()) {
            String num = latest.get().replace("DRG-", "");
            try {
                nextNum = Integer.parseInt(num) + 1;
            } catch (NumberFormatException e) {
                nextNum = 1;
            }
        }
        return String.format("DRG-%04d", nextNum);
    }

    private String mapSortField(String frontendField) {
        return switch (frontendField.toLowerCase()) {
            case "drawingnumber", "drawing_number" -> "drawingNumber";
            case "createdat", "created_at" -> "createdAt";
            case "uploadeddate", "uploaded_date" -> "uploadedDate";
            case "verificationstatus", "verification_status" -> "verificationStatus";
            case "filename", "file_name" -> "fileName";
            case "workorderid", "work_order_id" -> "workOrderId";
            default -> "createdAt";
        };
    }
}
