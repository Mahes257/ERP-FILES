package com.vishatech.erp.service;

import com.vishatech.erp.dto.DocumentRepositoryRequest;
import com.vishatech.erp.dto.DocumentRepositoryResponse;
import com.vishatech.erp.dto.DocumentVersionResponse;
import com.vishatech.erp.entity.DocumentRepositoryEntry;
import com.vishatech.erp.entity.DocumentVersion;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.DocumentRepositoryEntryRepository;
import com.vishatech.erp.repository.DocumentVersionRepository;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.Lead;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class DocumentRepositoryService {

    private static final org.slf4j.Logger LOG =
            org.slf4j.LoggerFactory.getLogger(DocumentRepositoryService.class);

    /**
     * Upper bound for the repository listing page size, matching the Sales
     * listing services ({@code SalesOrderService}, {@code QuotationService}, …)
     * which clamp to 200. Without it a caller could ask for every row in one
     * request, and the in-process visibility filter would then hydrate the whole
     * repository.
     */
    private static final int MAX_PAGE_SIZE = 200;

    private final DocumentRepositoryEntryRepository repository;
    private final DocumentVersionRepository versionRepository;
    private final FileStorageService fileStorageService;
    private final AuditContext auditContext;
    private final DocumentPermissionService permissionService;
    private final DocumentAuditService auditService;
    private final PdfGenerationService pdfGenerationService;
    private final DocumentSettingsService documentSettingsService;
    private final com.vishatech.erp.repository.SalesOrderRepository salesOrderRepository;

    public DocumentRepositoryService(DocumentRepositoryEntryRepository repository,
                                      DocumentVersionRepository versionRepository,
                                      FileStorageService fileStorageService,
                                      AuditContext auditContext,
                                      DocumentPermissionService permissionService,
                                      DocumentAuditService auditService,
                                      PdfGenerationService pdfGenerationService,
                                      DocumentSettingsService documentSettingsService,
                                      com.vishatech.erp.repository.SalesOrderRepository salesOrderRepository) {
        this.repository = repository;
        this.versionRepository = versionRepository;
        this.fileStorageService = fileStorageService;
        this.auditContext = auditContext;
        this.permissionService = permissionService;
        this.auditService = auditService;
        this.pdfGenerationService = pdfGenerationService;
        this.documentSettingsService = documentSettingsService;
        this.salesOrderRepository = salesOrderRepository;
    }

    /**
     * Paged repository listing. {@code scope} optionally restricts the whole
     * query — search, every filter, the total count and the sort — to one ERP
     * area's modules (see {@link DocumentModuleScope}), which is how the Sales
     * module's Documents page shows only Sales-owned documents; an absent/blank
     * scope keeps the unscoped repository listing used elsewhere.
     *
     * @param reusable when true, only rows an operator may reuse as a source for
     *                 "Inside ERP" are returned: the row is not soft-deleted and
     *                 its {@code filePath} resolves to a stored file (a
     *                 {@code metadata-only} record document has nothing to reuse)
     *
     * <p>A scoped listing (the Sales Documents page) returns the ACTIVE
     * repository: soft-deleted rows sit in the trash and archived rows are
     * hidden from active lists, so neither appears unless the caller asks for
     * that status explicitly (Status → Deleted / Archived). Nothing is removed
     * from the repository by this filter — the rows, their files, versions and
     * audit trail are untouched and restorable.
     */
    @Transactional(readOnly = true)
    public Page<DocumentRepositoryResponse> list(int page, int size, String search, String sort,
                                                  String module, String documentType, Long customerId,
                                                  String uploadedBy, String visibility, String status,
                                                  String dateFrom, String dateTo, String scope,
                                                  boolean reusable) {
        Sort springSort = parseSort(sort);
        // Page/size are clamped like every other Sales listing service: a negative
        // page or a non-positive size would otherwise be rejected by PageRequest
        // with an IllegalArgumentException ("Page index must not be less than
        // zero" / "Page size must not be less than one"), and an unbounded size
        // would let one request hydrate the whole repository.
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        Pageable pageable = PageRequest.of(safePage, safeSize, springSort);

        DocumentVisibility vis = parseVisibility(visibility);
        LocalDateTime from = parseDate(dateFrom);
        LocalDateTime to = parseDate(dateTo) != null ? parseDate(dateTo).plusDays(1) : null;

        // Visibility filter pushed into SQL so pagination totals stay accurate.
        User currentUser = auditContext.currentUser();
        List<DocumentVisibility> allowed = permissionService.allowedVisibilities(currentUser);
        if (allowed.isEmpty()) {
            return Page.empty(pageable);
        }
        List<String> scopeModules = DocumentModuleScope.modulesFor(scope);
        // Only the Sales-scoped listing filters the two terminal states out, and
        // only while no explicit status filter asks for them.
        //
        // An ARCHIVED row is not the same thing as "not offered": the "Inside
        // ERP" selection listing (reusable=true) deliberately keeps archived
        // documents in its pool, because their stored file is still on disk and
        // filing it into a Sales context is exactly what that flow is for. The
        // trash is excluded separately (and always) by the reusable predicate.
        boolean activeOnly = !scopeModules.isEmpty() && !reusable
                && (status == null || status.isBlank());
        Page<DocumentRepositoryEntry> result = scopeModules.isEmpty()
                ? repository.searchWithFilters(
                        search, module, documentType, customerId, uploadedBy, vis, status, from, to,
                        allowed, reusable, false, pageable)
                : repository.searchWithFiltersInModules(
                        search, module, documentType, customerId, uploadedBy, vis, status, from, to,
                        allowed, scopeModules, reusable, activeOnly, pageable);

        // Defense-in-depth row filter (same rule, applied in-process).
        List<DocumentRepositoryEntry> filteredContent = result.getContent().stream()
                .filter(permissionService::canView)
                .toList();
        if (filteredContent.size() != result.getContent().size()) {
            result = new org.springframework.data.domain.PageImpl<>(
                    filteredContent, result.getPageable(), result.getTotalElements());
        }

        return result.map(this::toResponse);
    }

    /**
     * Every document belonging to ONE source record (module + relatedRecordId),
     * newest first — used by the Sales/Marketing record Overview pages (e.g.
     * Quotation Overview → Documents) so they show exactly the documents the
     * record owns, without paging through the whole repository. Same permission
     * filtering as {@link #list}.
     */
    @Transactional(readOnly = true)
    public List<DocumentRepositoryResponse> listForRecord(String module, Long relatedRecordId) {
        if (module == null || module.isBlank() || relatedRecordId == null) {
            return List.of();
        }
        User currentUser = auditContext.currentUser();
        return repository.findByModuleIgnoreCaseAndRelatedRecordId(module, relatedRecordId).stream()
                .filter(permissionService::canView)
                .sorted(java.util.Comparator.comparing(
                        DocumentRepositoryEntry::getCreatedAt,
                        java.util.Comparator.nullsLast(java.util.Comparator.reverseOrder())))
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public DocumentRepositoryResponse get(Long id) {
        DocumentRepositoryEntry entry = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canView(entry)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to view this document");
        }
        return toResponse(entry);
    }

    @Transactional
    public DocumentRepositoryResponse create(DocumentRepositoryRequest request) {
        User currentUser = auditContext.currentUser();
        DocumentRepositoryEntry entry = new DocumentRepositoryEntry();
        entry.setDocumentName(request.documentName());
        entry.setDocumentType(request.documentType());
        entry.setModule(request.module());
        entry.setRelatedRecordId(request.relatedRecordId());
        entry.setRecordNumber(request.recordNumber());
        entry.setCustomerId(request.customerId());
        entry.setCustomerName(request.customerName());
        entry.setFilePath("metadata-only");
        entry.setVisibility(request.visibility() != null ? request.visibility()
                : storableDefaultVisibility());
        entry.setStatus("uploaded");
        entry.setDescription(request.description());
        if (currentUser != null) {
            entry.setUploadedBy(auditContext.currentUserName());
            entry.setUploadedById(currentUser.getId());
        }
        entry = repository.save(entry);
        saveInitialVersion(entry, "Record created");
        auditService.record(entry, "CREATED", null, entry);
        return toResponse(entry);
    }

    @Transactional
    public DocumentRepositoryResponse upload(MultipartFile file, String module, Long relatedRecordId,
                                              String recordNumber, Long customerId, String customerName,
                                              String documentType, String visibility, String description,
                                              String uploadedBy) {
        String storedName = fileStorageService.store(file);
        User currentUser = auditContext.currentUser();

        DocumentRepositoryEntry entry = new DocumentRepositoryEntry();
        entry.setDocumentName(file.getOriginalFilename() != null ? file.getOriginalFilename() : "document");
        entry.setDocumentType(documentType != null ? documentType : inferDocumentType(file.getOriginalFilename()));
        entry.setModule(module != null ? module : "General");
        entry.setRelatedRecordId(relatedRecordId);
        entry.setRecordNumber(recordNumber);
        entry.setCustomerId(customerId);
        entry.setCustomerName(customerName);
        entry.setFilePath(storedName);
        entry.setFileType(file.getContentType());
        entry.setFileSize(file.getSize());
        entry.setVisibility(parseVisibility(visibility) != null ? parseVisibility(visibility)
                : storableDefaultVisibility());
        entry.setStatus("uploaded");
        entry.setUploadedBy(uploadedBy != null ? uploadedBy : auditContext.currentUserName());
        if (currentUser != null) entry.setUploadedById(currentUser.getId());
        entry.setDescription(description);

        entry = repository.save(entry);
        saveInitialVersion(entry, "Initial upload");
        auditService.record(entry, "UPLOADED", null, entry);
        return toResponse(entry);
    }

    @Transactional
    public DocumentRepositoryResponse registerGenerated(String documentName, String documentType,
                                                         String module, Long relatedRecordId,
                                                         String recordNumber, Long customerId,
                                                         String customerName, String filePath,
                                                         String fileType, long fileSize,
                                                         DocumentVisibility visibility) {
        DocumentRepositoryEntry entry = new DocumentRepositoryEntry();
        entry.setDocumentName(documentName);
        entry.setDocumentType(documentType);
        entry.setModule(module);
        entry.setRelatedRecordId(relatedRecordId);
        entry.setRecordNumber(recordNumber);
        entry.setCustomerId(customerId);
        entry.setCustomerName(customerName);
        entry.setFilePath(filePath);
        entry.setFileType(fileType);
        entry.setFileSize(fileSize);
        entry.setVisibility(visibility != null ? visibility : storableDefaultVisibility());
        entry.setStatus("generated");
        User currentUser = auditContext.currentUser();
        if (currentUser != null) {
            entry.setUploadedBy(auditContext.currentUserName());
            entry.setUploadedById(currentUser.getId());
        }

        entry = repository.save(entry);
        saveInitialVersion(entry, "Generated document");
        auditService.record(entry, "CREATED", null, entry);
        return toResponse(entry);
    }

    @Transactional
    public void registerFromAttachment(String documentName, String module, Long relatedRecordId,
                                        String recordNumber, Long customerId, String customerName,
                                        String filePath, String fileType, long fileSize,
                                        String uploadedBy, DocumentVisibility visibility) {
        // Duplicate check skipped for performance — filepath is unique by UUID generation

        DocumentRepositoryEntry entry = new DocumentRepositoryEntry();
        entry.setDocumentName(documentName != null ? documentName : "document");
        entry.setDocumentType(inferDocumentType(documentName));
        entry.setModule(module);
        entry.setRelatedRecordId(relatedRecordId);
        entry.setRecordNumber(recordNumber);
        entry.setCustomerId(customerId);
        entry.setCustomerName(customerName);
        entry.setFilePath(filePath);
        entry.setFileType(fileType);
        entry.setFileSize(fileSize);
        entry.setUploadedBy(uploadedBy);
        entry.setVisibility(visibility != null ? visibility : storableDefaultVisibility());
        entry.setStatus("uploaded");
        User currentUser = auditContext.currentUser();
        if (currentUser != null) entry.setUploadedById(currentUser.getId());

        entry = repository.save(entry);
        saveInitialVersion(entry, "Attachment uploaded");
        auditService.record(entry, "UPLOADED", null, entry);
    }

    /**
     * Provenance key written into {@code document_repository.metadata} when a
     * row is a REFERENCE to another repository document (JSON fragment, matched
     * as a LIKE so no JSON parser is needed on either side).
     */
    private static final String REFERENCE_METADATA_KEY = "\"referencedDocumentId\":";

    /**
     * "Inside ERP" — add a document that ALREADY exists in the repository to
     * another repository context by REFERENCING its stored file.
     *
     * The file itself is never touched: {@code filePath}/{@code fileType}/
     * {@code fileSize} are copied from the source row, so the reference serves
     * exactly the same bytes through the same endpoint
     * ({@code GET /documents/{id}/file}) with no second copy on disk, no second
     * upload of the same photo/PDF, and no modification of the source document,
     * its versions or its audit trail. The source's VISIBILITY is copied as
     * well — a reference can therefore never widen who may read the file, it can
     * only keep or narrow it.
     *
     * {@code relatedRecordId} is deliberately NOT copied: the reference lives
     * under a different module, and the record routes resolve a record id
     * against the row's own module, so copying it would point "Open Related
     * Record" at an unrelated record. The record NUMBER and customer are copied
     * because they describe the document's origin truthfully and are what the
     * operator searches by.
     *
     * @param sourceId the existing repository document to reuse
     * @param module   repository module (Sales context) the reference is filed
     *                 under; blank falls back to the source document's own module
     * @throws BadRequestException when the source has no stored file, is
     *                             soft-deleted, its file is missing on disk, or the
     *                             document is already filed under this module
     */
    @Transactional
    public DocumentRepositoryResponse referenceExisting(Long sourceId, String module) {
        DocumentRepositoryEntry source = repository.findById(sourceId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        // The current user must be allowed to READ the file being reused — the
        // same check the file endpoint applies, so selecting can never hand out
        // a document the operator could not otherwise open.
        if (!permissionService.canView(source)) {
            throw new com.vishatech.erp.exception.ForbiddenException(
                    "You do not have permission to use this document");
        }
        if ("deleted".equalsIgnoreCase(source.getStatus())) {
            throw new BadRequestException("A document in the trash cannot be added to the repository");
        }
        String storedName = resolveStoredName(source.getFilePath());
        if (storedName == null) {
            throw new BadRequestException("This document has no stored file to reuse");
        }
        if (!fileStorageService.existsOnDisk(storedName, subdirHints(source.getFilePath()))) {
            throw new BadRequestException("The stored file for this document is missing on the server");
        }
        String targetModule = module != null && !module.isBlank() ? module.trim() : source.getModule();
        // Duplicate guard, keyed on the STORED FILE and the target context.
        //
        // "Already filed" means: this repository context (module) already holds
        // this exact stored file as one of its active documents. The comparison
        // is made on the storage identifier ({@link #resolveStoredName}), never
        // on the document name — two different documents may share a name, and
        // the very same file reaches a row as a bare name, an API path or an
        // absolute URL depending on which flow created it. Archived rows do not
        // block: they are not part of any active list, so filing the file back
        // into the context is the selection's intended effect. Trashed rows are
        // excluded both here and by the caller (a trashed source is refused).
        String targetStoredName = resolveStoredName(source.getFilePath());
        DocumentRepositoryEntry alreadyFiled = repository.findActiveByModule(targetModule).stream()
                .filter(filed -> targetStoredName.equals(resolveStoredName(filed.getFilePath())))
                .findFirst()
                .orElse(null);
        if (alreadyFiled != null) {
            throw new BadRequestException("This document is already in the repository as \""
                    + alreadyFiled.getDocumentName() + "\" (" + alreadyFiled.getModule()
                    + (alreadyFiled.getRecordNumber() != null && !alreadyFiled.getRecordNumber().isBlank()
                        ? " · " + alreadyFiled.getRecordNumber() : "")
                    + ") — no new entry was created.");
        }

        DocumentRepositoryEntry entry = new DocumentRepositoryEntry();
        entry.setDocumentName(source.getDocumentName());
        entry.setDocumentType(source.getDocumentType());
        entry.setModule(targetModule);
        entry.setRecordNumber(source.getRecordNumber());
        entry.setCustomerId(source.getCustomerId());
        entry.setCustomerName(source.getCustomerName());
        entry.setFilePath(source.getFilePath());
        entry.setFileType(source.getFileType());
        entry.setFileSize(source.getFileSize());
        entry.setVisibility(source.getVisibility() != null
                ? source.getVisibility() : storableDefaultVisibility());
        // Keep the source's own nature: a system-generated document stays
        // "generated", an uploaded one stays "uploaded".
        entry.setStatus("generated".equalsIgnoreCase(source.getStatus()) ? "generated" : "uploaded");
        entry.setDescription("Referenced from " + source.getModule() + " document #" + source.getId()
                + " (" + (source.getStatus() == null ? "" : source.getStatus()) + ")"
                + " — the stored file is reused, not uploaded again.");
        entry.setMetadata("{" + REFERENCE_METADATA_KEY + sourceId + "}");
        User currentUser = auditContext.currentUser();
        if (currentUser != null) {
            entry.setUploadedBy(auditContext.currentUserName());
            entry.setUploadedById(currentUser.getId());
        }

        entry = repository.save(entry);
        saveInitialVersion(entry, "Referenced existing ERP document #" + sourceId);
        auditService.record(entry, "REFERENCED", null, entry);
        return toResponse(entry);
    }

    /**
     * Best-effort deletion sync for record documents.
     *
     * Called when a source ERP record is HARD-deleted (permanent delete):
     * every metadata-only record document tied to the record is purged
     * together with its version history and audit trail. Documents that carry
     * an actual stored file are NOT purged here — they stay as the audit
     * record of what was attached/generated and are cleaned up by the
     * reconciliation tooling if their link is truly broken.
     *
     * Runs quietly: any failure is logged and never disturbs the source-record
     * delete operation.
     */
    public void purgeRecordDocumentsQuietly(String module, Long relatedRecordId) {
        try {
            if (module == null || relatedRecordId == null) {
                return;
            }
            List<DocumentRepositoryEntry> candidates =
                    repository.findByModuleIgnoreCaseAndRelatedRecordId(module, relatedRecordId);
            if (candidates.isEmpty()) {
                return;
            }
            DocumentRepositoryEntry recordDoc = findRecordDocument(candidates, module);
            for (DocumentRepositoryEntry doc : candidates) {
                if (doc.getId() == null) {
                    continue;
                }
                boolean isRecordLevel = recordDoc != null
                        && doc.getId().equals(recordDoc.getId());
                if (isRecordLevel) {
                    // The source record is gone for good, so its generated
                    // document goes with it — it would otherwise be an orphan.
                    purgeDocument(doc.getId());
                } else if (isRecordDocument(doc)) {
                    purgeDocument(doc.getId());
                }
            }
        } catch (Exception e) {
            LOG.warn("Record-document purge skipped for {} #{}: {}",
                    module, relatedRecordId, e.getMessage());
        }
    }

    /**
     * Best-effort file replacement for CAD-style module documents.
     *
     * When a module replaces the physical file behind a record (Drawing file
     * update, Model file update), the previously-registered document entry is
     * moved forward as a NEW VERSION of the same parent document — history is
     * preserved, no duplicate parent rows are created, and the parent entry
     * points at the new file.
     *
     * Runs quietly: best-effort, never disturbs the source-record operation.
     */
    public void replaceRecordFileQuietly(String module, Long relatedRecordId,
                                         String fileName, String filePath, String fileType,
                                         long fileSize, String changeNotes) {
        try {
            if (module == null || relatedRecordId == null || filePath == null || filePath.isBlank()) {
                return;
            }
            List<DocumentRepositoryEntry> candidates =
                    repository.findByModuleIgnoreCaseAndRelatedRecordId(module, relatedRecordId);
            // Prefer the existing file-carrying entry; fall back to any entry.
            DocumentRepositoryEntry doc = candidates.stream()
                    .filter(d -> !isRecordDocument(d))
                    .findFirst()
                    .orElse(candidates.stream().findFirst().orElse(null));
            if (doc == null) {
                // No entry yet — register one carrying the new file.
                registerGenerated(fileName != null ? fileName : module + " file",
                        inferDocumentType(fileName), module, relatedRecordId,
                        null, null, null, filePath, fileType, fileSize,
                        DocumentVisibility.TEAM_ONLY);
                return;
            }
            DocumentRepositoryEntry previous = snapshot(doc);

            // Persist the current version as a historical row (guarded).
            boolean versionRecorded = versionRepository.existsByDocumentIdAndVersionNumber(
                    doc.getId(), doc.getVersionNumber());
            if (!versionRecorded) {
                DocumentVersion oldVersion = new DocumentVersion();
                oldVersion.setDocument(doc);
                oldVersion.setVersionNumber(doc.getVersionNumber());
                oldVersion.setDocumentName(doc.getDocumentName());
                oldVersion.setFilePath(doc.getFilePath());
                oldVersion.setFileType(doc.getFileType());
                oldVersion.setFileSize(doc.getFileSize());
                oldVersion.setChangeNotes("Previous version");
                oldVersion.setUploadedBy(doc.getUploadedBy());
                versionRepository.save(oldVersion);
            }

            // Move the parent document onto the replacement file.
            if (fileName != null && !fileName.isBlank()) doc.setDocumentName(fileName);
            doc.setFilePath(filePath);
            doc.setFileType(fileType);
            doc.setFileSize(fileSize);
            doc.setVersionNumber(doc.getVersionNumber() + 1);
            User currentUser = auditContext.currentUser();
            if (currentUser != null) {
                doc.setUploadedBy(auditContext.currentUserName());
                doc.setUploadedById(currentUser.getId());
            }
            doc = repository.save(doc);

            // Persist the new version row so its change notes are never lost.
            DocumentVersion newVersion = new DocumentVersion();
            newVersion.setDocument(doc);
            newVersion.setVersionNumber(doc.getVersionNumber());
            newVersion.setDocumentName(doc.getDocumentName());
            newVersion.setFilePath(doc.getFilePath());
            newVersion.setFileType(doc.getFileType());
            newVersion.setFileSize(doc.getFileSize());
            newVersion.setChangeNotes(changeNotes != null && !changeNotes.isBlank()
                    ? changeNotes : "Source file replaced");
            newVersion.setUploadedBy(doc.getUploadedBy());
            DocumentVersion savedVersion = versionRepository.save(newVersion);

            auditService.record(doc, savedVersion.getId(), "VERSION_CREATED", previous, doc);
        } catch (Exception e) {
            LOG.warn("Record-file replacement sync skipped for {} #{}: {}",
                    module, relatedRecordId, e.getMessage());
        }
    }

    /**
     * Statuses a user may set directly through metadata editing. The terminal
     * lifecycle states (archived / deleted) stay behind the dedicated,
     * separately-audited archive / delete / restore actions.
     */
    private static final List<String> EDITABLE_STATUSES = List.of("generated", "uploaded", "pending");

    @Transactional
    public DocumentRepositoryResponse updateMetadata(Long id, DocumentRepositoryRequest request) {
        DocumentRepositoryEntry entry = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canEdit(entry)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to edit this document");
        }
        // Re-scoping visibility requires the same access as changing it via
        // PATCH /{id}/visibility — evaluated against the CURRENT (old) value.
        if (request.visibility() != null && request.visibility() != entry.getVisibility()
                && !permissionService.canChangeVisibility(entry)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to change this document's visibility");
        }
        // Snapshot BEFORE mutating so the audit trail records the real before/after.
        DocumentRepositoryEntry previous = snapshot(entry);
        // Validate the lifecycle status before touching the row: only the
        // non-terminal states may be set here, never archived/deleted.
        if (request.status() != null) {
            String status = request.status().trim().toLowerCase(java.util.Locale.ROOT);
            if (!EDITABLE_STATUSES.contains(status)) {
                throw new BadRequestException("Invalid status: " + request.status());
            }
            entry.setStatus(status);
        }
        // Only the fields explicitly provided are changed; the stored file
        // reference, version number, module link and every other column are
        // left intact. A metadata edit never regenerates the file and never
        // creates a new document version.
        if (request.documentName() != null) entry.setDocumentName(request.documentName());
        if (request.documentType() != null) entry.setDocumentType(request.documentType());
        if (request.description() != null) entry.setDescription(request.description());
        if (request.visibility() != null) {
            requireStorableVisibility(request.visibility());
            entry.setVisibility(request.visibility());
        }
        if (request.recordNumber() != null) entry.setRecordNumber(request.recordNumber());
        if (request.customerId() != null) entry.setCustomerId(request.customerId());
        if (request.customerName() != null) entry.setCustomerName(request.customerName());
        entry = repository.save(entry);
        auditService.record(entry, "EDITED", previous, entry);
        return toResponse(entry);
    }

    @Transactional
    public DocumentRepositoryResponse changeVisibility(Long id, String visibility) {
        DocumentRepositoryEntry entry = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canChangeVisibility(entry)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to change this document's visibility");
        }
        DocumentVisibility vis = parseVisibility(visibility);
        if (vis == null) throw new BadRequestException("Invalid visibility: " + visibility);
        requireStorableVisibility(vis);
        // Idempotent: an unchanged value performs no write and records no audit row.
        if (entry.getVisibility() == vis) {
            return toResponse(entry);
        }
        // Snapshot the previous state so the audit trail records the before/after
        // visibility. Only the visibility column is mutated; all other document
        // metadata and the stored file reference are preserved.
        DocumentRepositoryEntry previous = snapshot(entry);
        entry.setVisibility(vis);
        entry = repository.save(entry);
        auditService.record(entry, "VISIBILITY_CHANGED", previous, entry);
        return toResponse(entry);
    }

    @Transactional
    public DocumentRepositoryResponse archive(Long id) {
        DocumentRepositoryEntry entry = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canDelete(entry)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to archive this document");
        }
        if ("deleted".equals(entry.getStatus())) {
            throw new BadRequestException("Deleted documents cannot be archived");
        }
        DocumentRepositoryEntry previous = snapshot(entry);
        entry.setStatus("archived");
        entry = repository.save(entry);
        auditService.record(entry, "ARCHIVED", previous, entry);
        return toResponse(entry);
    }

    @Transactional
    public void delete(Long id) {
        DocumentRepositoryEntry entry = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canDelete(entry)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to delete this document");
        }
        DocumentRepositoryEntry previous = snapshot(entry);
        entry.setStatus("deleted");
        entry = repository.save(entry);
        auditService.record(entry, "DELETED", previous, entry);
    }

    /**
     * Restore an archived or deleted document.
     *
     * The file is never destroyed on archive/delete, so the latest valid
     * version becomes current again. A document with a stored file is set to
     * "uploaded"; a metadata-only record document is set to "generated".
     */
    @Transactional
    public DocumentRepositoryResponse restore(Long id) {
        DocumentRepositoryEntry entry = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canEdit(entry)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to restore this document");
        }
        if (!"archived".equals(entry.getStatus()) && !"deleted".equals(entry.getStatus())) {
            throw new BadRequestException("Only archived or deleted documents can be restored");
        }
        DocumentRepositoryEntry previous = snapshot(entry);
        // A document generated from its source record returns to "generated";
        // an uploaded file returns to "uploaded".
        boolean autoGenerated = readContentFingerprint(entry) != null;
        entry.setStatus(autoGenerated || !hasStoredFile(entry) ? "generated" : "uploaded");
        entry = repository.save(entry);
        auditService.record(entry, "RESTORED", previous, entry);
        return toResponse(entry);
    }

    @Transactional
    public void permanentDelete(Long id) {
        DocumentRepositoryEntry entry = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canPermanentDelete(entry)) {
            throw new com.vishatech.erp.exception.ForbiddenException("Only admins can permanently delete documents");
        }
        purgeDocument(id);
    }

    /**
     * Internal (permission-free) hard delete used by reconciliation tooling.
     * Always removes version history and audit trail for the document.
     */
    @Transactional
    public void purgeDocument(Long id) {
        versionRepository.deleteByDocumentId(id);
        auditService.deleteByDocument(id);
        repository.deleteById(id);
    }

    /**
     * Summary counters for the Documents KPI strip. {@code scope} optionally
     * restricts every counter to one ERP area's modules (see
     * {@link DocumentModuleScope}) so the Sales Documents page never mixes
     * Production/Purchase/Marketing rows into its KPIs; an absent/blank scope
     * counts the whole repository.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> stats(String scope) {
        List<String> scopeModules = DocumentModuleScope.modulesFor(scope);
        User currentUser = auditContext.currentUser();
        boolean isAdmin = currentUser != null && currentUser.getRole() == com.vishatech.erp.entity.UserRole.ADMIN;

        // For admin: count the whole (optionally scoped) repository.
        // For others: count only documents the user can view.
        if (isAdmin) {
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("total", scopeModules.isEmpty() ? countInScope(scopeModules)
                    : repository.countActiveInModules(scopeModules));
            stats.put("generated", countByStatusInScope("generated", scopeModules));
            stats.put("uploaded", countByStatusInScope("uploaded", scopeModules));
            stats.put("pending", countByStatusInScope("pending", scopeModules));
            stats.put("archived", countByStatusInScope("archived", scopeModules));
            stats.put("deleted", countByStatusInScope("deleted", scopeModules));
            stats.put("teamOnly", countByVisibilityInScope(DocumentVisibility.TEAM_ONLY, scopeModules));
            stats.put("customer", countByVisibilityInScope(DocumentVisibility.CUSTOMER, scopeModules));
            stats.put("both", countByVisibilityInScope(DocumentVisibility.BOTH, scopeModules));
            stats.put("adminOnly", countByVisibilityInScope(DocumentVisibility.ADMIN_ONLY, scopeModules));
            stats.put("salesTeamOnly", countByVisibilityInScope(DocumentVisibility.SALES_TEAM_ONLY, scopeModules));
            stats.put("accountsTeamOnly", countByVisibilityInScope(DocumentVisibility.ACCOUNTS_TEAM_ONLY, scopeModules));
            stats.put("purchaseTeamOnly", countByVisibilityInScope(DocumentVisibility.PURCHASE_TEAM_ONLY, scopeModules));
            LocalDateTime weekAgo = LocalDateTime.now().minusDays(7);
            stats.put("recentDocuments", countInScope(scopeModules, weekAgo, LocalDateTime.now()));
            List<Object[]> moduleCounts = scopeModules.isEmpty()
                    ? repository.countByModuleGrouped()
                    : repository.countByModuleGroupedInModulesActive(scopeModules);
            Map<String, Long> byModule = new LinkedHashMap<>();
            for (Object[] row : moduleCounts) {
                byModule.put((String) row[0], ((Number) row[1]).longValue());
            }
            stats.put("byModule", byModule);
            return stats;
        }

        // Non-admin: count only documents the user can view, in the requested scope
        java.util.List<DocumentRepositoryEntry> allVisible = repository.findAll().stream()
                .filter(permissionService::canView)
                .filter(d -> inScope(d, scopeModules))
                .toList();
        // Scoped: total/byModule describe the active rows the list shows, exactly
        // like the admin branch; the per-status counters keep reporting the
        // trashed and archived rows so nothing silently disappears from the KPIs.
        java.util.List<DocumentRepositoryEntry> counted = scopeModules.isEmpty()
                ? allVisible
                : allVisible.stream().filter(DocumentRepositoryService::isActiveStatus).toList();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", counted.size());
        stats.put("generated", allVisible.stream().filter(d -> "generated".equals(d.getStatus())).count());
        stats.put("uploaded", allVisible.stream().filter(d -> "uploaded".equals(d.getStatus())).count());
        stats.put("pending", allVisible.stream().filter(d -> "pending".equals(d.getStatus())).count());
        stats.put("archived", allVisible.stream().filter(d -> "archived".equals(d.getStatus())).count());
        stats.put("deleted", allVisible.stream().filter(d -> "deleted".equals(d.getStatus())).count());
        stats.put("teamOnly", allVisible.stream().filter(d -> d.getVisibility() == DocumentVisibility.TEAM_ONLY).count());
        stats.put("customer", allVisible.stream().filter(d -> d.getVisibility() == DocumentVisibility.CUSTOMER).count());
        stats.put("both", allVisible.stream().filter(d -> d.getVisibility() == DocumentVisibility.BOTH).count());
        stats.put("adminOnly", allVisible.stream().filter(d -> d.getVisibility() == DocumentVisibility.ADMIN_ONLY).count());
        stats.put("salesTeamOnly", allVisible.stream().filter(d -> d.getVisibility() == DocumentVisibility.SALES_TEAM_ONLY).count());
        stats.put("accountsTeamOnly", allVisible.stream().filter(d -> d.getVisibility() == DocumentVisibility.ACCOUNTS_TEAM_ONLY).count());
        stats.put("purchaseTeamOnly", allVisible.stream().filter(d -> d.getVisibility() == DocumentVisibility.PURCHASE_TEAM_ONLY).count());
        LocalDateTime weekAgo = LocalDateTime.now().minusDays(7);
        stats.put("recentDocuments", allVisible.stream().filter(d -> d.getCreatedAt() != null && d.getCreatedAt().isAfter(weekAgo)).count());
        Map<String, Long> byModule = new LinkedHashMap<>();
        counted.forEach(d -> byModule.merge(d.getModule(), 1L, Long::sum));
        stats.put("byModule", byModule);
        return stats;
    }

    // --- Module scope helpers (Sales Documents page) ---

    /**
     * True when a document belongs to the requested module scope. Matches the
     * SQL side exactly ({@code LOWER(module) IN (scope)}); an empty scope means
     * "no restriction".
     */
    private static boolean inScope(DocumentRepositoryEntry document, List<String> scopeModules) {
        return scopeModules.isEmpty()
                || (document.getModule() != null
                    && scopeModules.contains(document.getModule().toLowerCase(java.util.Locale.ROOT)));
    }

    /** A row that is neither in the trash nor archived — the page's active dataset. */
    private static boolean isActiveStatus(DocumentRepositoryEntry document) {
        String status = document.getStatus();
        return status == null
                || (!"deleted".equalsIgnoreCase(status) && !"archived".equalsIgnoreCase(status));
    }

    private long countInScope(List<String> scopeModules) {
        return scopeModules.isEmpty() ? repository.count() : repository.countInModules(scopeModules);
    }

    private long countInScope(List<String> scopeModules, LocalDateTime from, LocalDateTime to) {
        return scopeModules.isEmpty()
                ? repository.countByCreatedAtBetween(from, to)
                : repository.countCreatedBetweenInModules(from, to, scopeModules);
    }

    private long countByStatusInScope(String status, List<String> scopeModules) {
        return scopeModules.isEmpty()
                ? repository.countByStatus(status)
                : repository.countByStatusInModules(status, scopeModules);
    }

    private long countByVisibilityInScope(DocumentVisibility visibility, List<String> scopeModules) {
        return scopeModules.isEmpty()
                ? repository.countByVisibility(visibility)
                : repository.countByVisibilityInModules(visibility, scopeModules);
    }

    // --- Permission-aware response helpers ---

    /** Create a response with permission flags set for the current user. */
    private DocumentRepositoryResponse toResponse(DocumentRepositoryEntry entry) {
        User user = auditContext.currentUser();
        boolean isAdmin = user != null && user.getRole() == com.vishatech.erp.entity.UserRole.ADMIN;
        boolean isOwner = user != null && entry.getUploadedById() != null && entry.getUploadedById().equals(user.getId());
        boolean viewable = permissionService.canView(entry);
        return new DocumentRepositoryResponse(
                entry.getId(), entry.getDocumentName(), entry.getDocumentType(),
                entry.getModule(), entry.getRelatedRecordId(), entry.getRecordNumber(),
                entry.getCustomerId(), entry.getCustomerName(), entry.getFilePath(),
                entry.getFileType(), entry.getFileSize(), entry.getVersionNumber(),
                entry.getVisibility(), entry.getStatus(), entry.getUploadedBy(),
                entry.getUploadedById(), entry.getDescription(), entry.getMetadata(),
                entry.getCreatedAt(), entry.getUpdatedAt(),
                viewable,
                viewable,
                viewable && (isAdmin || isOwner),
                isAdmin || isOwner
        );
    }

    // --- Helpers ---

    /**
     * Deterministic Long for a record id. Numeric ids pass through unchanged;
     * string Pks (e.g. quality_inspections) are hashed to a stable positive
     * Long so they can be stored in the bigint related_record_id column.
     */
    public static Long numericRecordId(Object rawId) {
        if (rawId == null) {
            return null;
        }
        if (rawId instanceof Number n) {
            return n.longValue();
        }
        String s = rawId.toString().trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException ignored) {
            // fall through to deterministic hash
        }
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            long h = 0;
            for (int i = 0; i < 8; i++) {
                h = (h << 8) | (digest[i] & 0xFFL);
            }
            return h & Long.MAX_VALUE;
        } catch (java.security.NoSuchAlgorithmException e) {
            // SHA-256 always available
            return (long) s.hashCode();
        }
    }

    private Sort parseSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }
        String[] parts = sort.split(":");
        String field = parts[0];
        Sort.Direction dir = parts.length > 1 && "asc".equalsIgnoreCase(parts[1])
                ? Sort.Direction.ASC : Sort.Direction.DESC;
        // Map frontend field names to entity fields
        return switch (field) {
            case "documentName" -> Sort.by(dir, "documentName");
            case "documentType" -> Sort.by(dir, "documentType");
            case "module" -> Sort.by(dir, "module");
            case "recordNumber" -> Sort.by(dir, "recordNumber");
            case "customerName" -> Sort.by(dir, "customerName");
            case "uploadedBy" -> Sort.by(dir, "uploadedBy");
            case "fileSize" -> Sort.by(dir, "fileSize");
            case "visibility" -> Sort.by(dir, "visibility");
            case "status" -> Sort.by(dir, "status");
            default -> Sort.by(Sort.Direction.DESC, "createdAt");
        };
    }

    // ============================== Version History ==============================

    @Transactional(readOnly = true)
    public List<DocumentVersionResponse> getVersions(Long documentId) {
        DocumentRepositoryEntry doc = repository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canView(doc)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to view this document");
        }
        return versionRepository.findByDocumentIdOrderByVersionNumberDesc(documentId)
                .stream()
                .map(v -> new DocumentVersionResponse(
                        v.getId(), v.getVersionNumber(), v.getDocumentName(),
                        v.getFilePath(), v.getFileType(), v.getFileSize(),
                        v.getStoredName(), v.getChangeNotes(),
                        v.getUploadedBy(),
                        v.getUploadedAt() != null ? v.getUploadedAt().toString() : null))
                .toList();
    }

    @Transactional
    public DocumentRepositoryResponse uploadNewVersion(Long documentId, MultipartFile file, String changeNotes) {
        DocumentRepositoryEntry doc = repository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canUploadVersion(doc)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to upload a new version of this document");
        }
        if ("deleted".equals(doc.getStatus())) {
            throw new BadRequestException("Deleted documents cannot receive new versions");
        }
        DocumentRepositoryEntry previous = snapshot(doc);

        // Persist the current version as a historical row. It may already have
        // been recorded (new-version rows are stored on upload), so guard
        // against duplicates. Old versions are never overwritten.
        boolean versionRecorded = versionRepository.existsByDocumentIdAndVersionNumber(
                doc.getId(), doc.getVersionNumber());
        if (!versionRecorded) {
            DocumentVersion oldVersion = new DocumentVersion();
            oldVersion.setDocument(doc);
            oldVersion.setVersionNumber(doc.getVersionNumber());
            oldVersion.setDocumentName(doc.getDocumentName());
            oldVersion.setFilePath(doc.getFilePath());
            oldVersion.setFileType(doc.getFileType());
            oldVersion.setFileSize(doc.getFileSize());
            oldVersion.setChangeNotes("Previous version");
            oldVersion.setUploadedBy(doc.getUploadedBy());
            versionRepository.save(oldVersion);
        }

        // Upload new file. Store the bare server-generated name — exactly like
        // upload() — because FileController.serve only accepts safe UUID names.
        // (A previous version stored "/v1/files/<name>" here, which the file
        // endpoint rejects with 400 and broke downloads for versioned docs.)
        String storedName = fileStorageService.store(file);

        // Update document entry
        doc.setDocumentName(file.getOriginalFilename());
        doc.setFilePath(storedName);
        doc.setFileType(file.getContentType());
        doc.setFileSize(file.getSize());
        doc.setVersionNumber(doc.getVersionNumber() + 1);
        doc.setUploadedBy(auditContext.currentUserName());
        User currentUser = auditContext.currentUser();
        if (currentUser != null) doc.setUploadedById(currentUser.getId());
        doc = repository.save(doc);

        // Persist the new version row so its change notes are never lost.
        DocumentVersion newVersion = new DocumentVersion();
        newVersion.setDocument(doc);
        newVersion.setVersionNumber(doc.getVersionNumber());
        newVersion.setDocumentName(doc.getDocumentName());
        newVersion.setFilePath(doc.getFilePath());
        newVersion.setFileType(doc.getFileType());
        newVersion.setFileSize(doc.getFileSize());
        newVersion.setChangeNotes(changeNotes != null && !changeNotes.isBlank() ? changeNotes : "New version uploaded");
        newVersion.setUploadedBy(doc.getUploadedBy());
        DocumentVersion savedVersion = versionRepository.save(newVersion);

        auditService.record(doc, savedVersion.getId(), "VERSION_CREATED", previous, doc);
        return toResponse(doc);
    }

    /**
     * Deterministic record-document sync for ERP modules.
     *
     * Ensures every ERP record has exactly one record-level document entry
     * (metadata-only) linked to the source record. On the first call it
     * creates the entry; on later calls it only refreshes the metadata — it
     * never duplicates, and it never touches documents that carry actual
     * uploaded/generated files.
     *
     * Used from module create/update flows so a document relationship always
     * exists and stays in sync when the source record is edited.
     */
    @Transactional
    public DocumentRepositoryResponse ensureRecordDocument(
            String module, Long relatedRecordId, String documentName, String documentType,
            String recordNumber, Long customerId, String customerName, String status) {
        if (module == null || relatedRecordId == null) {
            throw new BadRequestException("Module and relatedRecordId are required to sync a record document");
        }
        List<DocumentRepositoryEntry> candidates =
                repository.findByModuleIgnoreCaseAndRelatedRecordId(module, relatedRecordId);
        DocumentRepositoryEntry recordDoc = findRecordDocument(candidates, documentType);

        if (recordDoc == null) {
            recordDoc = new DocumentRepositoryEntry();
            recordDoc.setDocumentName(documentName != null ? documentName : module + " #" + relatedRecordId);
            recordDoc.setDocumentType(documentType != null ? documentType : module);
            recordDoc.setModule(module);
            recordDoc.setRelatedRecordId(relatedRecordId);
            recordDoc.setRecordNumber(recordNumber);
            recordDoc.setCustomerId(customerId);
            recordDoc.setCustomerName(customerName);
            recordDoc.setFilePath("metadata-only");
            recordDoc.setVisibility(DocumentVisibility.TEAM_ONLY);
            String normalized = normalizeRecordStatus(status);
            recordDoc.setStatus(normalized != null ? normalized : "uploaded");
            User currentUser = auditContext.currentUser();
            if (currentUser != null) {
                recordDoc.setUploadedBy(auditContext.currentUserName());
                recordDoc.setUploadedById(currentUser.getId());
            }
            recordDoc = repository.save(recordDoc);
            saveInitialVersion(recordDoc, "Record created");
            auditService.record(recordDoc, "CREATED", null, recordDoc);
            return toResponse(recordDoc);
        }

        // Update the record-level document to mirror the source record.
        DocumentRepositoryEntry previous = snapshot(recordDoc);
        boolean changed = false;
        if (documentName != null && !documentName.equals(recordDoc.getDocumentName())) {
            recordDoc.setDocumentName(documentName);
            changed = true;
        }
        if (documentType != null && !documentType.equals(recordDoc.getDocumentType())) {
            recordDoc.setDocumentType(documentType);
            changed = true;
        }
        if (recordNumber != null && !recordNumber.equals(recordDoc.getRecordNumber())) {
            recordDoc.setRecordNumber(recordNumber);
            changed = true;
        }
        if (customerId != null) {
            recordDoc.setCustomerId(customerId);
        }
        if (customerName != null && !customerName.equals(recordDoc.getCustomerName())) {
            recordDoc.setCustomerName(customerName);
            changed = true;
        }
        String normalized = normalizeRecordStatus(status);
        if (normalized != null && !normalized.equals(recordDoc.getStatus())) {
            recordDoc.setStatus(normalized);
            changed = true;
        }
        if (changed) {
            recordDoc = repository.save(recordDoc);
            auditService.record(recordDoc, "EDITED", previous, recordDoc);
        }
        return toResponse(recordDoc);
    }

    /**
     * Best-effort record-document sync used by module create/update flows.
     *
     * Runs inside the caller's transaction (the same persistence context sees
     * the just-saved source record, so the sync is idempotent). Failures are
     * logged and skipped so a document-sync problem can never roll back or
     * disturb the originating ERP record operation.
     *
     * <p>Sales-area modules are excluded outright: the Sales Documents
     * repository must contain documents that were explicitly uploaded or
     * selected, not an auto-generated entry per CRM/Sales business record. The
     * guard lives here — the single entry point of the automatic mirror flow —
     * so no record-save path can re-open it (see
     * {@link DocumentModuleScope#allowsAutomaticRecordDocuments}). Every other
     * area keeps its existing synchronization.
     */
    public void syncRecordDocumentQuietly(
            String module, Long relatedRecordId, String documentName, String documentType,
            String recordNumber, Long customerId, String customerName, String status) {
        try {
            if (relatedRecordId == null) {
                return;
            }
            if (!DocumentModuleScope.allowsAutomaticRecordDocuments(module)) {
                LOG.debug("Record-document mirror skipped for Sales module {} #{}",
                        module, relatedRecordId);
                return;
            }
            ensureRecordDocument(module, relatedRecordId, documentName, documentType,
                    recordNumber, customerId, customerName, status);
            // Keep the stored formal document in step with the source record:
            // the first save attaches version 1, later edits append a new
            // version when the rendered content actually changed.
            refreshGeneratedFileQuietly(module, relatedRecordId);
        } catch (Exception e) {
            LOG.warn("Record-document sync skipped for {} #{}: {}",
                    module, relatedRecordId, e.getMessage());
        }
    }

    @Transactional(readOnly = true)
    public List<com.vishatech.erp.dto.DocumentAuditResponse> getAuditLog(Long documentId) {
        DocumentRepositoryEntry doc = repository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canView(doc)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to view this document's audit trail");
        }
        return auditService.getByDocument(documentId);
    }

    /**
     * Best-effort visibility sync for an externally-owned mirror row
     * (e.g. CPR Technical Verification documents registered under module
     * "CPR Technical Verification"). When the mirror exists, the change goes
     * through {@link #changeVisibility} — same permission check, same audit
     * trail. When no mirror exists (legacy rows), this is a no-op so the
     * caller's own record-level update still proceeds.
     */
    @Transactional
    public void changeVisibilityForMirror(String module, Long relatedRecordId,
                                          String storedName, String visibility) {
        if (storedName == null || storedName.isBlank() || relatedRecordId == null) {
            return;
        }
        DocumentRepositoryEntry mirror = repository
                .findByModuleIgnoreCaseAndRelatedRecordId(module, relatedRecordId).stream()
                .filter(c -> c.getFilePath() != null
                        && (c.getFilePath().endsWith("/" + storedName) || c.getFilePath().equals(storedName)))
                .findFirst()
                .orElse(null);
        if (mirror == null) {
            return;
        }
        changeVisibility(mirror.getId(), visibility);
    }

    // ============================== PDF Generation ==============================

    /**
     * Normalized module keys for which a formal document can be rendered as a
     * PDF from the live source record (see {@code PdfGenerationService}).
     */
    private static final java.util.Set<String> PDF_MODULES = java.util.Set.of(
            "quotation", "invoice", "salescontract", "salesorder", "proformainvoice",
            "deliverychallan", "creditnote", "paymentreceipt",
            "lead", "client", "followup", "cpr", "cprtechnicalverification",
            "costworkout", "profitworkout", "productiontracker", "packinglist",
            "qc", "qualityinspection");

    /** Lowercase, separator-free module key ("Proforma Invoice" -> "proformainvoice"). */
    private static String normalizeModuleKey(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        return value.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    /** Canonical business document label for a generator key. */
    private static String generatorLabel(String key) {
        return switch (key) {
            case "quotation" -> "Quotation";
            case "invoice" -> "Invoice";
            case "salescontract" -> "Sales Contract";
            case "salesorder", "customerpurchaseorder" -> "Customer Purchase Order";
            case "proformainvoice" -> "Proforma Invoice";
            case "deliverychallan" -> "Delivery Challan";
            case "creditnote" -> "Credit Note";
            case "paymentreceipt" -> "Payment Receipt";
            case "lead" -> "Lead";
            case "client" -> "Client";
            case "followup" -> "Follow-up";
            case "cpr" -> "CPR";
            case "cprtechnicalverification" -> "CPR Technical Verification";
            case "costworkout" -> "Cost Workout";
            case "profitworkout" -> "Profit Workout";
            case "productiontracker" -> "Production Tracker";
            case "packinglist" -> "Packing List";
            case "qc", "qualityinspection" -> "QC";
            default -> null;
        };
    }

    /**
     * Resolve which renderer to use for a document. Prefers the (canonical)
     * module, then falls back to the business document type — which keeps
     * legacy rows whose module was aggregated ("Sales"/"Finance"/"CRM")
     * working.
     */
    private static String resolveGeneratorKey(String module, String documentType) {
        String moduleKey = normalizeModuleKey(module);
        if (PDF_MODULES.contains(moduleKey)) {
            return moduleKey;
        }
        String typeKey = normalizeModuleKey(documentType);
        if (PDF_MODULES.contains(typeKey)) {
            return typeKey;
        }
        return switch (typeKey) {
            case "customerpurchaseorder", "salesorder" -> "salesorder";
            case "technicalverification", "cprtechnicalverification" -> "cprtechnicalverification";
            case "qualityinspection", "inspection" -> "qc";
            default -> null;
        };
    }

    /**
     * Regenerate the formal document for an existing repository entry and
     * attach it as the current version. Used by the explicit "Regenerate
     * Document" action: a new version is always produced.
     */
    @Transactional
    public DocumentRepositoryResponse generatePdf(Long documentId) {
        DocumentRepositoryEntry doc = repository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canView(doc)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to regenerate this document");
        }
        if (doc.getRelatedRecordId() == null) {
            throw new BadRequestException("Document has no linked record to generate from");
        }
        if (resolveGeneratorKey(doc.getModule(), doc.getDocumentType()) == null) {
            throw new BadRequestException(
                    "This document type has no generated form. It can only be uploaded or downloaded.");
        }
        attachGeneratedPdf(doc, true, true);
        return toResponse(repository.findById(documentId).orElse(doc));
    }

    /**
     * Generate a PDF and attach it to a metadata-only record document.
     * Best-effort: failures are logged and skipped.
     */
    public void generatePdfQuietly(String module, Long relatedRecordId) {
        try {
            if (relatedRecordId == null) {
                return;
            }
            refreshGeneratedFileQuietly(module, relatedRecordId);
        } catch (Exception e) {
            LOG.warn("PDF generation skipped for {} #{}: {}", module, relatedRecordId, e.getMessage());
        }
    }

    /**
     * Best-effort refresh of the stored document for a source record, called
     * from {@link #syncRecordDocumentQuietly(String, Long, String, String,
     * String, Long, String, String)} after every create/update. The first call
     * attaches version 1; later calls append a new version only when the
     * rendered content actually changed, so repeated no-op syncs (status
     * changes, list reads) never churn the version history.
     */
    public boolean refreshGeneratedFileQuietly(String module, Long relatedRecordId) {
        try {
            if (relatedRecordId == null) {
                return false;
            }
            List<DocumentRepositoryEntry> candidates =
                    repository.findByModuleIgnoreCaseAndRelatedRecordId(module, relatedRecordId);
            if (candidates.isEmpty()) {
                return false;
            }
            DocumentRepositoryEntry doc = findRecordDocument(candidates, module);
            if (doc == null) {
                return false;
            }
            if (resolveGeneratorKey(doc.getModule(), doc.getDocumentType()) == null) {
                return false;
            }
            // A soft-deleted source record must not have its document brought
            // back to life by the sync that follows the delete.
            if ("deleted".equalsIgnoreCase(doc.getStatus())) {
                return false;
            }
            return attachGeneratedPdf(doc, false, false);
        } catch (Exception e) {
            LOG.warn("Document refresh skipped for {} #{}: {}", module, relatedRecordId, e.getMessage());
            return false;
        }
    }

    /**
     * Render the formal document for an entry and persist it as the current
     * version.
     *
     * Contract:
     *  - the business document type is preserved (never replaced by "pdf");
     *  - the replaced version is kept as a history row (never overwritten);
     *  - the actor is the authenticated ERP user (never a hard-coded name);
     *  - when {@code forceNewVersion} is false and the freshly rendered bytes
     *    are identical to the stored file, nothing changes.
     *
     * @return true when a file was attached or a new version created
     */
    private boolean attachGeneratedPdf(DocumentRepositoryEntry doc,
                                       boolean forceNewVersion,
                                       boolean throwOnFailure) {
        String key = resolveGeneratorKey(doc.getModule(), doc.getDocumentType());
        if (key == null) {
            if (throwOnFailure) {
                throw new BadRequestException("This record type does not have a generated document.");
            }
            return false;
        }

        String html;
        byte[] pdfBytes;
        try {
            html = ("qc".equals(key) || "qualityinspection".equals(key))
                    ? pdfGenerationService.buildQualityInspectionHtml(String.valueOf(doc.getRelatedRecordId()))
                    : pdfGenerationService.buildHtml(key, doc.getRelatedRecordId());
            pdfBytes = pdfGenerationService.toPdf(html);
        } catch (Exception e) {
            if (throwOnFailure) {
                throw new BadRequestException("Unable to generate document: " + e.getMessage());
            }
            LOG.warn("Document generation failed for {} #{}: {}",
                    doc.getModule(), doc.getRelatedRecordId(), e.getMessage());
            return false;
        }
        if (html == null || pdfBytes == null || pdfBytes.length == 0) {
            if (throwOnFailure) {
                throw new BadRequestException(
                        "Unable to generate document. The source record may be missing or incomplete.");
            }
            return false;
        }

        // Idempotency guard: comparing the rendered source content (not the PDF
        // bytes, which embed a creation timestamp) keeps no-op syncs — status
        // changes, repeated saves — from churning the version history.
        String fingerprint = sha256Hex(html);
        if (!forceNewVersion && fingerprint != null
                && fingerprint.equals(readContentFingerprint(doc))) {
            return false;
        }

        String storedName = fileStorageService.storeBytes(pdfBytes, "pdf");
        DocumentRepositoryEntry previous = snapshot(doc);
        boolean hadFile = hasStoredFile(doc);
        int previousVersion = doc.getVersionNumber() < 1 ? 1 : doc.getVersionNumber();

        // Preserve the version being replaced so history is never lost.
        if (hadFile && !versionRepository.existsByDocumentIdAndVersionNumber(doc.getId(), previousVersion)) {
            DocumentVersion replaced = new DocumentVersion();
            replaced.setDocument(doc);
            replaced.setVersionNumber(previousVersion);
            replaced.setDocumentName(previous.getDocumentName());
            replaced.setFilePath(previous.getFilePath());
            replaced.setFileType(previous.getFileType());
            replaced.setFileSize(previous.getFileSize());
            replaced.setStoredName(resolveStoredName(previous.getFilePath()));
            replaced.setChangeNotes("Previous version");
            replaced.setUploadedBy(previous.getUploadedBy());
            versionRepository.save(replaced);
        }

        // First real file upgrades the placeholder version 1 row; a later edit
        // appends a new version above the current one.
        int newVersion = hadFile ? previousVersion + 1 : 1;

        doc.setFilePath(storedName);
        doc.setFileType("application/pdf");
        doc.setFileSize(pdfBytes.length);
        if (doc.getDocumentType() == null || doc.getDocumentType().isBlank()
                || "document".equalsIgnoreCase(doc.getDocumentType())
                || "pdf".equalsIgnoreCase(doc.getDocumentType())) {
            String label = generatorLabel(key);
            if (label != null) {
                doc.setDocumentType(label);
            }
        }
        // Preserve a soft-deleted/archived state; never resurrect a document
        // that the lifecycle deliberately moved out of the active set.
        String status = doc.getStatus();
        if (status == null || status.isBlank()
                || !("deleted".equalsIgnoreCase(status) || "archived".equalsIgnoreCase(status))) {
            doc.setStatus("generated");
        }
        doc.setVersionNumber(newVersion);
        if (fingerprint != null) {
            doc.setMetadata("{\"contentHash\":\"" + fingerprint + "\"}");
        }
        User currentUser = auditContext.currentUser();
        if (currentUser != null) {
            doc.setUploadedBy(auditContext.currentUserName());
            doc.setUploadedById(currentUser.getId());
        }
        doc = repository.save(doc);

        DocumentVersion version = null;
        if (!hadFile) {
            // Upgrade the initial placeholder row instead of duplicating v1.
            version = versionRepository.findByDocumentIdOrderByVersionNumberDesc(doc.getId()).stream()
                    .filter(v -> v.getVersionNumber() == 1)
                    .findFirst()
                    .orElse(null);
        }
        if (version == null) {
            version = new DocumentVersion();
            version.setDocument(doc);
            version.setVersionNumber(newVersion);
        }
        version.setDocumentName(doc.getDocumentName());
        version.setFilePath(storedName);
        version.setFileType("application/pdf");
        version.setFileSize(pdfBytes.length);
        version.setStoredName(storedName);
        version.setChangeNotes(hadFile
                ? (forceNewVersion ? "Regenerated from source record" : "Updated from source record")
                : "Auto-generated from source record");
        version.setUploadedBy(doc.getUploadedBy() != null
                ? doc.getUploadedBy() : auditContext.currentUserName());
        DocumentVersion savedVersion = versionRepository.save(version);

        // GENERATED marks the file actually being produced for the record;
        // REGENERATED marks a further version of an already-stored document.
        auditService.record(doc, savedVersion.getId(), hadFile ? "REGENERATED" : "GENERATED", previous, doc);
        return true;
    }

    /** SHA-256 of the rendered document content, as lowercase hex. */
    private static String sha256Hex(String content) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            return null;
        }
    }

    /** Fingerprint of the content behind the currently stored version. */
    private String readContentFingerprint(DocumentRepositoryEntry doc) {
        String metadata = doc.getMetadata();
        if (metadata == null || metadata.isBlank()) {
            return null;
        }
        int key = metadata.indexOf("\"contentHash\":\"");
        if (key < 0) {
            return null;
        }
        int start = key + "\"contentHash\":\"".length();
        int end = metadata.indexOf('"', start);
        return end > start ? metadata.substring(start, end) : null;
    }

    // ============================== File serving ==============================

    /**
     * Resolve the actual stored file for the current version of a document and
     * verify access permissions. Records a VIEWED / DOWNLOADED audit entry.
     *
     * @param documentId document to serve
     * @param mode "inline" (VIEWED) or "attachment" (DOWNLOADED)
     * @return the stored file resource plus the metadata needed by the controller
     */
    public DocumentFile loadDocumentFile(Long documentId, String mode) {
        DocumentRepositoryEntry doc = repository.findById(documentId)
                .orElseThrow(() -> new ResourceNotFoundException("Document not found"));
        if (!permissionService.canView(doc)) {
            throw new com.vishatech.erp.exception.ForbiddenException("You do not have permission to access this document");
        }
        String storedName = resolveStoredName(doc.getFilePath());
        if (storedName == null) {
            throw new BadRequestException("This document has no stored file");
        }
        Resource resource = fileStorageService.loadDocumentResource(storedName, subdirHints(doc.getFilePath()));
        String contentType = doc.getFileType() != null && !doc.getFileType().isBlank()
                ? doc.getFileType() : "application/octet-stream";
        boolean inline = "inline".equalsIgnoreCase(mode);
        auditService.recordAccess(doc, doc.getVersionNumber(), inline ? "VIEWED" : "DOWNLOADED");
        return new DocumentFile(doc.getDocumentName(), contentType, inline, resource);
    }

    /** File payload bundle returned to the controller for streaming. */
    public record DocumentFile(String documentName, String contentType, boolean inline, Resource resource) {}

    private void saveInitialVersion(DocumentRepositoryEntry doc, String notes) {
        if (versionRepository.existsByDocumentIdAndVersionNumber(doc.getId(), 1)) {
            return;
        }
        DocumentVersion v1 = new DocumentVersion();
        v1.setDocument(doc);
        v1.setVersionNumber(1);
        v1.setDocumentName(doc.getDocumentName());
        v1.setFilePath(doc.getFilePath());
        v1.setFileType(doc.getFileType());
        v1.setFileSize(doc.getFileSize());
        v1.setChangeNotes(notes != null ? notes : "Initial version");
        v1.setUploadedBy(doc.getUploadedBy());
        versionRepository.save(v1);
    }

    private boolean isRecordDocument(DocumentRepositoryEntry d) {
        return d.getFilePath() == null
                || "metadata-only".equals(d.getFilePath())
                || "metadata-only".equals(d.getFilePath().trim());
    }

    /**
     * Pick the record-level document out of every entry linked to a source
     * record.
     *
     * A record can legitimately own several documents (the record document
     * itself plus any attachment documents registered against it), so the
     * record document is identified by its canonical business type — the entry
     * the sync itself created — with the legacy metadata-only entry and then
     * the oldest entry as fallbacks. It is deliberately NOT identified by
     * "has no stored file": once a record document carries its generated PDF it
     * must still be recognised as the same document, otherwise every save would
     * spawn a duplicate parent.
     */
    private DocumentRepositoryEntry findRecordDocument(List<DocumentRepositoryEntry> candidates,
                                                       String preferredType) {
        if (candidates == null || candidates.isEmpty()) {
            return null;
        }
        java.util.Comparator<DocumentRepositoryEntry> oldest =
                java.util.Comparator.comparing(DocumentRepositoryEntry::getId,
                        java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder()));
        if (preferredType != null && !preferredType.isBlank()) {
            java.util.Optional<DocumentRepositoryEntry> typed = candidates.stream()
                    .filter(d -> preferredType.equalsIgnoreCase(d.getDocumentType()))
                    .min(oldest);
            if (typed.isPresent()) {
                return typed.get();
            }
        }
        return candidates.stream()
                .filter(this::isRecordDocument)
                .min(oldest)
                .orElseGet(() -> candidates.stream().min(oldest).orElse(null));
    }

    private boolean hasStoredFile(DocumentRepositoryEntry doc) {
        return resolveStoredName(doc.getFilePath()) != null;
    }

    /**
     * Extract a storage-safe file name from any filePath variant:
     * a bare name, an API path (/v1/files/name) or an absolute URL, or a CAD
     * sub-directory path (drawings/name, models/name).
     */
    private String resolveStoredName(String filePath) {
        if (filePath == null || filePath.isBlank() || "metadata-only".equals(filePath)) {
            return null;
        }
        String path = filePath;
        if (path.startsWith("http")) {
            try {
                path = new java.net.URI(path).getPath();
            } catch (java.net.URISyntaxException e) {
                return null;
            }
        }
        String[] segments = path.split("[/\\\\]");
        String last = segments.length > 0 ? segments[segments.length - 1].trim() : "";
        return last.isEmpty() ? null : last;
    }

    /** CAD sub-directories to probe when serving a stored file. */
    private String[] subdirHints(String filePath) {
        if (filePath == null) {
            return new String[0];
        }
        String lower = filePath.toLowerCase();
        List<String> hints = new java.util.ArrayList<>();
        if (lower.contains("drawings")) {
            hints.add("drawings");
        }
        if (lower.contains("models")) {
            hints.add("models");
        }
        return hints.toArray(new String[0]);
    }

    private String normalizeRecordStatus(String status) {
        if (status == null || status.isBlank()) return null;
        String s = status.trim();
        if (s.equalsIgnoreCase("DELETED")) return "deleted";
        if (s.equalsIgnoreCase("ARCHIVED")) return "archived";
        String upper = s.toUpperCase(java.util.Locale.ROOT);
        if (upper.equals("ACTIVE") || upper.equals("OPEN")
                || upper.equals("CONVERTED") || upper.equals("WON")
                || upper.equals("COLD") || upper.equals("WARM")
                || upper.startsWith("COMPLETED") || upper.startsWith("VERIFIED")
                || upper.startsWith("APPROVED") || upper.startsWith("PROCESSING")
                || upper.equals("PROCESSED") || upper.startsWith("VERIFICATION_")
                || upper.contains("COMPLETED") || upper.contains("VERIFIED")) {
            return "uploaded";
        }
        if (upper.equals("DRAFT") || upper.equals("PENDING")
                || upper.equals("PENDING_APPROVAL") || upper.startsWith("PENDING_")) {
            return "pending";
        }
        String lowered = s.toLowerCase(java.util.Locale.ROOT);
        return lowered.length() > 19 ? lowered.substring(0, 19) : lowered;
    }

    private DocumentRepositoryEntry snapshot(DocumentRepositoryEntry entry) {
        DocumentRepositoryEntry copy = new DocumentRepositoryEntry();
        copy.setId(entry.getId());
        copy.setDocumentName(entry.getDocumentName());
        copy.setDocumentType(entry.getDocumentType());
        copy.setModule(entry.getModule());
        copy.setRelatedRecordId(entry.getRelatedRecordId());
        copy.setRecordNumber(entry.getRecordNumber());
        copy.setCustomerId(entry.getCustomerId());
        copy.setCustomerName(entry.getCustomerName());
        copy.setFilePath(entry.getFilePath());
        copy.setFileType(entry.getFileType());
        copy.setFileSize(entry.getFileSize());
        copy.setVersionNumber(entry.getVersionNumber());
        copy.setVisibility(entry.getVisibility());
        copy.setStatus(entry.getStatus());
        copy.setUploadedBy(entry.getUploadedBy());
        copy.setUploadedById(entry.getUploadedById());
        copy.setDescription(entry.getDescription());
        copy.setMetadata(entry.getMetadata());
        return copy;
    }

    /**
     * The visibility values {@code document_repository.visibility} can actually
     * store.
     *
     * <p>The Java model defines seven {@link DocumentVisibility} values and the
     * shipped setup script ({@code docs/database_setup.sql}) declares the column as
     * the matching seven-value enum, but the live column is still the older
     * {@code enum('BOTH','CUSTOMER','TEAM_ONLY')} (see
     * {@code erp_db_schema_latest.sql}). {@code docs/documents_migration.sql}
     * assumed the column was {@code VARCHAR(20)} ("no column change is needed"),
     * so nothing ever widened it.
     *
     * <p>With {@code STRICT_TRANS_TABLES} on, writing one of the four
     * team-scoped values is refused by MySQL with error 1265 ("Data truncated
     * for column 'visibility'"). That is not one of the mapped data-access
     * exceptions, so it used to escape as an HTTP 500 with no explanation.
     * Rejecting the value up front turns it into the 400 it actually is.
     *
     * <p>Widening the column to the seven baseline values is a schema migration
     * and is deliberately not performed here; when it is applied, this guard can
     * be replaced by {@code DocumentVisibility.values()}.
     */
    private static final java.util.Set<DocumentVisibility> STORABLE_VISIBILITIES =
            java.util.Set.of(DocumentVisibility.TEAM_ONLY, DocumentVisibility.CUSTOMER, DocumentVisibility.BOTH);

    private DocumentVisibility parseVisibility(String visibility) {
        if (visibility == null || visibility.isBlank()) return null;
        try {
            return DocumentVisibility.valueOf(visibility.toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * Refuse a visibility the repository column cannot store, before any write
     * reaches MySQL — see {@link #STORABLE_VISIBILITIES}. Nothing is mutated and
     * the caller gets a 400 naming the supported values instead of an opaque 500.
     */
    /**
     * The visibility a NEW document receives when the caller supplies none: the
     * operator's configured default ({@code app_settings}
     * {@code document_default_visibility}), but only when the repository column
     * can actually store it.
     *
     * <p>The live column is still {@code enum('BOTH','CUSTOMER','TEAM_ONLY')}
     * while the Settings → Documents picker offers the seven values of the Java
     * model, so the configured {@code ADMIN_ONLY} — the value the running
     * installation actually holds — was written straight into the column and
     * refused by MySQL with error 1265 ("Data truncated for column
     * 'visibility'"), which escaped as an HTTP 500 that no caller could act on:
     * a plain file upload could not be stored at all, and neither could a
     * metadata-only document.
     *
     * <p>Falling back to the most restrictive storable value keeps such a
     * document internal instead of failing the whole upload. The misconfigured
     * setting is deliberately left untouched — changing it is an operator
     * decision, not this service's — and every occurrence is logged once. Once
     * the column is widened to the values declared in
     * {@code docs/database_setup.sql} the configured default is used verbatim
     * and this branch goes quiet.
     */
    private DocumentVisibility storableDefaultVisibility() {
        DocumentVisibility configured = documentSettingsService.defaultVisibility();
        if (configured != null && STORABLE_VISIBILITIES.contains(configured)) {
            return configured;
        }
        LOG.warn("Default document visibility {} cannot be stored by "
                        + "document_repository.visibility (supported: {}). Using {} for this document "
                        + "instead; widen the column to the seven values declared in "
                        + "docs/database_setup.sql to use the configured default.",
                configured, STORABLE_VISIBILITIES, DocumentVisibility.TEAM_ONLY);
        return DocumentVisibility.TEAM_ONLY;
    }

    private void requireStorableVisibility(DocumentVisibility visibility) {
        if (visibility != null && !STORABLE_VISIBILITIES.contains(visibility)) {
            throw new BadRequestException("Document visibility " + visibility
                    + " is not supported by this repository yet; it stores TEAM_ONLY, CUSTOMER and BOTH."
                    + " Nothing was changed.");
        }
    }

    private LocalDateTime parseDate(String dateStr) {
        if (dateStr == null || dateStr.isBlank()) return null;
        try {
            return LocalDateTime.parse(dateStr + "T00:00:00");
        } catch (DateTimeParseException e) {
            try {
                return LocalDateTime.parse(dateStr, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            } catch (DateTimeParseException e2) {
                return null;
            }
        }
    }

    /**
     * One-time, IDEMPOTENT rename of legacy Sales-Order wording to Customer
     * Purchase Order wording. Only rows that are actually Customer Purchase
     * Orders are touched:
     *
     * <ol>
     *   <li>{@code sales_orders.so_no} where the stored number starts with
     *       {@code SO-} → {@code CPO-}. The primary key, child items and every
     *       other column are untouched, so no duplicate record is created.</li>
     *   <li>{@code document_repository} rows that belong to the CPO module
     *       (legacy module/type {@code Sales Order} or {@code Sales}) → module
     *       and document type become {@code Customer Purchase Order}, and any
     *       {@code SO-} number embedded in the record number/document name is
     *       rewritten to {@code CPO-}.</li>
     * </ol>
     *
     * Running it a second time is a no-op: nothing matches any more. A rename
     * is SKIPPED (with a warning) if the target {@code CPO-} number is already
     * taken, so the unique constraint on {@code so_no} can never abort the
     * migration half-way.
     *
     * @return the number of records actually rewritten
     */
    @Transactional
    public int migrateCpoTerminology() {
        int updated = 0;
        int skipped = 0;

        // 1. Migrate sales_orders.so_no: SO-* → CPO-*
        for (com.vishatech.erp.entity.SalesOrder so : salesOrderRepository.findWithSoPrefix()) {
            String oldNo = so.getSoNo();
            if (oldNo == null || oldNo.length() <= 3) {
                continue;
            }
            String newNo = "CPO-" + oldNo.substring(3);
            if (salesOrderRepository.existsBySoNo(newNo)) {
                LOG.warn("CPO terminology migration: skipping {} — {} already exists", oldNo, newNo);
                skipped++;
                continue;
            }
            so.setSoNo(newNo);
            salesOrderRepository.save(so);
            updated++;
        }

        // 2. Migrate document_repository_entry: module/documentType/recordNumber/documentName
        for (DocumentRepositoryEntry doc : repository.findSalesOrderDocumentsForMigration()) {
            boolean changed = false;
            if (!"Customer Purchase Order".equals(doc.getModule())) {
                doc.setModule("Customer Purchase Order");
                changed = true;
            }
            if (!"Customer Purchase Order".equals(doc.getDocumentType())) {
                doc.setDocumentType("Customer Purchase Order");
                changed = true;
            }
            String number = doc.getRecordNumber();
            if (number != null && number.startsWith("SO-")) {
                doc.setRecordNumber("CPO-" + number.substring(3));
                changed = true;
            }
            String name = doc.getDocumentName();
            if (name != null && !name.isBlank()) {
                String renamed = name
                        .replace("Sales Orders", "Customer Purchase Orders")
                        .replace("Sales Order", "Customer Purchase Order")
                        .replace("SO-", "CPO-");
                if (!renamed.equals(name)) {
                    doc.setDocumentName(renamed);
                    changed = true;
                }
            }
            if (changed) {
                repository.save(doc);
                updated++;
            }
        }

        if (updated > 0 || skipped > 0) {
            LOG.info("CPO terminology migration: {} record(s) updated, {} skipped", updated, skipped);
        }
        return updated;
    }

    private String inferDocumentType(String filename) {
        if (filename == null) return "document";
        String lower = filename.toLowerCase();
        if (lower.endsWith(".pdf")) return "pdf";
        if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "word";
        if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) return "excel";
        if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif")) return "image";
        if (lower.endsWith(".csv")) return "csv";
        return "document";
    }
}
