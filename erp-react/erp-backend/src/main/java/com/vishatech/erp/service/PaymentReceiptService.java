package com.vishatech.erp.service;

import com.vishatech.erp.dto.PaymentReceiptNextNumberResponse;
import com.vishatech.erp.dto.PaymentReceiptRequest;
import com.vishatech.erp.dto.PaymentReceiptResponse;
import com.vishatech.erp.dto.SalesAttachmentResponse;
import com.vishatech.erp.dto.SalesHistoryResponse;
import com.vishatech.erp.dto.SalesTimelineResponse;
import com.vishatech.erp.dto.RevisionInfo;
import com.vishatech.erp.entity.PaymentReceipt;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.entity.SalesAttachment;
import com.vishatech.erp.entity.SalesHistory;
import com.vishatech.erp.entity.SalesTimeline;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.EditHistoryRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.RecordRevisionRepository;
import com.vishatech.erp.repository.SalesAttachmentRepository;
import com.vishatech.erp.repository.SalesHistoryRepository;
import com.vishatech.erp.repository.SalesTimelineRepository;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Subquery;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class PaymentReceiptService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final String MODULE = "payment-receipt";

    private final PaymentReceiptRepository paymentReceiptRepository;
    private final SalesTimelineRepository timelineRepository;
    private final SalesHistoryRepository historyRepository;
    private final SalesAttachmentRepository attachmentRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final String baseUrl;

    public PaymentReceiptService(PaymentReceiptRepository paymentReceiptRepository,
                                 SalesTimelineRepository timelineRepository,
                                 SalesHistoryRepository historyRepository,
                                 SalesAttachmentRepository attachmentRepository,
                                 EditHistoryRepository editHistoryRepository,
                                 RecordRevisionRepository recordRevisionRepository,                                  FileStorageService fileStorageService,
                                  DocumentRepositoryService documentRepositoryService,
                                  @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.paymentReceiptRepository = paymentReceiptRepository;
        this.timelineRepository = timelineRepository;
        this.historyRepository = historyRepository;
        this.attachmentRepository = attachmentRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.baseUrl = baseUrl;
    }

    @Transactional(readOnly = true)
    public Page<PaymentReceiptResponse> list(int page, int size, String search, String sort,
                                             String status, String client, String paymentMode,
                                             String dateFrom, String dateTo,
                                             BigDecimal minAmount, BigDecimal maxAmount) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<PaymentReceipt> spec = buildSpecification(search, status, client, paymentMode,
                dateFrom, dateTo, minAmount, maxAmount);
        return paymentReceiptRepository.findAll(spec, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public PaymentReceiptResponse get(Long id) {
        return toResponseDetail(getReceipt(id));
    }

    @Transactional(readOnly = true)
    public PaymentReceiptNextNumberResponse getNextNumber() {
        long next = nextSequence();
        return new PaymentReceiptNextNumberResponse(buildNo(next), next);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        List<String> excluded = List.of("archived", "deleted");
        Map<String, Object> stats = new LinkedHashMap<>();
        long active = 0;
        // Count only the CURRENT revision of each chain so KPI cards match
        // the list rows (older revisions are surfaced through the Document
        // Workflow dropdown, never as separate list rows).
        for (String status : List.of("draft", "received", "partial", "completed", "cancelled")) {
            long count = paymentReceiptRepository.countCurrentByStatus(status);
            stats.put(status.replace(" ", ""), count);
            active += count;
        }
        stats.put("total", active);
        stats.put("active", active);
        stats.put("archived", paymentReceiptRepository.countCurrentByStatus("archived"));
        stats.put("deleted", paymentReceiptRepository.countCurrentByStatus("deleted"));
        stats.put("totalAmt", paymentReceiptRepository.sumAmountExcluding(excluded));
        return stats;
    }

    public PaymentReceiptResponse create(PaymentReceiptRequest request, boolean draft) {
        PaymentReceipt receipt = new PaymentReceipt();
        if (request.receiptNo() != null && !request.receiptNo().isBlank()) {
            if (paymentReceiptRepository.existsByReceiptNo(request.receiptNo().trim())) {
                throw new BadRequestException("Receipt number already exists: " + request.receiptNo());
            }
            receipt.setReceiptNo(request.receiptNo().trim());
        } else {
            receipt.setReceiptNo(buildNo(nextSequence()));
        }
        applyRequest(receipt, request);
        if (draft) {
            receipt.setStatus("draft");
        } else if (request.status() != null && !request.status().isBlank()) {
            receipt.setStatus(normalizeStatus(request.status()));
        } else {
            receipt.setStatus("received");
        }
        PaymentReceipt saved = paymentReceiptRepository.save(receipt);
        addTimeline(saved, "created", "Payment Receipt created",
                "Payment Receipt '" + saved.getReceiptNo() + "' was created.");
        addHistory(saved, "Payment Receipt", null, saved.getReceiptNo(), currentUserName());
        return toResponse(saved);
    }

    /**
     * Every edit creates a NEW revision row (BASE(N)); the previous version is
     * never deleted or overwritten. Only the latest revision is editable.
     */
    public PaymentReceiptResponse update(Long id, PaymentReceiptRequest request) {
        PaymentReceipt current = getReceipt(id);
        if (!current.isLatestRevision()) {
            throw new BadRequestException("Only the latest revision can be edited");
        }
        Long baseId = current.getRevisionOf() != null ? current.getRevisionOf() : current.getId();
        int nextRev = maxRevisionOfChain(baseId) + 1;

        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(current);

        PaymentReceipt revision = new PaymentReceipt();
        copyForRevision(revision, current);
        applyRequest(revision, request);
        if (request.status() != null && !request.status().isBlank()) {
            revision.setStatus(normalizeStatus(request.status()));
        }
        revision.setReceiptNo(RevisionSupport.nextRevisionNumber(
                RevisionSupport.baseNumber(current.getReceiptNo()), nextRev));
        revision.setRevisionOf(baseId);
        revision.setRevision(nextRev);
        revision.setRevisionDate(java.time.LocalDateTime.now());
        revision.setLatestRevision(true);

        current.setLatestRevision(false);
        paymentReceiptRepository.save(current);
        PaymentReceipt saved = paymentReceiptRepository.saveAndFlush(revision);
        addTimeline(saved, "revision", "Revision " + nextRev + " created",
                "Revision '" + saved.getReceiptNo() + "' created from '" + current.getReceiptNo()
                        + "' by " + currentUserName() + ".");
        editHistory.recordEdit("payment-receipt", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponseDetail(saved);
    }

    public PaymentReceiptResponse delete(Long id) {
        PaymentReceipt receipt = getReceipt(id);
        RevisionSupport.requireLatest(receipt.isLatestRevision());
        receipt.setStatus("deleted");
        receipt.setArchivedAt(LocalDateTime.now());
        addTimeline(receipt, "deleted", "Payment Receipt deleted",
                "Payment Receipt was moved to trash by " + currentUserName() + ".");
        addHistory(receipt, "Status", null, "Deleted", currentUserName());
        return toResponse(paymentReceiptRepository.save(receipt));
    }

    public PaymentReceiptResponse restore(Long id) {
        PaymentReceipt receipt = getReceipt(id);
        RevisionSupport.requireLatest(receipt.isLatestRevision());
        String previous = receipt.getStatus();
        String target = ("deleted".equals(previous) || "archived".equals(previous)) ? "draft" : previous;
        receipt.setStatus(target);
        receipt.setArchivedAt(null);
        addTimeline(receipt, "restored", "Payment Receipt restored",
                "Payment Receipt was restored by " + currentUserName() + ".");
        addHistory(receipt, "Status", titleCase(previous), titleCase(target), currentUserName());
        return toResponse(paymentReceiptRepository.save(receipt));
    }

    public PaymentReceiptResponse archive(Long id) {
        PaymentReceipt receipt = getReceipt(id);
        RevisionSupport.requireLatest(receipt.isLatestRevision());
        receipt.setStatus("archived");
        receipt.setArchivedAt(LocalDateTime.now());
        addTimeline(receipt, "archived", "Payment Receipt archived",
                "Payment Receipt was archived by " + currentUserName() + ".");
        addHistory(receipt, "Status", null, "Archived", currentUserName());
        return toResponse(paymentReceiptRepository.save(receipt));
    }

    public PaymentReceiptResponse changeStatus(Long id, String status) {
        PaymentReceipt receipt = getReceipt(id);
        RevisionSupport.requireLatest(receipt.isLatestRevision());
        String normalized = normalizeStatus(status);
        if ("deleted".equals(receipt.getStatus())) {
            throw new BadRequestException("Cannot change status of a deleted Payment Receipt");
        }
        receipt.setStatus(normalized);
        addTimeline(receipt, "status", "Status changed",
                "Status changed to '" + titleCase(normalized) + "' by " + currentUserName() + ".");
        addHistory(receipt, "Status", null, titleCase(normalized), currentUserName());
        return toResponse(paymentReceiptRepository.save(receipt));
    }

    public PaymentReceiptResponse duplicate(Long id) {
        PaymentReceipt source = getReceipt(id);
        PaymentReceipt copy = new PaymentReceipt();
        copy.setReceiptNo(buildNo(nextSequence()));
        copy.setCompanyName(source.getCompanyName());
        copy.setCompanyGstin(source.getCompanyGstin());
        copy.setCompanyPan(source.getCompanyPan());
        copy.setCompanyState(source.getCompanyState());
        copy.setCompanyAddress(source.getCompanyAddress());
        copy.setClientId(source.getClientId());
        copy.setClientName(source.getClientName());
        copy.setContactPerson(source.getContactPerson());
        copy.setGstin(source.getGstin());
        copy.setEmail(source.getEmail());
        copy.setPhone(source.getPhone());
        copy.setPaymentMode(source.getPaymentMode());
        copy.setBankName(source.getBankName());
        copy.setBranch(source.getBranch());
        copy.setChequeTx(source.getChequeTx());
        copy.setReferenceNo(source.getReferenceNo());
        copy.setSource(source.getSource());
        copy.setInvoiceRef(source.getInvoiceRef());
        copy.setAmount(source.getAmount());
        copy.setRemarks(source.getRemarks());
        copy.setStatus("draft");
        copy.setPaymentDate(LocalDateTime.now());
        PaymentReceipt saved = paymentReceiptRepository.save(copy);
        addTimeline(saved, "created", "Payment Receipt created",
                "Duplicated from Payment Receipt '" + source.getReceiptNo() + "'.");
        addHistory(saved, "Payment Receipt", null, saved.getReceiptNo(), currentUserName());
        return toResponse(saved);
    }

    public int bulkArchive(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            PaymentReceipt receipt = getReceipt(id);
            if (!"archived".equals(receipt.getStatus()) && !"deleted".equals(receipt.getStatus())) {
                receipt.setStatus("archived");
                receipt.setArchivedAt(LocalDateTime.now());
                addTimeline(receipt, "archived", "Payment Receipt archived",
                        "Payment Receipt was archived by " + currentUserName() + ".");
                paymentReceiptRepository.save(receipt);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            PaymentReceipt receipt = getReceipt(id);
            if ("archived".equals(receipt.getStatus()) || "deleted".equals(receipt.getStatus())) {
                receipt.setStatus("draft");
                receipt.setArchivedAt(null);
                addTimeline(receipt, "restored", "Payment Receipt restored",
                        "Payment Receipt was restored by " + currentUserName() + ".");
                paymentReceiptRepository.save(receipt);
                count++;
            }
        }
        return count;
    }

    public int bulkDelete(List<Long> ids) {
        // Soft delete for trash parity with the single-delete endpoint: rows are
        // marked status="deleted" (and restorable) instead of being removed from
        // MySQL. Previously this hard-deleted rows while the UI said "trash".
        int count = 0;
        for (Long id : ids) {
            PaymentReceipt receipt = getReceipt(id);
            if (!"deleted".equals(receipt.getStatus())) {
                receipt.setStatus("deleted");
                receipt.setArchivedAt(LocalDateTime.now());
                addTimeline(receipt, "deleted", "Payment Receipt deleted",
                        "Payment Receipt was moved to trash by " + currentUserName() + ".");
                addHistory(receipt, "Status", null, "Deleted", currentUserName());
                paymentReceiptRepository.save(receipt);
                count++;
            }
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            PaymentReceipt receipt = getReceipt(id);
            // Remove the whole revision chain (base row + every revision row).
            Long baseId = receipt.getRevisionOf() != null ? receipt.getRevisionOf() : receipt.getId();
            List<PaymentReceipt> chain = new java.util.ArrayList<>();
            paymentReceiptRepository.findById(baseId).ifPresent(chain::add);
            chain.addAll(paymentReceiptRepository.findByRevisionOfOrderByRevisionDesc(baseId));
            for (PaymentReceipt r : chain) {
                // Purge related rows so no orphaned attachments/timeline/history/
                // edit-history/revision-snapshots survive the hard delete.
                timelineRepository.deleteByModuleTypeAndModuleId(MODULE, r.getId());
                historyRepository.deleteByModuleTypeAndModuleId(MODULE, r.getId());
                attachmentRepository.deleteByModuleTypeAndModuleId(MODULE, r.getId());
                editHistoryRepository.deleteByModuleTypeAndRecordId(MODULE, r.getId());
                recordRevisionRepository.deleteByModuleTypeAndRecordId(MODULE, r.getId());
            }
            paymentReceiptRepository.deleteAll(chain);
            count++;
        }
        return count;
    }

    @Transactional(readOnly = true)
    public List<PaymentReceiptResponse> export(String search, String status, String client, String paymentMode,
                                               String dateFrom, String dateTo,
                                               BigDecimal minAmount, BigDecimal maxAmount) {
        Specification<PaymentReceipt> spec = buildSpecification(search, status, client, paymentMode,
                dateFrom, dateTo, minAmount, maxAmount);
        return paymentReceiptRepository.findAll(spec).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public String buildCsv(List<PaymentReceiptResponse> receipts) {
        StringBuilder sb = new StringBuilder();
        sb.append("Receipt No,Date,Client,Payment Mode,Status,Amount,Created\n");
        for (PaymentReceiptResponse r : receipts) {
            sb.append(escapeCsv(r.receiptNo())).append(',')
              .append(escapeCsv(r.date())).append(',')
              .append(escapeCsv(r.clientName())).append(',')
              .append(escapeCsv(r.paymentMode())).append(',')
              .append(escapeCsv(r.status())).append(',')
              .append(r.amount() == null ? "" : r.amount().toPlainString()).append(',')
              .append(escapeCsv(r.createdAt())).append('\n');
        }
        return sb.toString();
    }

    @Transactional(readOnly = true)
    public List<SalesTimelineResponse> getTimeline(Long id) {
        getReceipt(id);
        return timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::timelineResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesHistoryResponse> getHistory(Long id) {
        getReceipt(id);
        return historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, id)
                .stream().map(this::historyResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SalesAttachmentResponse> getAttachments(Long id) {
        getReceipt(id);
        return attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, id)
                .stream().map(this::attachmentResponse).toList();
    }

    public SalesAttachmentResponse addAttachment(Long id, MultipartFile file) {
        PaymentReceipt pr = getReceipt(id);
        String storedName = fileStorageService.store(file);
        SalesAttachment attachment = new SalesAttachment();
        attachment.setModuleType(MODULE);
        attachment.setModuleId(id);
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setUrl(baseUrl + "/v1/files/" + storedName);
        SalesAttachment saved = attachmentRepository.save(attachment);
        addTimeline(id, "attachment", "File attached", file.getOriginalFilename());
        documentRepositoryService.registerFromAttachment(
                file.getOriginalFilename(), "Payment Receipt", id,
                pr.getReceiptNo(), pr.getClientId(), pr.getClientName(),
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(saved);
    }

    public void deleteAttachment(Long id, Long attachmentId) {
        getReceipt(id);
        SalesAttachment attachment = attachmentRepository.findById(attachmentId)
                .filter(a -> MODULE.equals(a.getModuleType()) && id.equals(a.getModuleId()))
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        attachmentRepository.delete(attachment);
    }

    private void copyForRevision(PaymentReceipt copy, PaymentReceipt source) {
        org.springframework.beans.BeanUtils.copyProperties(source, copy,
                "id", "items", "timeline", "revisionOf", "revision", "revisionDate", "latestRevision", "createdAt", "updatedAt", "archivedAt");
    }

    private int maxRevisionOfChain(Long baseId) {
        return paymentReceiptRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .mapToInt(PaymentReceipt::getRevision)
                .max()
                .orElse(0);
    }

    /** Detail response — also carries the full revision chain for the UI. */
    private PaymentReceiptResponse toResponseDetail(PaymentReceipt receipt) {
        return toResponse(receipt, revisionChain(receipt));
    }

    private List<RevisionInfo> revisionChain(PaymentReceipt receipt) {
        Long baseId = receipt.getRevisionOf() != null ? receipt.getRevisionOf() : receipt.getId();
        List<RevisionInfo> chain = new ArrayList<>();
        paymentReceiptRepository.findById(baseId).ifPresent(q -> chain.add(revisionInfo(q)));
        paymentReceiptRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .sorted(java.util.Comparator.comparingInt(PaymentReceipt::getRevision))
                .forEach(q -> chain.add(revisionInfo(q)));
        return chain;
    }

    private RevisionInfo revisionInfo(PaymentReceipt receipt) {
        return new RevisionInfo(
                receipt.getId(),
                receipt.getReceiptNo(),
                receipt.getRevision(),
                receipt.getStatus(),
                receipt.getRevisionDate() == null
                        ? (receipt.getCreatedAt() == null ? null : receipt.getCreatedAt().toString())
                        : receipt.getRevisionDate().toString(),
                receipt.isLatestRevision());
    }

    /** When the latest revision is deleted, the previous one becomes latest. */
    private void promotePreviousRevision(PaymentReceipt removed) {
        if (!removed.isLatestRevision()) {
            return;
        }
        Long baseId = removed.getRevisionOf() != null ? removed.getRevisionOf() : removed.getId();
        // Highest remaining revision row first (revision >= 1).
        paymentReceiptRepository.findByRevisionOfOrderByRevisionDesc(baseId).stream()
                .filter(q -> !q.getId().equals(removed.getId()))
                .filter(q -> !"deleted".equals(q.getStatus()))
                .findFirst()
                .ifPresentOrElse(q -> {
                    q.setLatestRevision(true);
                    paymentReceiptRepository.save(q);
                    removed.setLatestRevision(false);
                    paymentReceiptRepository.save(removed);
                }, () -> paymentReceiptRepository.findById(baseId).ifPresent(q -> {
                    // Fall back to the base row (revision 0) when no revision rows remain.
                    if (!q.getId().equals(removed.getId()) && !"deleted".equals(q.getStatus())) {
                        q.setLatestRevision(true);
                        paymentReceiptRepository.save(q);
                        removed.setLatestRevision(false);
                        paymentReceiptRepository.save(removed);
                    }
                }));
    }

    /** List/export response - carries no revision chain (avoids N+1). */
    private PaymentReceiptResponse toResponse(PaymentReceipt entity) {
        return toResponse(entity, List.of());
    }

    private PaymentReceiptResponse toResponse(PaymentReceipt receipt, List<RevisionInfo> revisions) {
        return new PaymentReceiptResponse(
                receipt.getId(), receipt.getReceiptNo(),
                receipt.getCompanyName(), receipt.getCompanyGstin(), receipt.getCompanyPan(),
                receipt.getCompanyState(), receipt.getCompanyAddress(),
                receipt.getClientId(), receipt.getClientName(), receipt.getContactPerson(),
                receipt.getGstin(), receipt.getEmail(), receipt.getPhone(),
                receipt.getPaymentDate() == null ? null : receipt.getPaymentDate().toLocalDate().toString(),
                receipt.getPaymentMode(), receipt.getBankName(), receipt.getBranch(),
                receipt.getChequeTx(), receipt.getReferenceNo(), receipt.getStatus(),
                receipt.getSource(), receipt.getInvoiceRef(), receipt.getAmount(), receipt.getRemarks(),
                receipt.getPaymentDate() == null
                        ? (receipt.getCreatedAt() == null ? null : receipt.getCreatedAt().toLocalDate().toString())
                        : receipt.getPaymentDate().toLocalDate().toString(),
                receipt.getCreatedAt() == null ? null : receipt.getCreatedAt().toString(),
                receipt.getUpdatedAt() == null ? null : receipt.getUpdatedAt().toString(),
                receipt.getArchivedAt() == null ? null : receipt.getArchivedAt().toString(),
                attachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(MODULE, receipt.getId())
                        .stream().map(this::attachmentResponse).toList(),
                timelineRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, receipt.getId())
                        .stream().map(this::timelineResponse).toList(),
                historyRepository.findByModuleTypeAndModuleIdOrderByCreatedAtAsc(MODULE, receipt.getId())
                        .stream().map(this::historyResponse).toList(),
                receipt.getRevision(),
                receipt.getRevisionOf(),
                receipt.isLatestRevision(),
                receipt.getRevisionDate() == null ? null : receipt.getRevisionDate().toString(),
                revisions
        );
    }

    private SalesAttachmentResponse attachmentResponse(SalesAttachment attachment) {
        return new SalesAttachmentResponse(attachment.getId(), attachment.getName(), attachment.getContentType(),
                attachment.getSize(), attachment.getUrl(),
                attachment.getUploadedAt() == null ? null : attachment.getUploadedAt().toString());
    }

    private SalesTimelineResponse timelineResponse(SalesTimeline entry) {
        return new SalesTimelineResponse(entry.getId(), entry.getType(), entry.getTitle(), entry.getDetail(),
                entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private SalesHistoryResponse historyResponse(SalesHistory entry) {
        return new SalesHistoryResponse(entry.getId(), entry.getField(), entry.getOldValue(), entry.getNewValue(),
                entry.getChangedBy(), entry.getCreatedAt() == null ? null : entry.getCreatedAt().toString());
    }

    private PaymentReceipt getReceipt(Long id) {
        return paymentReceiptRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Payment Receipt not found with id: " + id));
    }

    private void applyRequest(PaymentReceipt receipt, PaymentReceiptRequest request) {
        receipt.setCompanyName(request.companyName());
        receipt.setCompanyGstin(request.companyGstin());
        receipt.setCompanyPan(request.companyPan());
        receipt.setCompanyState(request.companyState());
        receipt.setCompanyAddress(request.companyAddress());
        receipt.setClientId(request.clientId());
        receipt.setClientName(request.clientName());
        receipt.setContactPerson(request.contactPerson());
        receipt.setGstin(request.gstin());
        receipt.setEmail(request.email());
        receipt.setPhone(request.phone());
        receipt.setPaymentDate(parseDate(request.paymentDate()));
        receipt.setPaymentMode(request.paymentMode());
        receipt.setBankName(request.bankName());
        receipt.setBranch(request.branch());
        receipt.setChequeTx(request.chequeTx());
        receipt.setReferenceNo(request.referenceNo());
        receipt.setSource(request.source());
        receipt.setInvoiceRef(request.invoiceRef());
        receipt.setAmount(request.amount() == null ? BigDecimal.ZERO : request.amount());
        receipt.setRemarks(request.remarks());
    }

    /**
     * Predicate keeping only the CURRENT row of each revision chain. A row is
     * kept when it is flagged latestRevision OR no other row in the same chain
     * (chain key = revisionOf, or the row id for the base) carries a strictly
     * higher revision number. Legacy base rows without a revision chain always
     * survive this filter, so the main list never shows older revisions as
     * separate rows (they remain reachable via the revision-history dropdown).
     */
    private Predicate latestPerChainPredicate(jakarta.persistence.criteria.Root<PaymentReceipt> root, jakarta.persistence.criteria.CriteriaQuery<?> query, jakarta.persistence.criteria.CriteriaBuilder cb) {
        Subquery<Long> newer = query.subquery(Long.class);
        jakarta.persistence.criteria.Root<PaymentReceipt> newerRoot = newer.from(PaymentReceipt.class);
        newer.select(newerRoot.get("id"));
        newer.where(cb.and(
                cb.equal(newerRoot.get("revisionOf"),
                        cb.coalesce(root.get("revisionOf"), root.get("id"))),
                cb.greaterThan(cb.coalesce(newerRoot.get("revision"), 0),
                        cb.coalesce(root.get("revision"), 0))));
        return cb.or(cb.isTrue(root.get("latestRevision")), cb.not(cb.exists(newer)));
    }

    private Specification<PaymentReceipt> buildSpecification(String search, String status, String client,
                                                             String paymentMode, String dateFrom, String dateTo,
                                                             BigDecimal minAmount, BigDecimal maxAmount) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(latestPerChainPredicate(root, query, cb));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("receiptNo")), like),
                        cb.like(cb.lower(root.get("clientName")), like),
                        cb.like(cb.lower(root.get("paymentMode")), like),
                        cb.like(cb.lower(root.get("invoiceRef")), like),
                        cb.like(cb.lower(cb.toString(root.get("referenceNo"))), like),
                        cb.like(cb.lower(cb.toString(root.get("chequeTx"))), like)
                ));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("status")), status.trim().toLowerCase()));
            } else {
                predicates.add(cb.not(root.get("status").in("archived", "deleted")));
            }
            if (client != null && !client.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("clientName")), client.trim().toLowerCase()));
            }
            if (paymentMode != null && !paymentMode.isBlank()) {
                predicates.add(cb.equal(cb.lower(root.get("paymentMode")), paymentMode.trim().toLowerCase()));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("paymentDate"), LocalDate.parse(dateFrom).atStartOfDay()));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("paymentDate"), LocalDate.parse(dateTo).atTime(23, 59, 59)));
            }
            if (minAmount != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("amount"), minAmount));
            }
            if (maxAmount != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("amount"), maxAmount));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Sort buildSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }
        String[] parts = sort.split(",");
        String field = parts[0];
        String mapped = switch (field) {
            case "clientName", "paymentDate", "paymentMode", "amount", "status", "createdAt", "updatedAt", "receiptNo"
                    -> "receiptNo".equals(field) ? "receiptNo" : field;
            case "id" -> "receiptNo";
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private long nextSequence() {
        long count = paymentReceiptRepository.count();
        long maxSuffix = 0;
        String prefix = "PR-" + Year.now().getValue() + "-";
        for (String no : paymentReceiptRepository.findAllReceiptNos()) {
            if (no != null && no.startsWith(prefix)) {
                try {
                    maxSuffix = Math.max(maxSuffix, Long.parseLong(no.substring(prefix.length())));
                } catch (NumberFormatException ignored) {
                    // skip malformed numbers
                }
            }
        }
        return Math.max(count, maxSuffix) + 1;
    }

    private String buildNo(long sequence) {
        return String.format("PR-%d-%06d", Year.now().getValue(), sequence);
    }

    private LocalDateTime parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            if (value.length() <= 10) {
                return LocalDate.parse(value, DATE_FMT).atStartOfDay();
            }
            return LocalDateTime.parse(value);
        } catch (Exception e) {
            return null;
        }
    }

    private String normalizeStatus(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase().replace(" ", "_");
        return switch (normalized) {
            case "received" -> "received";
            case "completed" -> "completed";
            case "pending" -> "pending";
            case "failed" -> "failed";
            case "cleared" -> "received";
            case "archived" -> "archived";
            case "deleted" -> "deleted";
            default -> "draft";
        };
    }

    private String titleCase(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.replace("_", " ");
        return normalized.substring(0, 1).toUpperCase() + normalized.substring(1).toLowerCase();
    }

    private String escapeCsv(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    private String currentUserName() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "System";
    }

    private void addTimeline(PaymentReceipt receipt, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(MODULE);
        entry.setModuleId(receipt.getId());
        entry.setType(type);
        entry.setTitle(title);
        entry.setDetail(detail);
        timelineRepository.save(entry);
    }

    private void addTimeline(Long id, String type, String title, String detail) {
        SalesTimeline entry = new SalesTimeline();
        entry.setModuleType(MODULE);
        entry.setModuleId(id);
        entry.setType(type);
        entry.setTitle(title);
        entry.setDetail(detail);
        timelineRepository.save(entry);
    }

    private void addHistory(PaymentReceipt receipt, String field, String oldValue, String newValue, String changedBy) {
        SalesHistory entry = new SalesHistory();
        entry.setModuleType(MODULE);
        entry.setModuleId(receipt.getId());
        entry.setField(field);
        entry.setOldValue(oldValue);
        entry.setNewValue(newValue);
        entry.setChangedBy(changedBy);
        historyRepository.save(entry);
    }
}
