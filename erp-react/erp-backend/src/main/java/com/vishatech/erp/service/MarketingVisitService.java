package com.vishatech.erp.service;

import com.vishatech.erp.dto.MarketingCreateLeadRequest;
import com.vishatech.erp.dto.MarketingFollowUpRequest;
import com.vishatech.erp.dto.MarketingFollowUpResponse;
import com.vishatech.erp.dto.MarketingLeadRequest;
import com.vishatech.erp.dto.MarketingLeadResponse;
import com.vishatech.erp.dto.MarketingPerformanceResponse;
import com.vishatech.erp.dto.MarketingSummaryResponse;
import com.vishatech.erp.dto.MarketingVisitDetailResponse;
import com.vishatech.erp.dto.MarketingVisitRequest;
import com.vishatech.erp.dto.MarketingVisitResponse;
import com.vishatech.erp.dto.VisitChangeHistoryResponse;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.entity.MarketingFollowUp;
import com.vishatech.erp.entity.MarketingLead;
import com.vishatech.erp.entity.MarketingVisit;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.repository.MarketingFollowUpRepository;
import com.vishatech.erp.repository.MarketingLeadRepository;
import com.vishatech.erp.repository.MarketingVisitRepository;
import com.vishatech.erp.repository.VisitChangeHistoryRepository;
import com.vishatech.erp.entity.VisitChangeHistory;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.dto.MarketingSearchResponse;
import com.vishatech.erp.crm.entity.Contact;
import com.vishatech.erp.crm.entity.Lead;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Offline Marketing module service. Standalone by design — Marketing Leads are
 * the module's OWN records (never the Sales CRM Lead) and nothing in this
 * module writes into Sales tables. Security is enforced at the record level:
 * the authenticated user (from Spring Security, never from the request body)
 * is the source of truth. A USER (marketer) can only see/edit their own
 * visits & leads; ADMIN and MANAGER can see everything.
 */
@Service
@Transactional
public class MarketingVisitService {

    // ---- Status vocabularies (accepts the existing UI values + spec aliases) ----
    public static final List<String> APPOINTMENT_STATUSES =
            List.of("Fixed", "Direct Visit", "Pending Confirmation", "Rescheduled", "Cancelled");
    public static final List<String> VISIT_STATUSES =
            List.of("Scheduled", "Planned", "In Progress", "Completed", "No Visit", "Rescheduled", "Cancelled");
    public static final List<String> QFORM_STATUSES =
            List.of("Not Prepared", "Draft", "Filled & Submitted", "Pending", "Not Required");
    public static final List<String> FOLLOWUP_STATUSES =
            List.of("Pending", "Completed", "Overdue", "Rescheduled", "Cancelled", "No Response");
    public static final List<String> FOLLOWUP_MODES =
            List.of("Visit", "Phone", "Phone Call", "WhatsApp", "Email", "Online Meeting", "Other");
    public static final List<String> OUTCOMES =
            List.of("Lead Generated", "Existing Customer Opportunity", "Existing Opportunity",
                    "Existing Order", "Follow-up Required", "No Lead", "Not Interested",
                    "Lost Opportunity", "Lost", "Need Further Discussion", "Other");
    public static final List<String> HANDOVER_STATUSES =
            List.of("Not Ready", "Ready for Sales", "Handed Over");
    public static final List<String> QUALIFIED_STAGES =
            List.of("Qualified", "Proposal", "Proposal Sent", "Negotiation");
    public static final List<String> LEAD_STAGES =
            List.of("New", "Contacted", "Qualified", "Proposal", "Proposal Sent", "Negotiation", "Won", "Lost");
    public static final List<String> LEAD_STATUSES =
            List.of("Active", "Inactive");
    public static final List<String> PRIORITIES =
            List.of("Low", "Medium", "High", "Urgent");

    private final MarketingVisitRepository visitRepository;
    private final MarketingFollowUpRepository followUpRepository;
    private final MarketingLeadRepository leadRepository;
    private final CustomerRepository customerRepository;
    private final AuditContext auditContext;
    private final VisitChangeHistoryRepository changeHistoryRepository;

    public MarketingVisitService(MarketingVisitRepository visitRepository,
                                 MarketingFollowUpRepository followUpRepository,
                                 MarketingLeadRepository leadRepository,
                                 CustomerRepository customerRepository,
                                 AuditContext auditContext,
                                 VisitChangeHistoryRepository changeHistoryRepository) {
        this.visitRepository = visitRepository;
        this.followUpRepository = followUpRepository;
        this.leadRepository = leadRepository;
        this.customerRepository = customerRepository;
        this.auditContext = auditContext;
        this.changeHistoryRepository = changeHistoryRepository;
    }

    // ============================== Visits — read ==============================

