package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.ModelDTO;
import com.vishatech.erp.dto.production.ModelHistoryDTO;
import com.vishatech.erp.dto.production.ModelStatsDTO;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.sales.api.AttachmentStorePort;
import com.vishatech.erp.service.production.ModelService;
import com.vishatech.erp.service.production.ProductionAttachmentService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.access.prepost.PreAuthorize;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.NoSuchElementException;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * REST controller for Model records (3D CAD models).
 */
@RestController
@RequestMapping("/models")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class ModelController {

    private static final String MODULE = "MODEL";

    private final ModelService modelService;
    private final ProductionAttachmentService attachmentService;

    public ModelController(ModelService modelService,
                           ProductionAttachmentService attachmentService) {
        this.modelService = modelService;
        this.attachmentService = attachmentService;
    }

    // ========================
    // CRUD
    // ========================

    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<ModelDTO>>> listModels(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String workOrderId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "desc") String direction) {

        Page<ModelDTO> result = modelService.getAllModels(
            search, status, workOrderId, page, size, sort, direction
        );

        PagedResponse<ModelDTO> pagedResponse = PagedResponse.<ModelDTO>builder()
            .content(result.getContent())
            .page(result.getNumber())
            .size(result.getSize())
            .totalElements(result.getTotalElements())
            .totalPages(result.getTotalPages())
            .first(result.isFirst())
            .last(result.isLast())
            .build();

        return ResponseEntity.ok(ApiResponse.ok(pagedResponse));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ModelDTO>> getModel(@PathVariable Long id) {
        ModelDTO model = modelService.getModel(id);
        return ResponseEntity.ok(ApiResponse.ok(model));
    }

    /**
     * Lookup model by model number (for cases where numeric ID is not available).
     */
    @GetMapping("/by-model-number/{modelNumber}")
    public ResponseEntity<ApiResponse<ModelDTO>> getModelByNumber(@PathVariable String modelNumber) {
        ModelDTO model = modelService.getModelByNumber(modelNumber);
        return ResponseEntity.ok(ApiResponse.ok(model));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ModelDTO>> createModel(
            @RequestPart("model") ModelDTO request,
            @RequestPart(value = "file", required = false) MultipartFile file) throws IOException {
        ModelDTO model = modelService.createModel(request, file);
        return ResponseEntity.ok(ApiResponse.ok("Model created.", model));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<ModelDTO>> createModelJson(
            @RequestBody ModelDTO request) throws IOException {
        ModelDTO model = modelService.createModel(request, null);
        return ResponseEntity.ok(ApiResponse.ok("Model created.", model));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<ModelDTO>> updateModel(
            @PathVariable Long id,
            @RequestBody ModelDTO request) {
        ModelDTO model = modelService.updateModel(id, request);
        return ResponseEntity.ok(ApiResponse.ok("Model updated.", model));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping(value = "/{id}/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ModelDTO>> updateModelFile(
            @PathVariable Long id,
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false, defaultValue = "System") String performedBy) throws IOException {
        ModelDTO model = modelService.updateModelFile(id, file, performedBy);
        return ResponseEntity.ok(ApiResponse.ok("Model file updated.", model));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteModel(@PathVariable Long id) {
        modelService.deleteModel(id);
        return ResponseEntity.ok(ApiResponse.ok("Model deleted.", null));
    }

    // ========================
    // Verification
    // ========================

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/verify")
    public ResponseEntity<ApiResponse<ModelDTO>> verifyModel(
            @PathVariable Long id,
            @RequestBody(required = false) java.util.Map<String, String> body) {
        String performedBy = body != null ? body.get("performedBy") : null;
        String remarks = body != null ? body.get("remarks") : null;
        ModelDTO model = modelService.verify(id, performedBy, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Model verified.", model));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/reject")
    public ResponseEntity<ApiResponse<ModelDTO>> rejectModel(
            @PathVariable Long id,
            @RequestBody(required = false) java.util.Map<String, String> body) {
        String performedBy = body != null ? body.get("performedBy") : null;
        String remarks = body != null ? body.get("remarks") : null;
        ModelDTO model = modelService.reject(id, performedBy, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Model rejected.", model));
    }

    // ========================
    // File Operations
    // ========================

    /**
     * GET /api/models/{id}/viewer
     * Serve the model file inline for browser viewing.
     * Returns the raw file with appropriate content type for Three.js loaders.
     *
     * NOTE: Proprietary CAD formats (SLDPRT, SLDASM) are NOT exposed here —
     * they must be viewed through the converted representation at /{id}/3d.
     * This keeps the original proprietary file server-side and off the browser.
     */
    @GetMapping("/{id}/viewer")
    public ResponseEntity<Resource> viewModel(@PathVariable Long id) {
        ModelDTO model = modelService.getModel(id);
        String ext = model.getFileType();

        // Block serving proprietary SolidWorks files directly for viewing.
        String ft = (ext == null ? "" : ext).toLowerCase().replace(".", "");
        if ("sldprt".equals(ft) || "sldasm".equals(ft)) {
            throw new IllegalStateException(
                "SLDPRT/SLDASM files cannot be viewed directly. Use the converted 3D view (/3d) instead."
            );
        }

        Path filePath = modelService.getFilePath(id);
        Resource resource = new FileSystemResource(filePath.toFile());

        // Determine content type based on file extension
        MediaType contentType = MediaType.APPLICATION_OCTET_STREAM;
        if (ext != null) {
            ext = ext.toLowerCase();
            if (ext.contains("glb") || ext.endsWith(".glb")) {
                contentType = MediaType.parseMediaType("model/gltf-binary");
            } else if (ext.contains("gltf") || ext.endsWith(".gltf")) {
                contentType = MediaType.parseMediaType("model/gltf+json");
            } else if (ext.contains("stl")) {
                contentType = MediaType.parseMediaType("model/stl");
            }
        }

        return ResponseEntity.ok()
            .contentType(contentType)
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + model.getFileName() + "\"")
            .body(resource);
    }

    /**
     * GET /api/models/{id}/download
     * Download the model file.
     */
    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> downloadModel(@PathVariable Long id) {
        Path filePath = modelService.getFilePath(id);
        ModelDTO model = modelService.getModel(id);

        Resource resource = new FileSystemResource(filePath.toFile());

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + model.getFileName() + "\"")
            .body(resource);
    }

    // ========================
    // 3D Conversion
    // ========================

    /**
     * POST /api/models/{id}/convert
     * Trigger asynchronous CAD conversion (STEP/STP/IGES/IGS -> GLB).
     * Returns 202 Accepted immediately; the conversion runs in the background and
     * the resulting status can be polled via GET /{id} or GET /{id}/conversion-status.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/convert")
    public ResponseEntity<ApiResponse<ModelDTO>> convertModel(@PathVariable Long id) {
        ModelDTO model = modelService.requestConversion(id);
        return ResponseEntity.accepted()
            .body(ApiResponse.ok("Conversion started.", model));
    }

    /**
     * GET /api/models/{id}/conversion-status
     * Returns the current conversion status without a full model payload,
     * including the resolved conversion engine name/availability so the viewer
     * can report the real engine rather than guessing.
     */
    @GetMapping("/{id}/conversion-status")
    public ResponseEntity<ApiResponse<java.util.Map<String, Object>>> conversionStatus(@PathVariable Long id) {
        java.util.Map<String, Object> status = modelService.getConversionStatusDetail(id);
        return ResponseEntity.ok(ApiResponse.ok(status));
    }

    /**
     * GET /api/models/{id}/3d
     * Serve the converted browser-renderable representation (the GLB produced by
     * the CAD conversion engine) for 3D viewing.
     *
     * JWT-protected like every other model endpoint. Only serves the file when
     * the conversion is READY and the converted file exists on disk; anything
     * else returns a clean JSON error (404 unknown model / 409 not ready /
     * 404 missing file). The content type and inline filename are derived from
     * the ACTUAL file on disk; filesystem paths are never exposed.
     */
    @GetMapping("/{id}/3d")
    public ResponseEntity<?> serveConvertedModel(@PathVariable Long id) {
        try {
            modelService.getModel(id);
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("Model not found with id: " + id));
        }

        Path filePath;
        try {
            filePath = modelService.getConvertedFileIfReady(id);
        } catch (IllegalStateException e) {
            String message = e.getMessage() == null ? "Converted 3D model is not available." : e.getMessage();
            HttpStatus status = message.contains("missing from storage")
                ? HttpStatus.NOT_FOUND
                : HttpStatus.CONFLICT;
            return ResponseEntity.status(status).body(ApiResponse.error(message));
        } catch (NoSuchElementException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("Model not found with id: " + id));
        }

        Resource resource = new FileSystemResource(filePath.toFile());
        return ResponseEntity.ok()
            .contentType(mediaTypeForPath(filePath))
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filePath.getFileName() + "\"")
            .body(resource);
    }

    /**
     * GET /api/models/{id}/preview
     * Serve the single browser-renderable representation of a model.
     *
     * This is the unified accessor the viewer uses to obtain renderable bytes:
     *  - browser-native formats (GLB/GLTF/STL/OBJ)  -> the original file
     *  - CAD formats with a READY conversion         -> the converted representation
     *  - CAD formats without a conversion            -> 409 Conflict with a clean,
     *    human-readable body (never the raw proprietary bytes, so a binary CAD
     *    file can never reach a JSON/browser parser).
     */
    @GetMapping("/{id}/preview")
    public ResponseEntity<?> previewModel(@PathVariable Long id) {
        ModelDTO model = modelService.getModel(id);
        String ft = model.getFileType();

        // For browser-native formats, the original file is the preview.
        if (modelService.isBrowserNative(ft)) {
            Path filePath = modelService.getFilePath(id);
            return ResponseEntity.ok()
                .contentType(mediaTypeForPath(filePath))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filePath.getFileName() + "\"")
                .body(new FileSystemResource(filePath.toFile()));
        }

        // For CAD formats, serve the converted representation when available.
        try {
            Path converted = modelService.getConvertedFilePath(id);
            return ResponseEntity.ok()
                .contentType(mediaTypeForPath(converted))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + converted.getFileName() + "\"")
                .body(new FileSystemResource(converted.toFile()));
        } catch (IllegalStateException e) {
            java.util.Map<String, Object> body = new java.util.LinkedHashMap<>();
            body.put("success", false);
            body.put("previewAvailable", false);
            body.put("message", "3D preview unavailable for this file type.");
            body.put("detail", e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT.value()).body(body);
        }
    }

    /**
     * Map a file path to the appropriate 3D content type based on its
     * actual extension (never the model's reported type).
     */
    private static MediaType mediaTypeForPath(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        if (name.endsWith(".glb")) {
            return MediaType.parseMediaType("model/gltf-binary");
        } else if (name.endsWith(".gltf")) {
            return MediaType.parseMediaType("model/gltf+json");
        } else if (name.endsWith(".stl")) {
            return MediaType.parseMediaType("model/stl");
        } else if (name.endsWith(".obj")) {
            return MediaType.parseMediaType("model/obj");
        }
        return MediaType.APPLICATION_OCTET_STREAM;
    }

    // ========================
    // Statistics
    // ========================

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<ModelStatsDTO>> getStats() {
        ModelStatsDTO stats = modelService.getStatistics();
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }

    // ========================
    // History
    // ========================

    @GetMapping("/{id}/history")
    public ResponseEntity<ApiResponse<List<ModelHistoryDTO>>> getHistory(@PathVariable Long id) {
        List<ModelHistoryDTO> history = modelService.getHistory(id);
        return ResponseEntity.ok(ApiResponse.ok(history));
    }

    // ========================
    // Work Order Queries
    // ========================

    @GetMapping("/work-order/{workOrderId}")
    public ResponseEntity<ApiResponse<List<ModelDTO>>> getModelsForOrder(
            @PathVariable String workOrderId) {
        List<ModelDTO> models = modelService.getModelsForOrder(workOrderId);
        return ResponseEntity.ok(ApiResponse.ok(models));
    }

    @GetMapping("/work-order/{workOrderId}/item/{itemId}")
    public ResponseEntity<ApiResponse<List<ModelDTO>>> getModelsForItem(
            @PathVariable String workOrderId, @PathVariable String itemId) {
        List<ModelDTO> models = modelService.getModelsForItem(workOrderId, itemId);
        return ResponseEntity.ok(ApiResponse.ok(models));
    }

    // ========================
    // Attachments (stored through the Sales-owned attachment port)
    // ========================

    @GetMapping("/{id}/attachments")
    public ResponseEntity<List<AttachmentStorePort.AttachmentRef>> attachments(@PathVariable Long id) {
        return ResponseEntity.ok(attachmentService.getAttachments(MODULE, id));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<AttachmentStorePort.AttachmentRef>> addAttachment(
            @PathVariable Long id, @RequestParam("file") MultipartFile file) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(attachmentService.addAttachment(MODULE, id, file)));
    }

    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(
            @PathVariable Long id, @PathVariable Long attachmentId) {
        attachmentService.deleteAttachment(MODULE, id, attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }
}
