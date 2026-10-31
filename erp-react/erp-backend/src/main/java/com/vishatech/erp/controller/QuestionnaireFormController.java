package com.vishatech.erp.controller;

import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.dto.QuestionnaireFormListResponse;
import com.vishatech.erp.dto.QuestionnaireFormRequest;
import com.vishatech.erp.dto.QuestionnaireFormResponse;
import com.vishatech.erp.entity.QFormAttachment;
import com.vishatech.erp.repository.QFormAttachmentRepository;
import com.vishatech.erp.service.FileStorageService;
import com.vishatech.erp.service.QuestionnaireFormService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.access.prepost.PreAuthorize;

/**
 * REST API for the Offline Marketing Questionnaire Form.
 *
 * <p>Endpoints follow the project's naming conventions:
 *   /marketing/q-forms/**
 *
 * <p>All endpoints require authentication (SecurityConfig).
 */
@RestController
@RequestMapping("/marketing/q-forms")
@PreAuthorize("isAuthenticated()")
public class QuestionnaireFormController {

    private final QuestionnaireFormService qFormService;
    private final FileStorageService fileStorageService;
    private final QFormAttachmentRepository attachmentRepository;

    public QuestionnaireFormController(QuestionnaireFormService qFormService,
                                        FileStorageService fileStorageService,
                                        QFormAttachmentRepository attachmentRepository) {
        this.qFormService = qFormService;
        this.fileStorageService = fileStorageService;
        this.attachmentRepository = attachmentRepository;
    }

    // ============================== CRUD ====================================

    @PostMapping
    public ResponseEntity<ApiResponse<QuestionnaireFormResponse>> create(
            @Valid @RequestBody QuestionnaireFormRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(qFormService.create(request)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<QuestionnaireFormResponse>> get(@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.ok(qFormService.get(id)));
    }

    @GetMapping("/by-visit/{visitId}")
    public ResponseEntity<ApiResponse<QuestionnaireFormResponse>> getByVisitId(@PathVariable Long visitId) {
        QuestionnaireFormResponse form = qFormService.getByVisitId(visitId);
        if (form == null) {
            return ResponseEntity.ok(new ApiResponse<>(true, "OK", null));
        }
        return ResponseEntity.ok(ApiResponse.ok(form));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<QuestionnaireFormResponse>> update(
            @PathVariable Long id,
            @Valid @RequestBody QuestionnaireFormRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(qFormService.update(id, request)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long id) {
        qFormService.delete(id);
        return ResponseEntity.ok(ApiResponse.ok("Q Form deleted"));
    }

    // ============================== Draft / Submit ===========================

    @PutMapping("/{id}/draft")
    public ResponseEntity<ApiResponse<QuestionnaireFormResponse>> saveDraft(
            @PathVariable Long id,
            @Valid @RequestBody QuestionnaireFormRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(qFormService.saveDraft(id, request)));
    }

    @PostMapping("/{id}/draft")
    public ResponseEntity<ApiResponse<QuestionnaireFormResponse>> saveDraftPost(
            @PathVariable Long id,
            @Valid @RequestBody QuestionnaireFormRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(qFormService.saveDraft(id, request)));
    }

    @PutMapping("/{id}/submit")
    public ResponseEntity<ApiResponse<QuestionnaireFormResponse>> submit(
            @PathVariable Long id,
            @Valid @RequestBody QuestionnaireFormRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(qFormService.submit(id, request)));
    }

    @PostMapping("/{id}/submit")
    public ResponseEntity<ApiResponse<QuestionnaireFormResponse>> submitPost(
            @PathVariable Long id,
            @Valid @RequestBody QuestionnaireFormRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(qFormService.submit(id, request)));
    }

    // ============================== Signatures ===============================

    @PutMapping("/{id}/signature/marketing-lead")
    public ResponseEntity<ApiResponse<QuestionnaireFormResponse>> saveMarketingLeadSignature(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(
                qFormService.saveMarketingLeadSignature(id, body.get("signature"))));
    }

    @PutMapping("/{id}/signature/authority")
    public ResponseEntity<ApiResponse<QuestionnaireFormResponse>> saveAuthoritySignature(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.ok(
                qFormService.saveAuthoritySignature(id, body.get("signature"))));
    }

    // ============================== Attachments ==============================

    @PostMapping("/{id}/attachments")
    public ResponseEntity<ApiResponse<QFormAttachment>> uploadAttachment(
            @PathVariable Long id,
            @RequestPart("file") MultipartFile file,
            @RequestPart(value = "label", required = false) String label) {
        String storedName = fileStorageService.store(file);
        QFormAttachment attachment = new QFormAttachment();
        attachment.setFormId(id);
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setLabel(label);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.ok(attachmentRepository.save(attachment)));
    }

    @DeleteMapping("/{id}/attachments/{attachmentId}")
    public ResponseEntity<ApiResponse<Void>> deleteAttachment(
            @PathVariable Long id,
            @PathVariable Long attachmentId) {
        attachmentRepository.deleteById(attachmentId);
        return ResponseEntity.ok(ApiResponse.ok("Attachment deleted"));
    }

    // ============================== List =====================================

    @GetMapping
    public Page<QuestionnaireFormListResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String marketer,
            @RequestParam(required = false) String dateFrom,
            @RequestParam(required = false) String dateTo,
            @RequestParam(required = false) String location) {
        return qFormService.list(page, size, search, sort, status, marketer, dateFrom, dateTo, location);
    }
}
