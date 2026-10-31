package com.vishatech.erp.controller.production;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.production.DrawingDTO;
import com.vishatech.erp.dto.production.DrawingHistoryDTO;
import com.vishatech.erp.dto.production.DrawingStatsDTO;
import com.vishatech.erp.dto.production.PagedResponse;
import com.vishatech.erp.sales.api.AttachmentStorePort;
import com.vishatech.erp.service.production.DrawingService;
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
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * REST controller for Drawing records.
 */
@RestController
@RequestMapping("/drawings")
@PreAuthorize("hasAuthority('PRODUCTION_VIEW')")
public class DrawingController {    private static final String MODULE = "DRAWING";

    private final DrawingService drawingService;
    private final ProductionAttachmentService attachmentService;

    public DrawingController(DrawingService drawingService,
                             ProductionAttachmentService attachmentService) {
        this.drawingService = drawingService;
        this.attachmentService = attachmentService;
    }

    // ========================
    // CRUD
    // ========================

    /**
     * GET /api/drawings
     * List drawings with pagination, search, and filters.
     */
    @GetMapping
    public ResponseEntity<ApiResponse<PagedResponse<DrawingDTO>>> listDrawings(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String workOrderId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "desc") String direction) {

        Page<DrawingDTO> result = drawingService.getAllDrawings(
            search, status, workOrderId, page, size, sort, direction
        );

        PagedResponse<DrawingDTO> pagedResponse = PagedResponse.<DrawingDTO>builder()
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

    /**
     * GET /api/drawings/{id}
     * Get a single drawing by id.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<DrawingDTO>> getDrawing(@PathVariable Long id) {
        DrawingDTO drawing = drawingService.getDrawing(id);
        return ResponseEntity.ok(ApiResponse.ok(drawing));
    }

    /**
     * POST /api/drawings (multipart)
     * Create a new drawing with file upload.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<DrawingDTO>> createDrawing(
            @RequestPart("drawing") DrawingDTO request,
            @RequestPart(value = "file", required = false) MultipartFile file) throws IOException {
        DrawingDTO drawing = drawingService.createDrawing(request, file);
        return ResponseEntity.ok(ApiResponse.ok("Drawing created.", drawing));
    }

    /**
     * POST /api/drawings (JSON)
     * Create a new drawing from JSON (no file upload).
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ApiResponse<DrawingDTO>> createDrawingJson(
            @RequestBody DrawingDTO request) throws IOException {
        DrawingDTO drawing = drawingService.createDrawing(request, null);
        return ResponseEntity.ok(ApiResponse.ok("Drawing created.", drawing));
    }

    /**
     * PUT /api/drawings/{id}
     * Update drawing metadata.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<DrawingDTO>> updateDrawing(
            @PathVariable Long id,
            @RequestBody DrawingDTO request) {
        DrawingDTO drawing = drawingService.updateDrawing(id, request);
        return ResponseEntity.ok(ApiResponse.ok("Drawing updated.", drawing));
    }

    /**
     * PUT /api/drawings/{id}/file
     * Replace the drawing file.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")
    @PutMapping(value = "/{id}/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<DrawingDTO>> updateDrawingFile(
            @PathVariable Long id,
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false, defaultValue = "System") String performedBy) throws IOException {
        DrawingDTO drawing = drawingService.updateDrawingFile(id, file, performedBy);
        return ResponseEntity.ok(ApiResponse.ok("Drawing file updated.", drawing));
    }

    /**
     * DELETE /api/drawings/{id}
     * Delete a drawing.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_DELETE')")
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteDrawing(@PathVariable Long id) {
        drawingService.deleteDrawing(id);
        return ResponseEntity.ok(ApiResponse.ok("Drawing deleted.", null));
    }

    // ========================
    // Verification
    // ========================

    /**
     * POST /api/drawings/{id}/verify
     * Verify a drawing.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/verify")
    public ResponseEntity<ApiResponse<DrawingDTO>> verifyDrawing(
            @PathVariable Long id,
            @RequestBody(required = false) java.util.Map<String, String> body) {
        String performedBy = body != null ? body.get("performedBy") : null;
        String remarks = body != null ? body.get("remarks") : null;
        DrawingDTO drawing = drawingService.verify(id, performedBy, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Drawing verified.", drawing));
    }

    /**
     * POST /api/drawings/{id}/reject
     * Reject a drawing.
     */
    @PreAuthorize("hasAuthority('PRODUCTION_CREATE')")
    @PostMapping("/{id}/reject")
    public ResponseEntity<ApiResponse<DrawingDTO>> rejectDrawing(
            @PathVariable Long id,
            @RequestBody(required = false) java.util.Map<String, String> body) {
        String performedBy = body != null ? body.get("performedBy") : null;
        String remarks = body != null ? body.get("remarks") : null;
        DrawingDTO drawing = drawingService.reject(id, performedBy, remarks);
        return ResponseEntity.ok(ApiResponse.ok("Drawing rejected.", drawing));
    }

    // ========================
    // File Operations
    // ========================

    /**
     * GET /api/drawings/{id}/download
     * Download the drawing file.
     */
    @GetMapping("/{id}/download")
    public ResponseEntity<Resource> downloadDrawing(@PathVariable Long id) {
        Path filePath = drawingService.getFilePath(id);
        DrawingDTO drawing = drawingService.getDrawing(id);

        Resource resource = new FileSystemResource(filePath.toFile());

        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + drawing.getFileName() + "\"")
            .body(resource);
    }

    // ========================
    // File Viewer (inline)
    // ========================

    /**
     * GET /api/drawings/{id}/file
     * Serve the drawing file inline for browser viewing.
     * PDFs open in browser PDF viewer, images display inline.
     */
    @GetMapping("/{id}/file")
    public ResponseEntity<Resource> viewDrawingFile(@PathVariable Long id) {
        Path filePath = drawingService.getFilePath(id);
        DrawingDTO drawing = drawingService.getDrawing(id);

        Resource resource = new FileSystemResource(filePath.toFile());

        // Determine content type based on file extension
        MediaType contentType = MediaType.APPLICATION_OCTET_STREAM;
        String ext = drawing.getFileType();
        if (ext != null) {
            ext = ext.toLowerCase();
            if (ext.contains("pdf") || ext.equals(".pdf")) {
                contentType = MediaType.APPLICATION_PDF;
            } else if (ext.contains("png") || ext.equals(".png")) {
                contentType = MediaType.IMAGE_PNG;
            } else if (ext.contains("jpg") || ext.contains("jpeg") || ext.equals(".jpg") || ext.equals(".jpeg")) {
                contentType = MediaType.IMAGE_JPEG;
            } else if (ext.contains("dwg")) {
                contentType = MediaType.parseMediaType("application/acad");
            } else if (ext.contains("dxf")) {
                contentType = MediaType.parseMediaType("application/dxf");
            }
        }

        return ResponseEntity.ok()
            .contentType(contentType)
            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + drawing.getFileName() + "\"")
            .body(resource);
    }

    // ========================
    // Statistics
    // ========================

    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<DrawingStatsDTO>> getStats() {
        DrawingStatsDTO stats = drawingService.getStatistics();
        return ResponseEntity.ok(ApiResponse.ok(stats));
    }

    // ========================
    // History
    // ========================

    @GetMapping("/{id}/history")
    public ResponseEntity<ApiResponse<List<DrawingHistoryDTO>>> getHistory(@PathVariable Long id) {
        List<DrawingHistoryDTO> history = drawingService.getHistory(id);
        return ResponseEntity.ok(ApiResponse.ok(history));
    }

    // ========================
    // Work Order Queries
    // ========================

    @GetMapping("/work-order/{workOrderId}")
    public ResponseEntity<ApiResponse<List<DrawingDTO>>> getDrawingsForOrder(
            @PathVariable String workOrderId) {
        List<DrawingDTO> drawings = drawingService.getDrawingsForOrder(workOrderId);
        return ResponseEntity.ok(ApiResponse.ok(drawings));
    }

    @GetMapping("/work-order/{workOrderId}/item/{itemId}")
    public ResponseEntity<ApiResponse<List<DrawingDTO>>> getDrawingsForItem(
            @PathVariable String workOrderId, @PathVariable String itemId) {
        List<DrawingDTO> drawings = drawingService.getDrawingsForItem(workOrderId, itemId);
        return ResponseEntity.ok(ApiResponse.ok(drawings));
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