    public Page<MarketingVisitResponse> list(int page, int size, String search, String sort,
                                             String view, String marketer, String dateFrom, String dateTo,
                                             String appointmentStatus, String visitStatus,
                                             String qFormStatus, String leadStatus, String priority,
                                             String followupStatus, String outcome, String location) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort, "createdAt"));
        Specification<MarketingVisit> spec = buildVisitSpecification(search, view, marketer, dateFrom, dateTo,
                appointmentStatus, visitStatus, qFormStatus, leadStatus, priority, followupStatus,
                outcome, location)
                .and(scopeSpecification("marketerUserId"));
        return visitRepository.findAll(spec, pageable).map(this::toResponse);
    }

    public MarketingVisitDetailResponse get(Long id) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        return toDetail(visit);
    }

    /** All visits for the same marketing lead (or customer) — nothing is ever overwritten. */
    public List<MarketingVisitResponse> visitHistory(Long id) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        List<MarketingVisit> history = new ArrayList<>();
        if (visit.getLeadId() != null) {
            history.addAll(visitRepository.findByLeadIdOrderByCreatedAtDesc(visit.getLeadId()));
        } else if (visit.getCustomerId() != null) {
            history.addAll(visitRepository.findByCustomerIdOrderByCreatedAtDesc(visit.getCustomerId()));
        }
        return history.stream()
                .filter(v -> !v.getId().equals(visit.getId()) && !v.isDeleted())
                .map(this::toResponse)
                .toList();
    }

    /** All visits linked to a marketing lead. */
    public List<MarketingVisitResponse> leadVisits(Long leadId) {
        MarketingLead lead = findLead(leadId);
        assertCanAccessLead(lead);
        return visitRepository.findByLeadIdOrderByCreatedAtDesc(leadId).stream()
                .filter(v -> !v.isDeleted())
                .map(this::toResponse)
                .toList();
    }

    /**
     * Autocomplete search over real Marketing records (visits + leads), scoped
     * to what the authenticated user may see. Matches visit/lead numbers
     * (VST-YYYY-NNN, L-YYYY-NNN), ids, company/customer, contact, phone and
     * location — server-side, limited results, never the whole table.
     */
    public List<MarketingSearchResponse> search(String q, int limit) {
        if (q == null || q.isBlank()) {
            return List.of();
        }
        String term = q.trim();
        int safeLimit = Math.min(Math.max(limit, 1), 20);
        Map<String, MarketingSearchResponse> results = new LinkedHashMap<>();

        // Exact number/id match: "VST-2026-015", "L-2026-007" or a bare id.
        Long exactId = parseRecordNumber(term);
        if (exactId != null) {
            visitRepository.findById(exactId).ifPresent(v -> {
                if (!v.isDeleted() && isAccessible(v) && matchesNumber(term, visitNo(v.getId(), v.getCreatedAt()))) {
                    results.put("v:" + v.getId(), toSearchVisit(v));
                }
            });
            leadRepository.findById(exactId).ifPresent(l -> {
                if (isAccessibleLead(l) && matchesNumber(term, leadNo(l.getId(), l.getCreatedAt()))) {
                    results.put("l:" + l.getId(), toSearchLead(l));
                }
            });
        }

        // LIKE search over visits (id, company, customer, contact, phone, location, linked lead no).
        Specification<MarketingVisit> visitSpec = buildVisitSpecification(term, null, null, null, null,
                null, null, null, null, null, null, null, null)
                .and(scopeSpecification("marketerUserId"));
        visitRepository.findAll(visitSpec, PageRequest.of(0, safeLimit, Sort.by(Sort.Direction.DESC, "id")))
                .forEach(v -> results.putIfAbsent("v:" + v.getId(), toSearchVisit(v)));

        // LIKE search over leads (id, company, contact, phone, email, location).
        Specification<MarketingLead> leadSpec = buildLeadSpecification(term, null, null, null, null, null, null, null)
                .and(scopeSpecification("marketerUserId"));
        leadRepository.findAll(leadSpec, PageRequest.of(0, safeLimit, Sort.by(Sort.Direction.DESC, "id")))
                .forEach(l -> results.putIfAbsent("l:" + l.getId(), toSearchLead(l)));

        return results.values().stream().limit(safeLimit).toList();
    }

    private MarketingSearchResponse toSearchVisit(MarketingVisit v) {
        return new MarketingSearchResponse(
                v.getId(), "visit",
                visitNo(v.getId(), v.getCreatedAt()),
                v.getLeadNo(),
                firstNonBlank(v.getCompanyName(), v.getCustomerName()),
                v.getContactPerson(), v.getLocation(), v.getPhone(),
                v.getScheduleDate() != null ? v.getScheduleDate().toString() : null,
                null);
    }

    private MarketingSearchResponse toSearchLead(MarketingLead l) {
        return new MarketingSearchResponse(
                l.getId(), "lead",
                null,
                leadNo(l.getId(), l.getCreatedAt()),
                l.getCompanyName(),
                l.getContactPerson(), l.getLocation(), l.getPhone(),
                l.getLeadDate() != null ? l.getLeadDate().toString() : null,
                l.getVisitId());
    }

    /** Parses "123", "VST-2026-015" or "L-2026-007" to the underlying record id. */
    private Long parseRecordNumber(String term) {
        if (term.matches("\\d{1,15}")) {
            try {
                return Long.parseLong(term);
            } catch (NumberFormatException e) {
                return null;
            }
        }
        java.util.regex.Matcher m = Pattern.compile("^(?:VST|L)-(\\d{4})-(\\d+)$",
                Pattern.CASE_INSENSITIVE).matcher(term);
        if (m.matches()) {
            try {
                return Long.parseLong(m.group(2));
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    /** For bare-id terms any record matches; for VST-/L- terms the computed number must equal the term. */
    private boolean matchesNumber(String term, String computed) {
        if (term.matches("\\d+")) {
            return true;
        }
        return computed != null && computed.equalsIgnoreCase(term);
    }

    private boolean isAccessible(MarketingVisit v) {
        User user = auditContext.currentUser();
        if (user == null) return false;
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) return true;
        return v.getMarketerUserId() != null && v.getMarketerUserId().equals(user.getId());
    }

    private boolean isAccessibleLead(MarketingLead l) {
        User user = auditContext.currentUser();
        if (user == null) return false;
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) return true;
        return l.getMarketerUserId() != null && l.getMarketerUserId().equals(user.getId());
    }

    // ============================== Visits — write ==============================

    public MarketingVisitDetailResponse create(MarketingVisitRequest request) {
        User user = requireUser();
        MarketingVisit visit = new MarketingVisit();
        visit.setMarketer(user.getFullName() == null || user.getFullName().isBlank()
                ? user.getEmail() : user.getFullName());
        visit.setMarketerUserId(user.getId());
        apply(visit, request);
        // Visit status is system-controlled on creation — always "Planned";
        // never trust a status sent with the creation request.
        visit.setVisitStatus("Planned");
        validateBasic(visit);
        refreshLinkedData(visit, false);
        return toDetail(visitRepository.save(visit));
    }

    public MarketingVisitDetailResponse update(Long id, MarketingVisitRequest request) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        // Capture before values for change history
        Map<String, String> before = captureVisitFields(visit);
        boolean isDateChange = request.scheduleDate() != null && !request.scheduleDate().equals(visit.getScheduleDate());
        String changeType = isDateChange ? "RESCHEDULE" : "EDIT";
        apply(visit, request);
        validateBasic(visit);
        refreshLinkedData(visit, true);
        MarketingVisit saved = visitRepository.save(visit);
        // Record field changes
        String changedBy = getCurrentUserName();
        recordFieldChanges(id, before, saved, changeType, changedBy);
        return toDetail(saved);
    }

    /** Soft delete — history is preserved (ERP convention). */
    public void delete(Long id) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        visit.setDeleted(true);
        visit.setArchivedAt(LocalDateTime.now());
        visitRepository.save(visit);
    }

    /** Record Entry: meeting person + actual entry date/time (auto-starts the visit). */
    public MarketingVisitDetailResponse recordEntry(Long id, MarketingVisitRequest request) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        if (request.meetingPerson() != null && !request.meetingPerson().isBlank()) {
            visit.setMeetingPerson(request.meetingPerson().trim());
        }
        if (request.meetingDesignation() != null && !request.meetingDesignation().isBlank()) {
            visit.setMeetingDesignation(request.meetingDesignation().trim());
        }
        visit.setEntryDateTime(request.entryDateTime() != null ? request.entryDateTime() : LocalDateTime.now());
        if ("Scheduled".equals(visit.getVisitStatus()) || "Planned".equals(visit.getVisitStatus())) {
            visit.setVisitStatus("In Progress");
        }
        return toDetail(visitRepository.save(visit));
    }

    /** Record Exit: exit cannot precede entry. */
    public MarketingVisitDetailResponse recordExit(Long id, MarketingVisitRequest request) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        if (visit.getEntryDateTime() == null) {
            throw new BadRequestException("Exit cannot be recorded before entry — record the visit entry first");
        }
        LocalDateTime exit = request.exitDateTime() != null ? request.exitDateTime() : LocalDateTime.now();
        if (exit.isBefore(visit.getEntryDateTime())) {
            throw new BadRequestException("Exit date/time cannot be before the entry date/time");
        }
        visit.setExitDateTime(exit);
        if ("Scheduled".equals(visit.getVisitStatus()) || "Planned".equals(visit.getVisitStatus())) {
            visit.setVisitStatus("In Progress");
        }
        return toDetail(visitRepository.save(visit));
    }

    /** Start / Complete / Reschedule / Cancel / No Visit (guarded transitions). */
    public MarketingVisitDetailResponse changeStatus(Long id, String visitStatus) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        String next = requireIn(visitStatus, VISIT_STATUSES, "visit status");
        String current = visit.getVisitStatus();
        if (current != null && (current.equals("Completed") || current.equals("Cancelled"))
                && !next.equals(current)) {
            throw new BadRequestException("A " + current.toLowerCase() + " visit cannot be changed");
        }
        if (next.equals("Completed")) {
            if (visit.getEntryDateTime() == null) {
                throw new BadRequestException("Record the visit entry before completing the visit");
            }
            if (visit.getExitDateTime() == null) {
                throw new BadRequestException("Record the visit exit before completing the visit");
            }
        }
        visit.setVisitStatus(next);
        if (next.equals("Rescheduled") && !"Rescheduled".equals(visit.getAppointmentStatus())) {
            visit.setAppointmentStatus("Rescheduled");
        }
        if (next.equals("Cancelled") && !"Cancelled".equals(visit.getAppointmentStatus())) {
            visit.setAppointmentStatus("Cancelled");
        }
        return toDetail(visitRepository.save(visit));
    }

    public MarketingVisitDetailResponse saveQForm(Long id, MarketingVisitRequest request) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        if (request.qFormStatus() != null && !request.qFormStatus().isBlank()) {
            visit.setQFormStatus(requireIn(request.qFormStatus(), QFORM_STATUSES, "Q Form status"));
        }
        if (request.qFormDetails() != null) {
            visit.setQFormDetails(request.qFormDetails());
        }
        if (request.qFormRemarks() != null) {
            visit.setQFormRemarks(request.qFormRemarks());
        }
        if ("Filled & Submitted".equals(visit.getQFormStatus()) && visit.getQFormSubmittedAt() == null) {
            visit.setQFormSubmittedAt(LocalDateTime.now());
        }
        return toDetail(visitRepository.save(visit));
    }

    public MarketingVisitDetailResponse saveRequirement(Long id, MarketingVisitRequest request) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        applyRequirement(visit, request);
        return toDetail(visitRepository.save(visit));
    }

    public MarketingVisitDetailResponse saveDiscussion(Long id, MarketingVisitRequest request) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        applyDiscussion(visit, request);
        return toDetail(visitRepository.save(visit));
    }

    public MarketingVisitDetailResponse setOutcome(Long id, String outcome, String noLeadReason) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        if (outcome != null && !outcome.isBlank()) {
            visit.setOutcome(requireIn(outcome, OUTCOMES, "outcome"));
        }
        if ("No Lead".equals(visit.getOutcome()) && (noLeadReason == null || noLeadReason.isBlank())) {
            throw new BadRequestException("A reason is required when the visit outcome is No Lead");
        }
        if (noLeadReason != null) {
            visit.setNoLeadReason(noLeadReason);
        }
        return toDetail(visitRepository.save(visit));
    }

    /**
     * Create a standalone Marketing Lead from the visit (source forced to
     * "Offline Marketing") and link it. Returns the VISIT detail so the UI
     * drawer refreshes with the linked-lead snapshot — no Sales record involved.
     */
    public MarketingVisitDetailResponse createLead(Long id, MarketingCreateLeadRequest request) {
        if (request == null) {
            request = EMPTY_LEAD_REQUEST;
        }
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        if (visit.getLeadId() != null) {
            throw new BadRequestException("This visit is already linked to a marketing lead. "
                    + "Use Link Existing Lead to change the relationship.");
        }
        User user = requireUser();
        String company = firstNonBlank(request.companyName(), visit.getCompanyName(), visit.getCustomerName());
        if (company == null) {
            throw new BadRequestException("A company name is required to create a lead");
        }
        MarketingLead lead = new MarketingLead();
        lead.setCompanyName(company);
        lead.setContactPerson(firstNonBlank(request.contactPerson(), visit.getContactPerson()));
        lead.setDesignation(firstNonBlank(request.designation(), visit.getDesignation()));
        lead.setPhone(firstNonBlank(request.phone(), visit.getPhone()));
        lead.setEmail(firstNonBlank(request.email(), visit.getEmail()));
        lead.setLocation(visit.getLocation());
        lead.setMarketer(visit.getMarketer());
        lead.setMarketerUserId(user.getId());
        lead.setRequirement(buildRequirementText(visit));
        lead.setEstimatedValue(request.estimatedValue() != null ? request.estimatedValue() : visit.getEstimatedValue());
        lead.setPriority(request.priority() != null && !request.priority().isBlank()
                ? normalizePriority(request.priority()) : visit.getRequirementPriority());
        lead.setSource("Offline Marketing");
        lead.setStatus("Active");
        lead.setStage("New");
        lead.setLeadDate(LocalDate.now());
        lead.setVisitId(visit.getId());
        MarketingLead saved = leadRepository.save(lead);
        linkLeadInternal(visit, saved);
        return toDetail(visitRepository.save(visit));
    }

    /** Link an existing standalone marketing lead to the visit (owner-scoped). */
    public MarketingVisitDetailResponse linkLead(Long id, Long leadId) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        MarketingLead lead = findLead(leadId);
        assertCanAccessLead(lead);
        if (visit.getLeadId() != null && !visit.getLeadId().equals(leadId)) {
            throw new BadRequestException("This visit is already linked to a marketing lead. "
                    + "Unlink it before linking a different lead.");
        }
        linkLeadInternal(visit, lead);
        return toDetail(visitRepository.save(visit));
    }

    /** Add a follow-up: writes a history row AND updates the visit's current snapshot. */
    public MarketingVisitDetailResponse addFollowUp(Long id, MarketingFollowUpRequest request) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        User user = requireUser();
        MarketingFollowUp row = new MarketingFollowUp();
        row.setVisitId(visit.getId());
        row.setLeadId(visit.getLeadId());
        applyFollowUpFields(row, request);
        row.setCreatedBy(user.getFullName() == null || user.getFullName().isBlank() ? user.getEmail() : user.getFullName());
        followUpRepository.save(row);
        applyCurrentFollowUp(visit, request);
        return toDetail(visitRepository.save(visit));
    }

    /** Complete / Reschedule / update a visit follow-up history row + the current snapshot. */
    public MarketingVisitDetailResponse updateFollowUp(Long id, Long followUpId, MarketingFollowUpRequest request) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        MarketingFollowUp row = findFollowUp(followUpId);
        if (!visit.getId().equals(row.getVisitId())) {
            throw new AccessDeniedException("This follow-up does not belong to the visit");
        }
        applyFollowUpFields(row, request);
        followUpRepository.save(row);
        // Mirror the updated row onto the visit's current-follow-up snapshot.
        visit.setFollowupDate(row.getFollowupDate());
        visit.setFollowupMode(row.getMode());
        visit.setFollowupStatus(row.getStatus());
        visit.setNextAction(row.getNextAction());
        visit.setFollowupCustomerResponse(row.getCustomerResponse());
        visit.setFollowupRemarks(row.getRemarks());
        return toDetail(visitRepository.save(visit));
    }

    /** Mark the visit Ready for Sales / Handed Over — Marketing-internal state only. */
    public MarketingVisitDetailResponse handover(Long id, MarketingVisitRequest request) {
        MarketingVisit visit = findVisit(id);
        assertCanAccess(visit);
        String status = request.handoverStatus() != null && !request.handoverStatus().isBlank()
                ? requireIn(request.handoverStatus(), HANDOVER_STATUSES, "handover status")
                : "Ready for Sales";
        visit.setHandoverStatus(status);
        if (status.equals("Ready for Sales") && visit.getLeadId() == null) {
            throw new BadRequestException("Create or link a Marketing Lead before marking the visit Ready for Sales");
        }
        visit.setHandoverAt(LocalDateTime.now());
        visit.setHandoverTo(request.handoverTo() != null && !request.handoverTo().isBlank()
                ? request.handoverTo() : visit.getMarketer());
        if (request.handoverRemarks() != null) {
            visit.setHandoverRemarks(request.handoverRemarks());
        }
        return toDetail(visitRepository.save(visit));
    }

    // ============================== Standalone marketing leads ==============================

    public Page<MarketingLeadResponse> listLeads(int page, int size, String search, String sort,
                                                 String marketer, String dateFrom, String dateTo,
                                                 String status, String stage, String priority,
                                                 String location) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort, "leadDate"));
        Specification<MarketingLead> spec = buildLeadSpecification(search, marketer, dateFrom, dateTo,
                status, stage, priority, location)
                .and(scopeSpecification("marketerUserId"));
        return leadRepository.findAll(spec, pageable).map(this::toLeadResponse);
    }

    public MarketingLeadResponse getLead(Long id) {
        MarketingLead lead = findLead(id);
        assertCanAccessLead(lead);
        return toLeadResponse(lead);
    }

    public MarketingLeadResponse createLeadStandalone(MarketingLeadRequest request) {
        if (request.companyName() == null || request.companyName().isBlank()) {
            throw new BadRequestException("Company name is required");
        }
        User user = requireUser();
        MarketingLead lead = new MarketingLead();
        lead.setCompanyName(request.companyName().trim());
        lead.setMarketer(user.getFullName() == null || user.getFullName().isBlank()
                ? user.getEmail() : user.getFullName());
        lead.setMarketerUserId(user.getId());
        applyLead(lead, request);
        MarketingVisit linkedVisit = null;
        if (request.visitId() != null) {
            linkedVisit = findVisit(request.visitId());
            assertCanAccess(linkedVisit);
        }
        MarketingLead saved = leadRepository.save(lead);
        if (linkedVisit != null) {
            if (linkedVisit.getLeadId() != null && !linkedVisit.getLeadId().equals(saved.getId())) {
                throw new BadRequestException("The visit is already linked to another marketing lead");
            }
            linkLeadInternal(linkedVisit, saved);
            visitRepository.save(linkedVisit);
        }
        return toLeadResponse(saved);
    }

    public MarketingLeadResponse updateLead(Long id, MarketingLeadRequest request) {
        MarketingLead lead = findLead(id);
        assertCanAccessLead(lead);
        applyLead(lead, request);
        return toLeadResponse(leadRepository.save(lead));
    }

    /** All follow-ups for one marketing lead, newest first. */
    public List<MarketingFollowUpResponse> leadFollowUps(Long leadId) {
        MarketingLead lead = findLead(leadId);
        assertCanAccessLead(lead);
        return followUpRepository.findByLeadIdOrderByFollowupDateDescIdDesc(leadId)
                .stream().map(this::toFollowUpResponse).toList();
    }

    // ============================== Standalone follow-ups ==============================

    public Page<MarketingFollowUpResponse> listFollowUps(int page, int size, String search, String sort,
                                                         Long leadId, Long visitId, String status,
                                                         String mode, String marketer,
                                                         String dateFrom, String dateTo) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort, "followupDate"));
        Specification<MarketingFollowUp> spec = buildFollowUpSpecification(search, leadId, visitId,
                status, mode, marketer, dateFrom, dateTo)
                .and(followUpScopeSpecification());
        return followUpRepository.findAll(spec, pageable).map(this::toFollowUpResponse);
    }

    public MarketingFollowUpResponse getFollowUp(Long id) {
        MarketingFollowUp row = findFollowUp(id);
        assertCanAccessFollowUp(row);
        return toFollowUpResponse(row);
    }

    public MarketingFollowUpResponse createFollowUp(MarketingFollowUpRequest request) {
        if (request.leadId() == null && request.visitId() == null) {
            throw new BadRequestException("A marketing lead or visit must be specified for the follow-up");
        }
        User user = requireUser();
        MarketingFollowUp row = new MarketingFollowUp();
        if (request.visitId() != null) {
            MarketingVisit visit = findVisit(request.visitId());
            assertCanAccess(visit);
            row.setVisitId(visit.getId());
            row.setLeadId(request.leadId() != null ? request.leadId() : visit.getLeadId());
        } else {
            MarketingLead lead = findLead(request.leadId());
            assertCanAccessLead(lead);
            row.setLeadId(lead.getId());
        }
        applyFollowUpFields(row, request);
        row.setCreatedBy(user.getFullName() == null || user.getFullName().isBlank() ? user.getEmail() : user.getFullName());
        return toFollowUpResponse(followUpRepository.save(row));
    }

    public MarketingFollowUpResponse updateFollowUpStandalone(Long id, MarketingFollowUpRequest request) {
        MarketingFollowUp row = findFollowUp(id);
        assertCanAccessFollowUp(row);
        applyFollowUpFields(row, request);
        return toFollowUpResponse(followUpRepository.save(row));
    }

    public MarketingFollowUpResponse completeFollowUp(Long id) {
        MarketingFollowUp row = findFollowUp(id);
        assertCanAccessFollowUp(row);
        row.setStatus("Completed");
        return toFollowUpResponse(followUpRepository.save(row));
    }

    public MarketingFollowUpResponse rescheduleFollowUp(Long id, MarketingFollowUpRequest request) {
        MarketingFollowUp row = findFollowUp(id);
        assertCanAccessFollowUp(row);
        if (request.followupDate() == null) {
            throw new BadRequestException("A new follow-up date is required to reschedule");
        }
        row.setFollowupDate(request.followupDate());
        if (request.remarks() != null) {
            row.setRemarks(request.remarks());
        }
        row.setStatus("Rescheduled");
        return toFollowUpResponse(followUpRepository.save(row));
    }

    public void deleteFollowUp(Long id) {
        MarketingFollowUp row = findFollowUp(id);
        assertCanAccessFollowUp(row);
        followUpRepository.delete(row);
    }

    // ============================== Summary & performance ==============================

    public MarketingSummaryResponse summary() {
        Specification<MarketingVisit> scope = scopeSpecification("marketerUserId");
        LocalDate today = LocalDate.now();
        long todayVisits = countVisits(scope.and(viewSpecification("today", today)));
        long upcomingVisits = countVisits(scope.and(viewSpecification("upcoming", today)));
        long pendingVisits = countVisits(scope.and(viewSpecification("pending-visits", today)));
        long completedVisits = countVisits(scope.and(viewSpecification("completed", today)));
        long overdueFollowups = countVisits(scope.and(viewSpecification("overdue", today)));
        long todayFollowups = countVisits(scope.and(viewSpecification("today-followups", today)));
        long leadsGenerated = countVisits(scope.and(viewSpecification("leads", today)));
        long qualifiedLeads = countVisits(scope.and(viewSpecification("qualified-leads", today)));
        long noLeadVisits = countVisits(scope.and(viewSpecification("no-lead", today)));
        long salesHandoverPending = countVisits(scope.and(viewSpecification("handover", today)));
        return new MarketingSummaryResponse(todayVisits, upcomingVisits, pendingVisits, completedVisits,
                overdueFollowups, todayFollowups, leadsGenerated, qualifiedLeads, noLeadVisits,
                salesHandoverPending);
    }

    public MarketingPerformanceResponse performance(String marketer, String dateFrom, String dateTo) {
        LocalDate today = LocalDate.now();
        LocalDate from = dateFrom != null && !dateFrom.isBlank() ? LocalDate.parse(dateFrom) : null;
        LocalDate to = dateTo != null && !dateTo.isBlank() ? LocalDate.parse(dateTo) : null;

        // ---- Base visit set: non-deleted, optional marketer + date range ----
        Specification<MarketingVisit> base = (root, query, cb) -> cb.equal(root.get("deleted"), false);
        if (marketer != null && !marketer.isBlank()) {
            base = base.and((root, query, cb) -> cb.equal(root.get("marketer"), marketer));
        }
        if (from != null || to != null) {
            base = base.and(dateRangeSpecification(from, to));
        }
        List<MarketingVisit> visits = visitRepository.findAll(base);

        Map<String, RowBuilder> rows = new LinkedHashMap<>();
        long totalVisits = 0, todayVisits = 0, upcomingVisits = 0, pendingVisits = 0;
        long completedVisits = 0, cancelledVisits = 0, rescheduledVisits = 0;
        long directVisits = 0, fixedAppointments = 0;
        long qformsNotPrepared = 0, qformsSubmitted = 0;
        long leadsGenerated = 0, qualifiedLeads = 0, leadsOnFollowup = 0;
        long noLeadVisits = 0, lostLeads = 0, wonOpportunities = 0;
        BigDecimal pipeline = BigDecimal.ZERO;
        Map<String, Long> outcomes = new LinkedHashMap<>();

        for (MarketingVisit v : visits) {
            String key = v.getMarketer() == null ? "Unassigned" : v.getMarketer();
            RowBuilder row = rows.computeIfAbsent(key, RowBuilder::new);
            row.totalVisits++;
            totalVisits++;

            if (isOnDate(v, today)) {
                row.todayVisits++;
                todayVisits++;
            }
            if (isUpcoming(v, today, to)) {
                row.upcomingVisits++;
                upcomingVisits++;
            }
            if (isPendingVisit(v)) {
                row.pendingVisits++;
                pendingVisits++;
            }

            if ("Completed".equals(v.getVisitStatus())) {
                row.completedVisits++;
                completedVisits++;
            }
            if ("Cancelled".equals(v.getVisitStatus())) {
                cancelledVisits++;
            }
            if ("Rescheduled".equals(v.getVisitStatus())) {
                rescheduledVisits++;
            }
            if ("Direct Visit".equals(v.getAppointmentStatus())) {
                row.directVisits++;
                directVisits++;
            }
            if ("Fixed".equals(v.getAppointmentStatus())) {
                row.fixedAppointments++;
                fixedAppointments++;
            }

            // Q Form
            if ("Filled & Submitted".equals(v.getQFormStatus())) {
                row.qformsSubmitted++;
                qformsSubmitted++;
            }
            if ("Not Prepared".equals(v.getQFormStatus())) {
                qformsNotPrepared++;
            }

            // Lead
            if (v.getLeadId() != null) {
                row.leadsGenerated++;
                leadsGenerated++;
                if (v.getEstimatedValue() != null) {
                    row.pipelineValue = row.pipelineValue.add(v.getEstimatedValue());
                    pipeline = pipeline.add(v.getEstimatedValue());
                }
                if (isQualified(v.getLeadStage())) {
                    row.qualifiedLeads++;
                    qualifiedLeads++;
                }
                if ("Won".equalsIgnoreCase(v.getLeadStage())) {
                    row.wonOpportunities++;
                    wonOpportunities++;
                }
                if ("Pending".equals(v.getFollowupStatus()) || "Overdue".equals(v.getFollowupStatus())) {
                    leadsOnFollowup++;
                }
            }
            if (isLost(v)) {
                row.lostOpportunities++;
                lostLeads++;
            }
            if ("No Lead".equals(v.getOutcome())) {
                row.noLeadVisits++;
                noLeadVisits++;
            }

            // Current follow-up snapshot (visit-level)
            if ("Pending".equals(v.getFollowupStatus())) {
                row.pendingFollowups++;
            }
            if (v.getFollowupDate() != null && v.getFollowupDate().isBefore(today)
                    && ("Pending".equals(v.getFollowupStatus()) || "Overdue".equals(v.getFollowupStatus()))) {
                row.overdueFollowups++;
            }

            // Outcome distribution (actual values stored in the DB)
            if (v.getOutcome() != null && !v.getOutcome().isBlank()) {
                outcomes.merge(v.getOutcome(), 1L, Long::sum);
            }
        }

        // ---- Follow-up history metrics (append-only rows; date + marketer aware) ----
        Specification<MarketingFollowUp> fuSpec = (root, query, cb) -> cb.conjunction();
        if (marketer != null && !marketer.isBlank()) {
            fuSpec = fuSpec.and((root, query, cb) -> cb.equal(root.get("createdBy"), marketer));
        }
        if (from != null) {
            fuSpec = fuSpec.and((root, query, cb) -> cb.greaterThanOrEqualTo(root.get("followupDate"), from));
        }
        if (to != null) {
            fuSpec = fuSpec.and((root, query, cb) -> cb.lessThanOrEqualTo(root.get("followupDate"), to));
        }
        List<MarketingFollowUp> followUps = followUpRepository.findAll(fuSpec);

        long totalFollowups = 0, completedFollowups = 0, pendingFollowups = 0;
        long overdueFollowups = 0, rescheduledFollowups = 0;
        for (MarketingFollowUp fu : followUps) {
            totalFollowups++;
            String key = fu.getCreatedBy() == null ? "Unassigned" : fu.getCreatedBy();
            RowBuilder row = rows.computeIfAbsent(key, RowBuilder::new);
            row.followups++;
            String status = fu.getStatus() == null ? "" : fu.getStatus();
            if ("Completed".equals(status)) {
                completedFollowups++;
            } else if ("Pending".equals(status)) {
                pendingFollowups++;
            } else if ("Rescheduled".equals(status)) {
                rescheduledFollowups++;
            }
            boolean pastDue = fu.getFollowupDate() != null && fu.getFollowupDate().isBefore(today);
            if ("Overdue".equals(status) || ("Pending".equals(status) && pastDue)) {
                row.overdueFollowups++;
                overdueFollowups++;
            }
        }

        int qformCompletionPct = qformsSubmitted + qformsNotPrepared == 0 ? 0
                : Math.round((qformsSubmitted * 100f) / (qformsSubmitted + qformsNotPrepared));
        int followupCompletionPct = totalFollowups == 0 ? 0
                : Math.round((completedFollowups * 100f) / totalFollowups);

        List<MarketingPerformanceResponse.MarketerRow> rowsOut = rows.values().stream()
                .map(RowBuilder::build)
                .toList();
        return new MarketingPerformanceResponse(
                totalVisits, todayVisits, upcomingVisits, pendingVisits,
                completedVisits, cancelledVisits, rescheduledVisits, directVisits, fixedAppointments,
                qformsNotPrepared, qformsSubmitted, qformCompletionPct,
                leadsGenerated, qualifiedLeads, leadsOnFollowup, noLeadVisits, lostLeads,
                totalFollowups, completedFollowups, pendingFollowups, overdueFollowups,
                rescheduledFollowups, followupCompletionPct,
                outcomes, rowsOut, pipeline);
    }

    private boolean isOnDate(MarketingVisit v, LocalDate date) {
        if (date == null) return false;
        if (v.getAppointmentDate() != null) return v.getAppointmentDate().equals(date);
        return v.getScheduleDate() != null && v.getScheduleDate().equals(date);
    }

    private boolean isUpcoming(MarketingVisit v, LocalDate today, LocalDate rangeEnd) {
        if (v.getVisitStatus() != null && ("Completed".equals(v.getVisitStatus())
                || "Cancelled".equals(v.getVisitStatus()) || "No Visit".equals(v.getVisitStatus()))) {
            return false;
        }
        LocalDate date = v.getAppointmentDate() != null ? v.getAppointmentDate() : v.getScheduleDate();
        if (date == null || !date.isAfter(today)) return false;
        return rangeEnd == null || !date.isAfter(rangeEnd);
    }

    private boolean isPendingVisit(MarketingVisit v) {
        return v.getVisitStatus() != null && ("Planned".equals(v.getVisitStatus())
                || "Scheduled".equals(v.getVisitStatus()) || "In Progress".equals(v.getVisitStatus()));
    }

    // ============================== Helpers ==============================

    private static final MarketingCreateLeadRequest EMPTY_LEAD_REQUEST = new MarketingCreateLeadRequest(
            null, null, null, null, null, null, null, null, null, null);

    private static final class RowBuilder {
        private final String marketer;
        private long totalVisits;
        private long todayVisits;
        private long upcomingVisits;
        private long pendingVisits;
        private long completedVisits;
        private long qformsSubmitted;
        private long leadsGenerated;
        private long followups;
        private long overdueFollowups;
        private long directVisits;
        private long fixedAppointments;
        private long qualifiedLeads;
        private long pendingFollowups;
        private long wonOpportunities;
        private long lostOpportunities;
        private long noLeadVisits;
        private BigDecimal pipelineValue = BigDecimal.ZERO;

        private RowBuilder(String marketer) {
            this.marketer = marketer;
        }

        private MarketingPerformanceResponse.MarketerRow build() {
            return new MarketingPerformanceResponse.MarketerRow(marketer, totalVisits, completedVisits,
                    qformsSubmitted, leadsGenerated, followups, overdueFollowups,
                    directVisits, fixedAppointments, qualifiedLeads, pendingFollowups,
                    wonOpportunities, lostOpportunities, noLeadVisits, pipelineValue);
        }
    }

    private boolean isQualified(String stage) {
        if (stage == null) return false;
        for (String s : QUALIFIED_STAGES) {
            if (s.equalsIgnoreCase(stage)) return true;
        }
        return false;
    }

    private boolean isLost(MarketingVisit v) {
        if (v.getOutcome() != null
                && (v.getOutcome().equals("Lost Opportunity") || v.getOutcome().equals("Lost")
                || v.getOutcome().equals("Not Interested"))) {
            return true;
        }
        return "Lost".equalsIgnoreCase(v.getLeadStage());
    }

    private MarketingVisit findVisit(Long id) {
        MarketingVisit visit = visitRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Marketing visit not found with id: " + id));
        if (visit.isDeleted()) {
            throw new ResourceNotFoundException("Marketing visit not found with id: " + id);
        }
        return visit;
    }

    private MarketingLead findLead(Long id) {
        return leadRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Marketing lead not found with id: " + id));
    }

    private MarketingFollowUp findFollowUp(Long id) {
        return followUpRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Follow-up not found with id: " + id));
    }

    // ---- Record-level access control (identity comes from Spring Security) ----

    private void assertCanAccess(MarketingVisit visit) {
        User user = requireUser();
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) {
            return;
        }
        if (visit.getMarketerUserId() == null || !visit.getMarketerUserId().equals(user.getId())) {
            throw new AccessDeniedException("You can only access your own marketing visits");
        }
    }

    private void assertCanAccessLead(MarketingLead lead) {
        User user = requireUser();
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) {
            return;
        }
        if (lead.getMarketerUserId() == null || !lead.getMarketerUserId().equals(user.getId())) {
            throw new AccessDeniedException("You can only access your own marketing leads");
        }
    }

    private void assertCanAccessFollowUp(MarketingFollowUp row) {
        if (row.getVisitId() != null) {
            assertCanAccess(findVisit(row.getVisitId()));
        } else if (row.getLeadId() != null) {
            assertCanAccessLead(findLead(row.getLeadId()));
        } else {
            throw new AccessDeniedException("Follow-up is not accessible");
        }
    }

    private User requireUser() {
        User user = auditContext.currentUser();
        if (user == null) {
            throw new AccessDeniedException("Authentication required");
        }
        return user;
    }

    /** Generic list-visibility scope on the given owner column. */
    private <T> Specification<T> scopeSpecification(String ownerColumn) {
        return (root, query, cb) -> {
            User user = auditContext.currentUser();
            if (user == null) {
                return cb.disjunction();
            }
            if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) {
                return cb.conjunction();
            }
            return cb.equal(root.get(ownerColumn), user.getId());
        };
    }

    private Specification<MarketingFollowUp> followUpScopeSpecification() {
        return (root, query, cb) -> {
            User user = auditContext.currentUser();
            if (user == null) {
                return cb.disjunction();
            }
            if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) {
                return cb.conjunction();
            }
            // A marketer sees follow-ups on their own visits OR their own leads.
            List<Long> visitIds = visitRepository.findByMarketerUserIdOrderByCreatedAtDesc(user.getId())
                    .stream().map(MarketingVisit::getId).toList();
            List<Long> leadIds = leadRepository.findByMarketerUserId(user.getId())
                    .stream().map(MarketingLead::getId).toList();
            Predicate byVisit = root.get("visitId").in(visitIds.isEmpty() ? List.of(-1L) : visitIds);
            Predicate byLead = root.get("leadId").in(leadIds.isEmpty() ? List.of(-1L) : leadIds);
            return cb.or(byVisit, byLead);
        };
    }

    // ---- Specifications ----

    private Specification<MarketingVisit> buildVisitSpecification(String search, String view,
                                                                  String marketer, String dateFrom, String dateTo,
                                                                  String appointmentStatus, String visitStatus,
                                                                  String qFormStatus, String leadStatus,
                                                                  String priority, String followupStatus,
                                                                  String outcome, String location) {
        LocalDate today = LocalDate.now();
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("deleted"), false));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(cb.toString(root.get("id"))), like),
                        cb.like(cb.lower(root.get("companyName")), like),
                        cb.like(cb.lower(root.get("customerName")), like),
                        cb.like(cb.lower(root.get("contactPerson")), like),
                        cb.like(cb.lower(root.get("phone")), like),
                        cb.like(cb.lower(root.get("location")), like),
                        cb.like(cb.lower(root.get("leadNo")), like)
                ));
            }
            if (view != null && !view.isBlank()) {
                predicates.add(viewSpecification(view, today).toPredicate(root, query, cb));
            }
            if (marketer != null && !marketer.isBlank()) {
                predicates.add(cb.equal(root.get("marketer"), marketer));
            }
            if (dateFrom != null && !dateFrom.isBlank() || dateTo != null && !dateTo.isBlank()) {
                predicates.add(dateRangeSpecification(
                        dateFrom != null && !dateFrom.isBlank() ? LocalDate.parse(dateFrom) : null,
                        dateTo != null && !dateTo.isBlank() ? LocalDate.parse(dateTo) : null)
                        .toPredicate(root, query, cb));
            }
            if (appointmentStatus != null && !appointmentStatus.isBlank()) {
                predicates.add(cb.equal(root.get("appointmentStatus"), appointmentStatus));
            }
            if (visitStatus != null && !visitStatus.isBlank()) {
                predicates.add(cb.equal(root.get("visitStatus"), visitStatus));
            }
            if (qFormStatus != null && !qFormStatus.isBlank()) {
                predicates.add(cb.equal(root.get("qFormStatus"), qFormStatus));
            }
            if (leadStatus != null && !leadStatus.isBlank()) {
                predicates.add(cb.equal(root.get("leadStage"), leadStatus));
            }
            if (priority != null && !priority.isBlank()) {
                predicates.add(cb.equal(root.get("requirementPriority"), priority));
            }
            if (followupStatus != null && !followupStatus.isBlank()) {
                predicates.add(cb.equal(root.get("followupStatus"), followupStatus));
            }
            if (outcome != null && !outcome.isBlank()) {
                predicates.add(cb.equal(root.get("outcome"), outcome));
            }
            if (location != null && !location.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("location")), "%" + location.trim().toLowerCase() + "%"));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<MarketingLead> buildLeadSpecification(String search, String marketer,
                                                                String dateFrom, String dateTo,
                                                                String status, String stage,
                                                                String priority, String location) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(cb.toString(root.get("id"))), like),
                        cb.like(cb.lower(root.get("companyName")), like),
                        cb.like(cb.lower(root.get("contactPerson")), like),
                        cb.like(cb.lower(root.get("phone")), like),
                        cb.like(cb.lower(root.get("email")), like),
                        cb.like(cb.lower(root.get("location")), like)
                ));
            }
            if (marketer != null && !marketer.isBlank()) {
                predicates.add(cb.equal(root.get("marketer"), marketer));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("leadDate"), LocalDate.parse(dateFrom)));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("leadDate"), LocalDate.parse(dateTo)));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), requireIn(status, LEAD_STATUSES, "lead status")));
            }
            if (stage != null && !stage.isBlank()) {
                predicates.add(cb.equal(root.get("stage"), requireIn(stage, LEAD_STAGES, "lead stage")));
            }
            if (priority != null && !priority.isBlank()) {
                predicates.add(cb.equal(root.get("priority"), requireIn(priority, PRIORITIES, "priority")));
            }
            if (location != null && !location.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("location")), "%" + location.trim().toLowerCase() + "%"));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<MarketingFollowUp> buildFollowUpSpecification(String search, Long leadId,
                                                                        Long visitId, String status,
                                                                        String mode, String marketer,
                                                                        String dateFrom, String dateTo) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(cb.toString(root.get("id"))), like),
                        cb.like(cb.lower(cb.toString(root.get("purpose"))), like),
                        cb.like(cb.lower(cb.toString(root.get("nextAction"))), like),
                        cb.like(cb.lower(cb.toString(root.get("customerResponse"))), like)
                ));
            }
            if (leadId != null) {
                predicates.add(cb.equal(root.get("leadId"), leadId));
            }
            if (visitId != null) {
                predicates.add(cb.equal(root.get("visitId"), visitId));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (mode != null && !mode.isBlank()) {
                predicates.add(cb.equal(root.get("mode"), mode));
            }
            if (marketer != null && !marketer.isBlank()) {
                predicates.add(cb.equal(root.get("createdBy"), marketer));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("followupDate"), LocalDate.parse(dateFrom)));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("followupDate"), LocalDate.parse(dateTo)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /** The single-page view tabs (Today / Upcoming / Pending / Overdue / Completed / Leads / Handover ...). */
    private Specification<MarketingVisit> viewSpecification(String view, LocalDate today) {
        return (root, query, cb) -> switch (view.trim().toLowerCase()) {
            case "today" -> cb.or(
                    cb.equal(root.get("appointmentDate"), today),
                    cb.equal(root.get("scheduleDate"), today));
            case "upcoming" -> cb.and(
                    cb.or(
                            cb.and(cb.isNotNull(root.get("appointmentDate")),
                                    cb.greaterThanOrEqualTo(root.get("appointmentDate"), today)),
                            cb.and(cb.isNull(root.get("appointmentDate")),
                                    cb.isNotNull(root.get("scheduleDate")),
                                    cb.greaterThanOrEqualTo(root.get("scheduleDate"), today))),
                    cb.notEqual(root.get("visitStatus"), "Completed"),
                    cb.notEqual(root.get("visitStatus"), "Cancelled"),
                    cb.notEqual(root.get("visitStatus"), "No Visit"));
            case "pending-followups", "pendingfollowups", "pending" -> cb.equal(root.get("followupStatus"), "Pending");
            case "overdue" -> cb.and(
                    cb.lessThan(root.get("followupDate"), today),
                    cb.or(cb.equal(root.get("followupStatus"), "Pending"),
                            cb.equal(root.get("followupStatus"), "Overdue")));
            case "completed" -> cb.equal(root.get("visitStatus"), "Completed");
            case "leads" -> cb.isNotNull(root.get("leadId"));
            case "handover" -> cb.equal(root.get("handoverStatus"), "Ready for Sales");
            case "pending-visits" -> cb.or(
                    cb.equal(root.get("visitStatus"), "Scheduled"),
                    cb.equal(root.get("visitStatus"), "Planned"),
                    cb.equal(root.get("visitStatus"), "In Progress"));
            case "today-followups" -> cb.equal(root.get("followupDate"), today);
            case "qualified-leads" -> root.get("leadStage").in(QUALIFIED_STAGES);
            case "no-lead" -> cb.equal(root.get("outcome"), "No Lead");
            default -> cb.conjunction();
        };
    }

    private Specification<MarketingVisit> dateRangeSpecification(LocalDate from, LocalDate to) {
        return (root, query, cb) -> {
            Predicate byAppointment;
            Predicate bySchedule = cb.disjunction();
            if (from != null && to != null) {
                byAppointment = cb.between(root.get("appointmentDate"), from, to);
                bySchedule = cb.and(cb.isNull(root.get("appointmentDate")),
                        cb.between(root.get("scheduleDate"), from, to));
            } else if (from != null) {
                byAppointment = cb.greaterThanOrEqualTo(root.get("appointmentDate"), from);
                bySchedule = cb.and(cb.isNull(root.get("appointmentDate")),
                        cb.greaterThanOrEqualTo(root.get("scheduleDate"), from));
            } else {
                byAppointment = cb.lessThanOrEqualTo(root.get("appointmentDate"), to);
                bySchedule = cb.and(cb.isNull(root.get("appointmentDate")),
                        cb.lessThanOrEqualTo(root.get("scheduleDate"), to));
            }
            return cb.or(byAppointment, bySchedule);
        };
    }

    private long countVisits(Specification<MarketingVisit> spec) {
        return visitRepository.count(spec);
    }

    // ---- Change history helpers ----

    /** Capture the current field values before an update. */
    private Map<String, String> captureVisitFields(MarketingVisit v) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("scheduleDate", v.getScheduleDate() != null ? v.getScheduleDate().toString() : null);
        m.put("companyName", v.getCompanyName());
        m.put("location", v.getLocation());
        m.put("address", v.getAddress());
        m.put("appointmentStatus", v.getAppointmentStatus());
        m.put("appointmentDate", v.getAppointmentDate() != null ? v.getAppointmentDate().toString() : null);
        m.put("appointmentTime", v.getAppointmentTime());
        m.put("meetingPerson", v.getMeetingPerson());
        m.put("meetingDesignation", v.getMeetingDesignation());
        m.put("contactPerson", v.getContactPerson());
        m.put("designation", v.getDesignation());
        m.put("phone", v.getPhone());
        m.put("email", v.getEmail());
        m.put("marketer", v.getMarketer());
        m.put("visitStatus", v.getVisitStatus());
        m.put("leadNo", v.getLeadNo());
        m.put("nextAction", v.getNextAction());
        m.put("followupDate", v.getFollowupDate() != null ? v.getFollowupDate().toString() : null);
        m.put("latitude", v.getLatitude() != null ? v.getLatitude().toString() : null);
        m.put("longitude", v.getLongitude() != null ? v.getLongitude().toString() : null);
        return m;
    }

    /** User-friendly labels for each field. */
    private static final Map<String, String> FIELD_LABELS = Map.ofEntries(
        Map.entry("scheduleDate", "Schedule Date"),
        Map.entry("companyName", "Company / Plant"),
        Map.entry("location", "Location"),
        Map.entry("address", "Address"),
        Map.entry("appointmentStatus", "Appointment Status"),
        Map.entry("appointmentDate", "Appointment Date"),
        Map.entry("appointmentTime", "Appointment Time"),
        Map.entry("meetingPerson", "Meeting Person"),
        Map.entry("meetingDesignation", "Designation"),
        Map.entry("contactPerson", "Contact Person"),
        Map.entry("designation", "Designation"),
        Map.entry("phone", "Phone"),
        Map.entry("email", "Email"),
        Map.entry("marketer", "Marketing User"),
        Map.entry("visitStatus", "Visit Status"),
        Map.entry("leadNo", "Lead Number"),
        Map.entry("nextAction", "Next Action"),
        Map.entry("followupDate", "Follow-up Date"),
        Map.entry("latitude", "Latitude"),
        Map.entry("longitude", "Longitude")
    );

    /** Compare before/after and persist field-level change records. */
    private void recordFieldChanges(Long visitId, Map<String, String> before,
                                     MarketingVisit after, String changeType, String changedBy) {
        List<VisitChangeHistory> changes = new ArrayList<>();
        Map<String, String> afterMap = captureVisitFields(after);
        for (Map.Entry<String, String> entry : before.entrySet()) {
            String key = entry.getKey();
            String oldVal = entry.getValue();
            String newVal = afterMap.get(key);
            // Normalize: treat null and empty as equivalent
            String normOld = (oldVal == null || oldVal.isBlank()) ? null : oldVal.trim();
            String normNew = (newVal == null || newVal.isBlank()) ? null : newVal.trim();
            if (java.util.Objects.equals(normOld, normNew)) continue;
            String label = FIELD_LABELS.getOrDefault(key, key);
            changes.add(new VisitChangeHistory(visitId, label, key, normOld, normNew, changeType, changedBy));
        }
        if (!changes.isEmpty()) {
            changeHistoryRepository.saveAll(changes);
        }
    }

    /** Get the current authenticated user's display name. */
    private String getCurrentUserName() {
        try {
            return auditContext.currentUserName();
        } catch (Exception e) {
            return "System";
        }
    }

    /** Get change history for a visit (mapped to a response DTO — never the entity). */
    public List<VisitChangeHistoryResponse> getChangeHistory(Long visitId) {
        return changeHistoryRepository.findByVisitIdOrderByChangedAtDesc(visitId).stream()
                .map(VisitChangeHistoryResponse::from)
                .toList();
    }

    // ---- Field application ----

    private void apply(MarketingVisit visit, MarketingVisitRequest request) {
        if (request.scheduleDate() != null) visit.setScheduleDate(request.scheduleDate());
        if (request.companyName() != null) visit.setCompanyName(request.companyName().trim());
        if (request.customerId() != null) visit.setCustomerId(request.customerId());
        if (request.leadId() != null) visit.setLeadId(request.leadId());
        if (request.location() != null) visit.setLocation(request.location().trim());
        if (request.address() != null) visit.setAddress(request.address().trim());
        if (request.latitude() != null) visit.setLatitude(request.latitude());
        if (request.longitude() != null) visit.setLongitude(request.longitude());
        if (request.leadNo() != null) visit.setLeadNo(request.leadNo().trim());
        if (request.appointmentStatus() != null && !request.appointmentStatus().isBlank()) {
            visit.setAppointmentStatus(requireIn(request.appointmentStatus(), APPOINTMENT_STATUSES, "appointment status"));
        } else if (visit.getAppointmentStatus() == null) {
            visit.setAppointmentStatus("Fixed");
        }
        if (request.appointmentDate() != null) visit.setAppointmentDate(request.appointmentDate());
        if (request.appointmentTime() != null) visit.setAppointmentTime(request.appointmentTime());
        if (request.contactPerson() != null) visit.setContactPerson(request.contactPerson().trim());
        if (request.designation() != null) visit.setDesignation(request.designation().trim());
        if (request.phone() != null) visit.setPhone(request.phone().trim());
        if (request.email() != null) visit.setEmail(request.email().trim());
        if (request.appointmentRemarks() != null) visit.setAppointmentRemarks(request.appointmentRemarks());
        if (request.visitStatus() != null && !request.visitStatus().isBlank()) {
            visit.setVisitStatus(requireIn(request.visitStatus(), VISIT_STATUSES, "visit status"));
        }
        if (request.qFormStatus() != null && !request.qFormStatus().isBlank()) {
            visit.setQFormStatus(requireIn(request.qFormStatus(), QFORM_STATUSES, "Q Form status"));
        }
        if (request.entryDateTime() != null) visit.setEntryDateTime(request.entryDateTime());
        if (request.exitDateTime() != null) visit.setExitDateTime(request.exitDateTime());
        if (request.meetingPerson() != null) visit.setMeetingPerson(request.meetingPerson().trim());
        if (request.meetingDesignation() != null) visit.setMeetingDesignation(request.meetingDesignation().trim());
        applyRequirement(visit, request);
        applyDiscussion(visit, request);
        if (request.outcome() != null && !request.outcome().isBlank()) {
            visit.setOutcome(requireIn(request.outcome(), OUTCOMES, "outcome"));
        }
        if (request.noLeadReason() != null) visit.setNoLeadReason(request.noLeadReason());
        if (request.estimatedValue() != null) visit.setEstimatedValue(request.estimatedValue());
        if (request.leadPriority() != null) visit.setLeadPriority(request.leadPriority());
        if (request.nextAction() != null) visit.setNextAction(request.nextAction());
        if (request.followupDate() != null) visit.setFollowupDate(request.followupDate());
        if (request.followupMode() != null) visit.setFollowupMode(request.followupMode());
        if (request.followupStatus() != null) visit.setFollowupStatus(request.followupStatus());
        if (request.followupCustomerResponse() != null) visit.setFollowupCustomerResponse(request.followupCustomerResponse());
        if (request.followupRemarks() != null) visit.setFollowupRemarks(request.followupRemarks());
        if (request.handoverStatus() != null && !request.handoverStatus().isBlank()) {
            visit.setHandoverStatus(requireIn(request.handoverStatus(), HANDOVER_STATUSES, "handover status"));
        }
        if (request.handoverTo() != null) visit.setHandoverTo(request.handoverTo());
        if (request.handoverRemarks() != null) visit.setHandoverRemarks(request.handoverRemarks());
    }

    private void applyLead(MarketingLead lead, MarketingLeadRequest request) {
        if (request.companyName() != null && !request.companyName().isBlank()) {
            lead.setCompanyName(request.companyName().trim());
        }
        if (request.contactPerson() != null) lead.setContactPerson(request.contactPerson().trim());
        if (request.designation() != null) lead.setDesignation(request.designation().trim());
        if (request.phone() != null) lead.setPhone(request.phone().trim());
        if (request.email() != null) lead.setEmail(request.email().trim());
        if (request.location() != null) lead.setLocation(request.location().trim());
        if (request.requirement() != null) lead.setRequirement(request.requirement());
        if (request.estimatedValue() != null) lead.setEstimatedValue(request.estimatedValue());
        if (request.priority() != null && !request.priority().isBlank()) {
            lead.setPriority(normalizePriority(request.priority()));
        }
        if (request.status() != null && !request.status().isBlank()) {
            lead.setStatus(requireIn(request.status(), LEAD_STATUSES, "lead status"));
        }
        if (request.stage() != null && !request.stage().isBlank()) {
            lead.setStage(requireIn(request.stage(), LEAD_STAGES, "lead stage"));
        }
        if (request.source() != null && !request.source().isBlank()) {
            lead.setSource(request.source().trim());
        } else {
            lead.setSource("Offline Marketing");
        }
        if (request.leadDate() != null) lead.setLeadDate(request.leadDate());
    }

    private void applyFollowUpFields(MarketingFollowUp row, MarketingFollowUpRequest request) {
        row.setFollowupDate(request.followupDate());
        if (request.time() != null) row.setTime(request.time());
        if (request.mode() != null && !request.mode().isBlank()) {
            row.setMode(requireIn(request.mode(), FOLLOWUP_MODES, "follow-up mode"));
        }
        if (request.status() != null && !request.status().isBlank()) {
            row.setStatus(requireIn(request.status(), FOLLOWUP_STATUSES, "follow-up status"));
        }
        if (request.purpose() != null) row.setPurpose(request.purpose());
        if (request.nextAction() != null) row.setNextAction(request.nextAction());
        if (request.customerResponse() != null) row.setCustomerResponse(request.customerResponse());
        if (request.remarks() != null) row.setRemarks(request.remarks());
        if (request.nextFollowupDate() != null) row.setNextFollowupDate(request.nextFollowupDate());
    }

    private void applyCurrentFollowUp(MarketingVisit visit, MarketingFollowUpRequest request) {
        visit.setFollowupDate(request.followupDate());
        if (request.mode() != null && !request.mode().isBlank()) {
            visit.setFollowupMode(requireIn(request.mode(), FOLLOWUP_MODES, "follow-up mode"));
        }
        if (request.status() != null && !request.status().isBlank()) {
            visit.setFollowupStatus(requireIn(request.status(), FOLLOWUP_STATUSES, "follow-up status"));
        }
        if (request.nextAction() != null) visit.setNextAction(request.nextAction());
        if (request.customerResponse() != null) visit.setFollowupCustomerResponse(request.customerResponse());
        if (request.remarks() != null) visit.setFollowupRemarks(request.remarks());
    }

    private void applyRequirement(MarketingVisit visit, MarketingVisitRequest request) {
        if (request.requirement() != null) visit.setRequirement(request.requirement());
        if (request.productService() != null) visit.setProductService(request.productService().trim());
        if (request.quantity() != null) visit.setQuantity(request.quantity().trim());
        if (request.technicalRequirement() != null) visit.setTechnicalRequirement(request.technicalRequirement());
        if (request.expectedPurchaseTimeline() != null) visit.setExpectedPurchaseTimeline(request.expectedPurchaseTimeline().trim());
        if (request.budget() != null) visit.setBudget(request.budget().trim());
        if (request.requirementPriority() != null && !request.requirementPriority().isBlank()) {
            visit.setRequirementPriority(normalizePriority(request.requirementPriority()));
        }
        if (request.technicalRemarks() != null) visit.setTechnicalRemarks(request.technicalRemarks());
    }

    private void applyDiscussion(MarketingVisit visit, MarketingVisitRequest request) {
        if (request.visitDescription() != null) visit.setVisitDescription(request.visitDescription());
        if (request.discussion() != null) visit.setDiscussion(request.discussion());
        if (request.customerResponse() != null) visit.setCustomerResponse(request.customerResponse());
        if (request.customerFeedback() != null) visit.setCustomerFeedback(request.customerFeedback());
        if (request.technicalDiscussion() != null) visit.setTechnicalDiscussion(request.technicalDiscussion());
        if (request.remarks() != null) visit.setRemarks(request.remarks());
    }

    private void refreshLinkedData(MarketingVisit visit, boolean changed) {
        if (visit.getCustomerId() != null) {
            Customer customer = customerRepository.findById(visit.getCustomerId())
                    .orElseThrow(() -> new BadRequestException(
                            "Selected customer no longer exists (id: " + visit.getCustomerId() + ")"));
            visit.setCustomerName(customer.getBusinessName());
            if (visit.getCompanyName() == null || visit.getCompanyName().isBlank()) {
                visit.setCompanyName(customer.getBusinessName());
            }
        }
        if (visit.getLeadId() != null) {
            snapshotLead(visit, findLead(visit.getLeadId()));
        } else if (changed) {
            visit.setLeadId(null);
        }
    }

    private void snapshotLead(MarketingVisit visit, MarketingLead lead) {
        visit.setLeadNo(leadNo(lead.getId(), lead.getCreatedAt()));
        visit.setLeadStage(lead.getStage());
        visit.setLeadStatus(lead.getStatus());
        visit.setLeadPriority(lead.getPriority());
        visit.setEstimatedValue(lead.getEstimatedValue());
        visit.setLeadCreatedAt(lead.getCreatedAt());
    }

    private void linkLeadInternal(MarketingVisit visit, MarketingLead lead) {
        visit.setLeadId(lead.getId());
        snapshotLead(visit, lead);
    }

    private void validateBasic(MarketingVisit visit) {
        boolean hasIdentity = visit.getCompanyName() != null && !visit.getCompanyName().isBlank()
                || visit.getCustomerId() != null
                || visit.getLeadId() != null;
        if (!hasIdentity) {
            throw new BadRequestException("A Company / Plant, Customer, or Lead must be specified for the visit");
        }
        if ("No Lead".equals(visit.getOutcome())
                && (visit.getNoLeadReason() == null || visit.getNoLeadReason().isBlank())) {
            throw new BadRequestException("A reason is required when the visit outcome is No Lead");
        }
    }

    private String buildRequirementText(MarketingVisit visit) {
        StringBuilder sb = new StringBuilder();
        if (visit.getRequirement() != null && !visit.getRequirement().isBlank()) {
            sb.append(visit.getRequirement());
        }
        if (visit.getProductService() != null && !visit.getProductService().isBlank()) {
            if (!sb.isEmpty()) sb.append("\n");
            sb.append("Product/Service: ").append(visit.getProductService());
        }
        if (visit.getQuantity() != null && !visit.getQuantity().isBlank()) {
            if (!sb.isEmpty()) sb.append("\n");
            sb.append("Quantity: ").append(visit.getQuantity());
        }
        return sb.toString();
    }

    private Sort buildSort(String sort, String defaultField) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, defaultField);
        }
        String[] parts = sort.split(",");
        String field = parts[0];
        String mapped = switch (field) {
            case "scheduleDate", "appointmentDate", "followupDate", "leadDate", "companyName",
                    "contactPerson", "visitStatus", "appointmentStatus", "qFormStatus",
                    "followupStatus", "outcome", "marketer", "stage", "status", "priority",
                    "location", "id", "createdAt", "updatedAt" -> field;
            default -> defaultField;
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private String requireIn(String value, List<String> allowed, String label) {
        for (String candidate : allowed) {
            if (candidate.equalsIgnoreCase(value.trim())) {
                return candidate;
            }
        }
        throw new BadRequestException("Invalid " + label + ": " + value);
    }

    private String normalizePriority(String value) {
        for (String candidate : PRIORITIES) {
            if (candidate.equalsIgnoreCase(value.trim())) {
                return candidate;
            }
        }
        throw new BadRequestException("Invalid priority: " + value);
    }

    private String visitNo(MarketingVisit visit) {
        return visitNo(visit.getId(), visit.getCreatedAt());
    }

    private String visitNo(Long id, LocalDateTime createdAt) {
        if (id == null) return "VST-";
        int year = createdAt == null ? LocalDate.now().getYear() : createdAt.getYear();
        return "VST-" + year + "-" + String.format("%03d", id);
    }

    private String leadNo(Long id, LocalDateTime createdAt) {
        if (id == null) return null;
        int year = createdAt == null ? LocalDate.now().getYear() : createdAt.getYear();
        return "L-" + year + "-" + String.format("%03d", id);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    // ============================== Mapping ==============================

    private MarketingVisitResponse toResponse(MarketingVisit v) {
        return new MarketingVisitResponse(
                v.getId(), visitNo(v), v.getMarketer(), v.getScheduleDate(), v.getCompanyName(),
                v.getCustomerId(), v.getCustomerName(), v.getLeadId(), v.getLeadNo(), v.getLocation(),
                v.getAppointmentStatus(), v.getAppointmentDate(), v.getAppointmentTime(),
                v.getContactPerson(), v.getDesignation(), v.getPhone(), v.getEmail(),
                v.getVisitStatus(), v.getQFormStatus(), v.getOutcome(), v.getLeadStage(),
                v.getLeadStatus(), v.getLeadPriority(), v.getEstimatedValue(),
                v.getRequirementPriority(), v.getNextAction(), v.getFollowupDate(),
                v.getFollowupMode(), v.getFollowupStatus(), v.getHandoverStatus(),
                v.getEntryDateTime(), v.getExitDateTime(), v.getCreatedAt(), v.getUpdatedAt());
    }

    private MarketingVisitDetailResponse toDetail(MarketingVisit v) {
        List<MarketingFollowUpResponse> history = followUpRepository
                .findByVisitIdOrderByFollowupDateDescIdDesc(v.getId())
                .stream()
                .map(this::toFollowUpResponse)
                .toList();
        return new MarketingVisitDetailResponse(
                v.getId(), visitNo(v), v.getMarketer(), v.getScheduleDate(), v.getCompanyName(),
                v.getCustomerId(), v.getCustomerName(), v.getLeadId(), v.getLeadNo(), v.getLocation(),
                v.getAddress(), v.getLatitude(), v.getLongitude(),
                v.getAppointmentStatus(), v.getAppointmentDate(), v.getAppointmentTime(),
                v.getContactPerson(), v.getDesignation(), v.getPhone(), v.getEmail(),
                v.getAppointmentRemarks(), v.getEntryDateTime(), v.getExitDateTime(),
                v.getMeetingPerson(), v.getMeetingDesignation(), v.getVisitStatus(),
                v.getQFormStatus(), v.getQFormDetails(), v.getQFormSubmittedAt(), v.getQFormRemarks(),
                v.getRequirement(), v.getProductService(), v.getQuantity(), v.getTechnicalRequirement(),
                v.getExpectedPurchaseTimeline(), v.getBudget(), v.getRequirementPriority(),
                v.getTechnicalRemarks(), v.getVisitDescription(), v.getDiscussion(),
                v.getCustomerResponse(), v.getCustomerFeedback(), v.getTechnicalDiscussion(),
                v.getRemarks(), v.getOutcome(), v.getNoLeadReason(), v.getLeadStage(),
                v.getLeadStatus(), v.getLeadPriority(), v.getEstimatedValue(), v.getLeadCreatedAt(),
                v.getNextAction(), v.getFollowupDate(), v.getFollowupMode(), v.getFollowupStatus(),
                v.getFollowupCustomerResponse(), v.getFollowupRemarks(), v.getHandoverStatus(),
                v.getHandoverAt(), v.getHandoverTo(), v.getHandoverRemarks(),
                v.getCreatedAt(), v.getUpdatedAt(), history);
    }

    private MarketingLeadResponse toLeadResponse(MarketingLead lead) {
        return new MarketingLeadResponse(
                lead.getId(), leadNo(lead.getId(), lead.getCreatedAt()), lead.getLeadDate(),
                lead.getCompanyName(), lead.getContactPerson(), lead.getDesignation(),
                lead.getPhone(), lead.getEmail(), lead.getLocation(), lead.getMarketer(),
                lead.getRequirement(), lead.getEstimatedValue(), lead.getPriority(),
                lead.getStatus(), lead.getStage(), lead.getSource(), lead.getVisitId(),
                lead.getCreatedAt(), lead.getUpdatedAt());
    }

    private MarketingFollowUpResponse toFollowUpResponse(MarketingFollowUp f) {
        MarketingVisit visit = f.getVisitId() != null
                ? visitRepository.findById(f.getVisitId()).orElse(null) : null;
        MarketingLead lead = f.getLeadId() != null
                ? leadRepository.findById(f.getLeadId()).orElse(null) : null;
        String visitNo = visit != null ? visitNo(visit) : null;
        String companyName = visit != null
                ? (visit.getCompanyName() != null ? visit.getCompanyName() : visit.getCustomerName())
                : (lead != null ? lead.getCompanyName() : null);
        String contactName = visit != null ? visit.getContactPerson()
                : (lead != null ? lead.getContactPerson() : null);
        String location = visit != null ? visit.getLocation()
                : (lead != null ? lead.getLocation() : null);
        String marketer = visit != null ? visit.getMarketer()
                : (lead != null ? lead.getMarketer() : null);
        return new MarketingFollowUpResponse(f.getId(), f.getVisitId(), f.getLeadId(),
                f.getFollowupDate(), f.getTime(), f.getMode(), f.getStatus(), f.getPurpose(),
                f.getNextAction(), f.getCustomerResponse(), f.getRemarks(), f.getNextFollowupDate(),
                f.getCreatedBy(), f.getCreatedAt(), f.getUpdatedAt(),
                visitNo, companyName, contactName, location, marketer);
    }
}
