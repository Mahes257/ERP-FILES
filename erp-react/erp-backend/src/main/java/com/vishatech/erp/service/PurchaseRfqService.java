package com.vishatech.erp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.PurchaseQuotation;
import com.vishatech.erp.entity.PurchaseAttachment;
import com.vishatech.erp.entity.PurchaseRequisition;
import com.vishatech.erp.entity.PurchaseRfq;
import com.vishatech.erp.entity.PurchaseRfqFollowUp;
import com.vishatech.erp.entity.PurchaseRfqItem;
import com.vishatech.erp.entity.PurchaseVendor;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.PurchaseQuotationRepository;
import com.vishatech.erp.repository.PurchaseAttachmentRepository;
import com.vishatech.erp.repository.PurchaseRequisitionRepository;
import com.vishatech.erp.repository.PurchaseRfqFollowUpRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import com.vishatech.erp.repository.PurchaseVendorRepository;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.util.PurchaseNumbering;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PurchaseRfqService {

    private static final List<String> RFQ_STATUSES = List.of(
            "Draft", "Pending Approval", "Approved", "Sent", "Quotation Received",
            "Evaluation", "1st Approval", "2nd Approval", "Final Approval",
            "Awarded", "Closed", "Cancelled", "Rejected");
    private static final Map<String, List<String>> TRANSITIONS = new LinkedHashMap<>();
    static {
        TRANSITIONS.put("Draft", List.of("Pending Approval", "Cancelled"));
        TRANSITIONS.put("Pending Approval", List.of("Approved", "Cancelled"));
        TRANSITIONS.put("Approved", List.of("Sent", "Cancelled"));
        TRANSITIONS.put("Sent", List.of("Quotation Received", "Evaluation", "Closed", "Cancelled"));
        TRANSITIONS.put("Quotation Received", List.of("Evaluation", "Closed", "Cancelled"));
        TRANSITIONS.put("Evaluation", List.of("1st Approval", "Awarded", "Closed", "Cancelled"));
        TRANSITIONS.put("1st Approval", List.of("2nd Approval", "Rejected"));
        TRANSITIONS.put("2nd Approval", List.of("Final Approval", "Rejected"));
        TRANSITIONS.put("Final Approval", List.of("Approved", "Rejected"));
        TRANSITIONS.put("Awarded", List.of("Closed"));
        TRANSITIONS.put("Closed", List.of());
        TRANSITIONS.put("Cancelled", List.of());
        TRANSITIONS.put("Rejected", List.of());
    }

    private final PurchaseRfqRepository rfqRepository;
    private final PurchaseRfqFollowUpRepository followUpRepository;
    private final PurchaseQuotationRepository quotationRepository;
    private final PurchaseRequisitionRepository requisitionRepository;
    private final PurchaseVendorRepository vendorRepository;
    private final PurchaseAttachmentRepository attachmentRepository;
    private final FileStorageService fileStorageService;
    private final PurchaseSupportService support;
    private final PurchaseNumbering numbering;
    private final AuditContext auditContext;
    private final PurchaseNotificationPublisher notifications;
    private final ObjectMapper mapper = new ObjectMapper();

    public PurchaseRfqService(PurchaseRfqRepository rfqRepository,
                              PurchaseRfqFollowUpRepository followUpRepository,
                              PurchaseQuotationRepository quotationRepository,
                              PurchaseRequisitionRepository requisitionRepository,
                              PurchaseVendorRepository vendorRepository,
                              PurchaseAttachmentRepository attachmentRepository,
                              FileStorageService fileStorageService,
                              PurchaseSupportService support,
                              PurchaseNumbering numbering,
                              AuditContext auditContext,
                              PurchaseNotificationPublisher notifications) {
        this.rfqRepository = rfqRepository;
        this.followUpRepository = followUpRepository;
        this.quotationRepository = quotationRepository;
        this.requisitionRepository = requisitionRepository;
        this.vendorRepository = vendorRepository;
        this.attachmentRepository = attachmentRepository;
        this.fileStorageService = fileStorageService;
        this.support = support;
        this.numbering = numbering;
        this.auditContext = auditContext;
        this.notifications = notifications;
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> request) {
        PurchaseRfq rfq = new PurchaseRfq();
        String supplied = text(request, "rfqNo");
        String no = supplied.isBlank() ? numbering.nextRfqNo(numbering.maxSequence(
                rfqRepository.findAll().stream().map(PurchaseRfq::getRfqNo).toList(), "RFQ")) : supplied;
        if (rfqRepository.existsByRfqNo(no)) throw new BadRequestException("RFQ number already exists");
        rfq.setRfqNo(no);
        apply(rfq, request, true);
        rfqRepository.save(rfq);
        support.log(PurchaseSupportService.DOC_RFQ, rfq.getId(), "create", "RFQ created", no);
        notifications.publish(PurchaseNotificationPublisher.EVENT_RFQ_CREATED,
                "RFQ " + rfq.getRfqNo() + " created",
                "RFQ " + rfq.getRfqNo() + " ("
                        + (rfq.getTitle() == null ? rfq.getRfqNo() : rfq.getTitle())
                        + ") was created and is awaiting approval before sending.",
                rfq.getId(), "PurchaseRfq");
        return response(rfq);
    }

    @Transactional
    public Map<String, Object> update(Long id, Map<String, Object> request) {
        PurchaseRfq rfq = get(id);
        if (!List.of("Draft", "Pending Approval", "Approved").contains(rfq.getStatus())) {
            throw new BadRequestException("RFQ scope can only be edited before sourcing begins");
        }
        apply(rfq, request, false);
        rfqRepository.save(rfq);
        support.log(PurchaseSupportService.DOC_RFQ, id, "update", "RFQ updated", "");
        return response(rfq);
    }

    /**
     * Hard-delete an RFQ. This mirrors the frontend/mock deletability
     * contract exactly: only Draft, Pending Approval and Cancelled RFQs
     * with no quotations on file may be removed. Anything further along
     * the sourcing lifecycle (Sent onwards) has vendor-facing commitments
     * or downstream documents that key off rfqNo, so those must go through
     * Cancel instead — which preserves the audit trail.
     */
    @Transactional
    public void delete(Long id) {
        PurchaseRfq rfq = get(id);
        if (!List.of("Draft", "Pending Approval", "Cancelled").contains(rfq.getStatus())) {
            throw new BadRequestException(
                    rfq.getRfqNo() + " is " + rfq.getStatus()
                            + " and cannot be deleted — vendors may already be engaged. Cancel it instead.");
        }
        if (!quotationRepository.findByRfqNoOrderByScoreDesc(rfq.getRfqNo()).isEmpty()) {
            throw new BadRequestException(
                    rfq.getRfqNo() + " has quotations on file and cannot be deleted. Cancel it instead.");
        }
        /* Follow-ups hold a DB foreign key on rfq_no, so the hard delete
           would fail while any remain. Already-soft-deleted follow-ups are
           invisible in the UI and are cascaded away with their parent; a
           live (active/archived) follow-up is a genuine dependency and
           blocks the delete with a clear message instead of a raw 409. */
        List<PurchaseRfqFollowUp> followUps = followUpRepository.findByRfqNo(rfq.getRfqNo());
        long liveFollowUps = followUps.stream()
                .filter(f -> !"deleted".equalsIgnoreCase(f.getRecordState()))
                .count();
        if (liveFollowUps > 0) {
            throw new BadRequestException(
                    rfq.getRfqNo() + " has " + liveFollowUps
                            + " active follow-up(s) on file and cannot be deleted. Remove them first.");
        }
        if (!followUps.isEmpty()) {
            followUpRepository.deleteAllInBatch(followUps);
        }
        rfqRepository.delete(rfq);
    }

    @Transactional
    public Map<String, Object> duplicate(Long id) {
        Map<String, Object> source = new LinkedHashMap<>(response(get(id)));
        source.remove("id");
        source.remove("rfqNo");
        source.put("title", text(source, "title") + " (Copy)");
        return create(source);
    }

    @Transactional
    public void logPrint(Long id) {
        PurchaseRfq rfq = get(id);
        support.log(PurchaseSupportService.DOC_RFQ, id, "print", "RFQ printed", rfq.getRfqNo());
    }

    @Transactional
    public void comment(Long id, String text) {
        get(id);
        support.log(PurchaseSupportService.DOC_RFQ, id, "comment", "RFQ comment", text == null ? "" : text);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> dashboard() {
        return stats();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> costEstimates() {
        return rfqRepository.findAll().stream().map(this::response).toList();
    }

    @Transactional
    public Map<String, Object> transition(Long id, String target, String note) {
        PurchaseRfq rfq = get(id);
        if (!RFQ_STATUSES.contains(target) || !TRANSITIONS.getOrDefault(rfq.getStatus(), List.of()).contains(target)) {
            throw new BadRequestException("Invalid RFQ transition: " + rfq.getStatus() + " -> " + target);
        }
        if ("Sent".equals(target) && vendorNames(rfq).isEmpty()) {
            throw new BadRequestException("Select at least one approved supplier before sending the RFQ");
        }
        String previous = rfq.getStatus();
        rfq.setStatus(target);
        if ("Approved".equals(target)) rfq.setApprovalStatus("Approved");
        if ("Cancelled".equals(target)) rfq.setApprovalStatus("Rejected");
        rfqRepository.save(rfq);
        support.log(PurchaseSupportService.DOC_RFQ, id, target.toLowerCase(), "RFQ " + target, note, previous, target);
        return response(rfq);
    }

    @Transactional
    public Map<String, Object> addQuotation(Map<String, Object> request) {
        String rfqNo = text(request, "rfqNo");
        PurchaseRfq rfq = rfqRepository.findByRfqNo(rfqNo)
                .orElseThrow(() -> new ResourceNotFoundException("RFQ not found: " + rfqNo));
        if (!List.of("Sent", "Quotation Received", "Evaluation").contains(rfq.getStatus())) {
            throw new BadRequestException("RFQ is not open to quotations");
        }
        String vendor = text(request, "vendor");
        if (!vendorNames(rfq).contains(vendor)) throw new BadRequestException("Supplier is not invited to this RFQ");
        PurchaseVendor supplier = vendorRepository.findByRecordStateAndStatus("active", "Approved").stream()
                .filter(v -> v.getName().equals(vendor)).findFirst()
                .orElseThrow(() -> new BadRequestException("Supplier is not approved or active"));
        PurchaseQuotation quote = request.get("id") == null ? new PurchaseQuotation()
                : quotationRepository.findById(longValue(request.get("id"))).orElseThrow(() -> new ResourceNotFoundException("Quotation not found"));
        String quotationNo = text(request, "quotationNo");
        if (quotationNo.isBlank()) quotationNo = numbering.nextQuotationNo(
                numbering.maxPlainSequence(quotationRepository.findAll().stream().map(PurchaseQuotation::getQuotationNo).toList(), "QT"));
        if (quotationNo.equals("") || (quotationRepository.existsByQuotationNo(quotationNo)
                && (quote.getId() == null || !quotationNo.equals(quote.getQuotationNo())))) {
            throw new BadRequestException("Quotation number already exists");
        }
        quote.setQuotationNo(quotationNo);
        quote.setRfqNo(rfqNo);
        quote.setVendor(supplier.getName());
        quote.setSubmittedOn(text(request, "submittedOn"));
        quote.setCurrency(text(request, "currency").isBlank() ? rfq.getCurrency() : text(request, "currency"));
        quote.setDelivery(intValue(request, "delivery"));
        quote.setLeadTime(intValue(request, "leadTime"));
        quote.setValidUntil(text(request, "validUntil"));
        quote.setPaymentTerms(text(request, "paymentTerms"));
        quote.setWarranty(text(request, "warranty"));
        quote.setDiscount(decimal(request, "discount"));
        quote.setTax(decimal(request, "tax"));
        quote.setCharges(decimal(request, "charges"));
        quote.setFreight(decimal(request, "freight"));
        quote.setInsurance(decimal(request, "insurance"));
        quote.setItemsJson(json(request.get("items") == null ? rfqItems(rfq) : request.get("items")));
        quote.setTotal(decimal(request, "total").signum() == 0 ? calculateTotal(quote) : decimal(request, "total"));
        quote.setNotes(text(request, "notes").isBlank() ? text(request, "remarks") : text(request, "notes"));
        quote.setStatus(text(request, "status").isBlank() ? "Received" : text(request, "status"));
        quote.setScore(BigDecimal.ZERO);
        quotationRepository.save(quote);
        if ("Sent".equals(rfq.getStatus())) rfq.setStatus("Quotation Received");
        rfq.setVendorsJson(json(quotationRepository.findByRfqNoOrderByScoreDesc(rfqNo).stream().map(PurchaseQuotation::getVendor).distinct().toList()));
        rfqRepository.save(rfq);
        support.log(PurchaseSupportService.DOC_RFQ, rfq.getId(), "quotation", "Quotation received", quote.getQuotationNo());
        notifications.publish(PurchaseNotificationPublisher.EVENT_QUOTATION_RECEIVED,
                "Quotation " + quote.getQuotationNo() + " received",
                "Quotation " + quote.getQuotationNo() + " from " + quote.getVendor()
                        + " received for RFQ " + rfq.getRfqNo() + ".",
                rfq.getId(), "PurchaseRfq");
        return quotationResponse(quote);
    }

    @Transactional
    public Map<String, Object> award(Long id, String vendor, String note) {
        PurchaseRfq rfq = get(id);
        if (!List.of("Evaluation", "Approved", "Final Approval").contains(rfq.getStatus())) {
            throw new BadRequestException("RFQ must be under evaluation or approved before selection");
        }
        PurchaseQuotation quote = quotationRepository.findByRfqNoOrderByScoreDesc(rfq.getRfqNo()).stream()
                .filter(q -> q.getVendor().equals(vendor)).findFirst()
                .orElseThrow(() -> new BadRequestException("No quotation exists for selected supplier"));
        rfq.setAwardedVendor(vendor);
        rfq.setAwardedQuoteId(quote.getQuotationNo());
        rfq.setAwardedValue(quote.getTotal());
        rfq.setAwardedAt(LocalDateTime.now());
        rfq.setStatus("Awarded");
        quote.setStatus("Accepted");
        quotationRepository.save(quote);
        rfqRepository.save(rfq);
        support.log(PurchaseSupportService.DOC_RFQ, id, "award", "Supplier selected", note, "Evaluation", "Awarded");
        notifications.publish(PurchaseNotificationPublisher.EVENT_RFQ_AWARDED,
                "RFQ " + rfq.getRfqNo() + " awarded",
                "RFQ " + rfq.getRfqNo() + " awarded to " + vendor
                        + (note == null || note.isBlank() ? "." : " — " + note),
                rfq.getId(), "PurchaseRfq");
        return response(rfq);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> comparison(Long id) {
        PurchaseRfq rfq = get(id);
        List<Map<String, Object>> quotes = quotationRepository.findByRfqNoOrderByScoreDesc(rfq.getRfqNo()).stream()
                .map(this::quotationResponse).toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rfqNo", rfq.getRfqNo());
        result.put("items", rfqItems(rfq));
        result.put("quotations", quotes);
        result.put("lowestTotal", quotes.stream().map(q -> (BigDecimal) q.get("total")).min(Comparator.naturalOrder()).orElse(BigDecimal.ZERO));
        result.put("selectedSupplier", rfq.getAwardedVendor());
        result.put("selectionReason", rfq.getAwardedVendor() == null ? null : rfq.getAwardedQuoteId());
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getResponse(Long id) { return response(get(id)); }

    /**
     * String overload so the same endpoint accepts BOTH the numeric primary key
     * (document routes like /rfqs/1) and the human RFQ number (RFQ-YYYY-NNNN,
     * which the quotation / PO flows send). Previously a non-numeric id failed
     * Spring's Long type conversion -> 400, so RFQ detail (and the RFQ -> Vendor
     * cascade) could not load.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getResponse(String id) { return response(get(id)); }

    /** Resolves an RFQ by numeric PK or by RFQ number (RFQ-YYYY-NNNN). */
    public PurchaseRfq get(String id) {
        String key = id == null ? "" : id.trim();
        if (key.isEmpty()) throw new BadRequestException("RFQ id is required");
        if (key.matches("\\d+")) return get(Long.valueOf(key));
        return rfqRepository.findByRfqNo(key)
                .orElseThrow(() -> new ResourceNotFoundException("RFQ not found: " + key));
    }
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list() {
        List<PurchaseRfq> all = rfqRepository.findAll();
        // The quotation count each row displays is read ONCE for the whole page
        // (grouped query) instead of once per RFQ.
        Map<String, Long> quotationCounts = quotationCountsByRfqNo(all);
        return all.stream().map(r -> response(r, quotationCounts)).toList();
    }

    /**
     * Quotation counts per RFQ number in one grouped query.
     *
     * <p>Mirrors the {@code itemCountsByOrderIds} pattern used by the Sales Order
     * option feed: a list screen must never issue one count query per row.
     */
    private Map<String, Long> quotationCountsByRfqNo(List<PurchaseRfq> rfqs) {
        List<String> rfqNos = rfqs.stream()
                .map(PurchaseRfq::getRfqNo)
                .filter(rfqNo -> rfqNo != null && !rfqNo.isBlank())
                .distinct()
                .toList();
        if (rfqNos.isEmpty()) {
            return Map.of();
        }
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : quotationRepository.countByRfqNos(rfqNos)) {
            counts.put((String) row[0], ((Number) row[1]).longValue());
        }
        return counts;
    }
    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        List<PurchaseRfq> all = rfqRepository.findAll();
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (String status : RFQ_STATUSES) byStatus.put(status, all.stream().filter(r -> status.equals(r.getStatus())).count());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", all.size());
        result.put("byStatus", byStatus);
        result.put("pendingApproval", byStatus.getOrDefault("Pending Approval", 0L));
        result.put("quotationReceived", byStatus.getOrDefault("Quotation Received", 0L));
        result.put("awarded", byStatus.getOrDefault("Awarded", 0L));
        result.put("closed", byStatus.getOrDefault("Closed", 0L));
        result.put("cancelled", byStatus.getOrDefault("Cancelled", 0L));
        result.put("draft", byStatus.getOrDefault("Draft", 0L));
        result.put("approved", byStatus.getOrDefault("Approved", 0L));
        result.put("sent", byStatus.getOrDefault("Sent", 0L));
        result.put("evaluation", byStatus.getOrDefault("Evaluation", 0L));
        result.put("overdue", overdueCount(all));
        result.put("totalValue", totalEstimatedValue(all));
        return result;
    }

    /**
     * RFQs still actionable but past their closing date — the same rule the
     * list KPI and the Overdue status filter use: a due date in the past on
     * any RFQ that has not reached a terminal stage (Draft is not yet
     * committed to vendors, so it never counts).
     */
    private long overdueCount(List<PurchaseRfq> all) {
        String today = LocalDate.now().toString();
        return all.stream().filter(r -> r.getDueDate() != null && !r.getDueDate().isBlank()
                && !List.of("Draft", "Awarded", "Closed", "Cancelled").contains(r.getStatus())
                && r.getDueDate().compareTo(today) < 0).count();
    }

    /** Sum of every RFQ's estimated value — the "Total RFQ Value" KPI card. */
    private BigDecimal totalEstimatedValue(List<PurchaseRfq> all) {
        BigDecimal total = BigDecimal.ZERO;
        for (PurchaseRfq r : all) if (r.getEstimatedValue() != null) total = total.add(r.getEstimatedValue());
        return total;
    }
    @Transactional(readOnly = true)
    public Map<String, Object> quotationStats() {
        List<PurchaseQuotation> all = quotationRepository.findAll();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", all.size());
        result.put("received", all.stream().filter(q -> "Received".equals(q.getStatus())).count());
        result.put("pending", all.stream().filter(q -> "Pending".equals(q.getStatus())).count());
        result.put("accepted", all.stream().filter(q -> "Accepted".equals(q.getStatus())).count());
        result.put("rejected", all.stream().filter(q -> "Rejected".equals(q.getStatus())).count());
        return result;
    }
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listQuotations(String rfqNo) {
        /* An absent rfqNo must mean "every quotation", not
           `where rfq_no = null` — the derived query for a null
           argument matches nothing, which silently emptied the whole
           quotation feed (and with it the evaluation rows derived
           from it). */
        List<PurchaseQuotation> quotes = (rfqNo == null || rfqNo.isBlank())
                ? quotationRepository.findAllByOrderByScoreDesc()
                : quotationRepository.findByRfqNoOrderByScoreDesc(rfqNo);
        return quotes.stream().map(this::quotationResponse).toList();
    }
    @Transactional(readOnly = true)
    public Map<String, Object> quotation(Long id) {
        PurchaseQuotation quote = quotationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Quotation not found: " + id));
        return quotationResponse(quote);
    }
    @Transactional
    public void deleteQuotation(Long id) {
        PurchaseQuotation quote = quotationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Quotation not found: " + id));
        if ("Accepted".equals(quote.getStatus())) throw new BadRequestException("Accepted quotations cannot be deleted");
        quotationRepository.delete(quote);
    }
    @Transactional
    public PurchaseSupportService.PurchaseAttachmentPayload uploadAttachment(Long id, MultipartFile file) {
        PurchaseRfq rfq = get(id);
        if (file == null || file.isEmpty()) throw new BadRequestException("Attachment file is required");
        String stored = fileStorageService.store(file);
        PurchaseAttachment a = new PurchaseAttachment();
        a.setDocType(PurchaseSupportService.DOC_RFQ);
        a.setDocId(rfq.getId());
        a.setName(file.getOriginalFilename());
        a.setStoredName(stored);
        a.setContentType(file.getContentType());
        a.setSize(file.getSize());
        a.setUrl("/v1/files/" + stored);
        a.setUploadedBy(auditContext.currentUserName());
        attachmentRepository.save(a);
        support.log(PurchaseSupportService.DOC_RFQ, id, "attachment", "Attachment uploaded", a.getName());
        return support.attachmentPayload(a);
    }
    public void deleteAttachment(Long id, Long attachmentId) {
        PurchaseAttachment a = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Attachment not found with id: " + attachmentId));
        if (!PurchaseSupportService.DOC_RFQ.equals(a.getDocType()) || !a.getDocId().equals(id)) {
            throw new ResourceNotFoundException("Attachment not found on this RFQ");
        }
        attachmentRepository.delete(a);
        support.log(PurchaseSupportService.DOC_RFQ, id, "attachment", "Attachment deleted", a.getName());
    }
    public PurchaseRfq get(Long id) {
        return rfqRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("RFQ not found: " + id));
    }

    private void apply(PurchaseRfq rfq, Map<String, Object> r, boolean create) {
        rfq.setTitle(required(r, "title", "RFQ title"));
        rfq.setReference(text(r, "reference").isBlank() ? text(r, "prNo") : text(r, "reference"));
        rfq.setPrNo(rfq.getReference());
        if (!rfq.getPrNo().isBlank()) {
            PurchaseRequisition pr = requisitionRepository.findByPrNo(rfq.getPrNo())
                    .orElseThrow(() -> new BadRequestException("Linked PR not found: " + rfq.getPrNo()));
            if (!List.of("Approved", "Technical Specification Review", "Ready for RFQ").contains(pr.getStatus())) {
                throw new BadRequestException("Only an approved PR can create an RFQ");
            }
            if (r.get("items") == null || !(r.get("items") instanceof List<?>)) r.put("items", prItems(pr));
        }
        rfq.setDescription(text(r, "description"));
        rfq.setDepartment(text(r, "department"));
        rfq.setProject(text(r, "project"));
        rfq.setRequester(text(r, "requester"));
        rfq.setBuyer(text(r, "buyer"));
        rfq.setPriority(text(r, "priority"));
        rfq.setValidity(intValue(r, "validity"));
        rfq.setDueDate(text(r, "dueDate"));
        rfq.setCurrency(text(r, "currency"));
        rfq.setIncoterm(text(r, "incoterm"));
        rfq.setDeliveryAddress(text(r, "deliveryAddress"));
        rfq.setNotes(text(r, "notes"));
        rfq.setCommercialTermsJson(json(r.get("commercialTerms")));
        rfq.setEstimatedValue(decimal(r, "estimatedValue"));
        List<String> vendors = stringList(r.get("vendorNames") == null ? r.get("vendors") : r.get("vendorNames"));
        for (String name : vendors) vendorRepository.findByRecordStateAndStatus("active", "Approved").stream()
                .filter(v -> v.getName().equals(name)).findFirst()
                .orElseThrow(() -> new BadRequestException("Supplier is not approved or active: " + name));
        rfq.setVendorNamesJson(json(vendors));
        if (r.get("items") != null) {
            rfq.getItems().clear();
            for (Map<String, Object> item : mapList(r.get("items"))) {
                PurchaseRfqItem line = new PurchaseRfqItem();
                line.setRfq(rfq);
                line.setItemCode(text(item, "itemCode"));
                line.setProduct(required(item, "product", "RFQ item product"));
                line.setCategory(text(item, "category"));
                line.setSpecification(text(item, "specification"));
                line.setRequiredDate(text(item, "requiredDate"));
                line.setHsn(text(item, "hsn"));
                line.setUom(text(item, "uom"));
                line.setQty(decimal(item, "qty"));
                line.setRate(decimal(item, "rate"));
                if (line.getQty().signum() <= 0) throw new BadRequestException("RFQ quantities must be positive");
                rfq.getItems().add(line);
            }
        }
        if (create) { rfq.setStatus("Draft"); rfq.setApprovalStatus("Pending"); }
    }

    private Map<String, Object> response(PurchaseRfq r) {
        return response(r, null);
    }

    /**
     * @param quotationCounts counts already computed for the rows being mapped
     *                        (list paths), or {@code null} for a single RFQ, which
     *                        then reads its own count.
     */
    private Map<String, Object> response(PurchaseRfq r, Map<String, Long> quotationCounts) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", r.getId()); out.put("rfqNo", r.getRfqNo()); out.put("title", r.getTitle());
        out.put("reference", r.getReference()); out.put("prNo", r.getPrNo()); out.put("description", r.getDescription());
        out.put("department", r.getDepartment()); out.put("project", r.getProject()); out.put("requester", r.getRequester());
        out.put("buyer", r.getBuyer()); out.put("priority", r.getPriority()); out.put("vendorNames", vendorNames(r));
        out.put("vendors", vendorNames(r)); out.put("validity", r.getValidity()); out.put("dueDate", r.getDueDate());
        out.put("currency", r.getCurrency()); out.put("incoterm", r.getIncoterm()); out.put("deliveryAddress", r.getDeliveryAddress());
        out.put("notes", r.getNotes()); out.put("commercialTerms", parseMap(r.getCommercialTermsJson()));
        out.put("status", r.getStatus()); out.put("approvalStatus", r.getApprovalStatus()); out.put("estimatedValue", r.getEstimatedValue());
        out.put("awardedVendor", r.getAwardedVendor()); out.put("awardedQuoteId", r.getAwardedQuoteId());
        out.put("awardedValue", r.getAwardedValue()); out.put("awardedAt", r.getAwardedAt());
        out.put("poNo", r.getPoNo()); out.put("items", rfqItems(r)); out.put("vendorCount", vendorNames(r).size());
        // Kept as an int so the JSON payload is byte-for-byte what it was before the
        // count was batched.
        out.put("quotationReceived", quotationCounts != null
                ? Math.toIntExact(quotationCounts.getOrDefault(r.getRfqNo(), 0L))
                : quotationRepository.findByRfqNoOrderByScoreDesc(r.getRfqNo()).size());
        out.put("createdAt", r.getCreatedAt()); return out;
    }

    private Map<String, Object> quotationResponse(PurchaseQuotation q) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", q.getId()); out.put("quotationNo", q.getQuotationNo()); out.put("rfqNo", q.getRfqNo());
        out.put("vendor", q.getVendor()); out.put("submittedOn", q.getSubmittedOn()); out.put("total", q.getTotal());
        out.put("currency", q.getCurrency()); out.put("delivery", q.getDelivery()); out.put("validUntil", q.getValidUntil());
        out.put("leadTime", q.getLeadTime()); out.put("paymentTerms", q.getPaymentTerms()); out.put("warranty", q.getWarranty());
        out.put("discount", q.getDiscount()); out.put("tax", q.getTax()); out.put("charges", q.getCharges());
        out.put("freight", q.getFreight()); out.put("insurance", q.getInsurance()); out.put("score", q.getScore());
        out.put("status", q.getStatus()); out.put("items", parseList(q.getItemsJson())); out.put("notes", q.getNotes());
        return out;
    }

    private List<Map<String, Object>> rfqItems(PurchaseRfq r) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (PurchaseRfqItem i : r.getItems()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("itemCode", i.getItemCode()); m.put("product", i.getProduct()); m.put("category", i.getCategory());
            m.put("specification", i.getSpecification()); m.put("requiredDate", i.getRequiredDate()); m.put("hsn", i.getHsn());
            m.put("uom", i.getUom()); m.put("qty", i.getQty()); m.put("rate", i.getRate()); items.add(m);
        }
        return items;
    }
    private List<Map<String, Object>> prItems(PurchaseRequisition p) {
        return p.getItems().stream().map(i -> {
            Map<String, Object> m = new LinkedHashMap<>(); m.put("itemCode", i.getItemCode()); m.put("product", i.getProduct());
            m.put("category", i.getCategory()); m.put("specification", i.getSpecification()); m.put("hsn", i.getHsn());
            m.put("uom", i.getUom()); m.put("qty", i.getQty()); m.put("rate", i.getRate()); m.put("requiredDate", p.getExpectedDate()); return m;
        }).toList();
    }
    private BigDecimal calculateTotal(PurchaseQuotation q) {
        return parseList(q.getItemsJson()).stream().map(i -> decimal(i, "qty").multiply(decimal(i, "rate")))
                .reduce(BigDecimal.ZERO, BigDecimal::add).subtract(q.getDiscount()).add(q.getTax()).add(q.getCharges()).add(q.getFreight()).add(q.getInsurance());
    }
    private String text(Map<String, Object> m, String key) { Object v = m.get(key); return v == null ? "" : String.valueOf(v); }
    private String required(Map<String, Object> m, String key, String label) { String v = text(m, key); if (v.isBlank()) throw new BadRequestException(label + " is required"); return v; }
    private BigDecimal decimal(Map<String, Object> m, String key) { Object v = m.get(key); if (v == null || String.valueOf(v).isBlank()) return BigDecimal.ZERO; try { return new BigDecimal(String.valueOf(v)); } catch (NumberFormatException e) { throw new BadRequestException("Invalid amount: " + key); } }
    private int intValue(Map<String, Object> m, String key) { try { return m.get(key) == null ? 0 : Integer.parseInt(String.valueOf(m.get(key))); } catch (NumberFormatException e) { throw new BadRequestException("Invalid number: " + key); } }
    private long longValue(Object v) { return Long.parseLong(String.valueOf(v)); }
    private List<String> vendorNames(PurchaseRfq r) { return stringList(parseListAny(r.getVendorNamesJson())); }
    private List<String> stringList(Object v) { if (!(v instanceof List<?> l)) return List.of(); return l.stream().map(String::valueOf).toList(); }
    private List<Map<String, Object>> mapList(Object v) { if (!(v instanceof List<?> l)) return List.of(); return l.stream().filter(x -> x instanceof Map<?, ?>).map(x -> (Map<String, Object>) x).toList(); }
    private String json(Object v) { try { return v == null ? null : mapper.writeValueAsString(v); } catch (Exception e) { throw new BadRequestException("Invalid JSON payload"); } }
    private List<Map<String, Object>> parseList(String s) { try { return s == null ? List.of() : mapper.readValue(s, new TypeReference<>() {}); } catch (Exception e) { return List.of(); } }
    private Object parseListRaw(String s) { return parseList(s); }
    /**
     * Parses a stored JSON array whose elements may be strings OR objects
     * (legacy rows). parseList binds to List<Map<String,Object>> and fails
     * for string arrays such as purchase_rfqs.vendor_names_json
     * (["Vendor A","Vendor B"]), silently yielding an empty vendor list.
     * Here the array is read into Object and each element is reduced to
     * its name — maps fall back to common name keys, objects to
     * String.valueOf, exactly what stringList() expects.
     */
    private List<Object> parseListAny(String s) {
        if (s == null || s.isBlank()) return List.of();
        try {
            List<?> raw = mapper.readValue(s, new TypeReference<List<?>>() {});
            return raw.stream().map(el -> {
                if (el instanceof Map<?, ?> m) {
                    for (Object key : List.of("name", "vendorName", "vendor", "label")) {
                        Object v = m.get(key);
                        if (v != null) return v;
                    }
                    return String.valueOf(m);
                }
                return el;
            }).toList();
        } catch (Exception e) {
            return List.of();
        }
    }
    private Map<String, Object> parseMap(String s) { try { return s == null ? Map.of() : mapper.readValue(s, new TypeReference<>() {}); } catch (Exception e) { return Map.of(); } }
}
