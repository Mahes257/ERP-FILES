package com.vishatech.erp.crm.service;

import com.vishatech.erp.crm.dto.FollowUpCreationResponse;
import com.vishatech.erp.crm.dto.FollowUpRequest;
import com.vishatech.erp.crm.dto.FollowUpResponse;
import com.vishatech.erp.entity.DocumentVisibility;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.crm.entity.FollowUpAttachment;
import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.crm.entity.LeadStatus;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.EditHistoryRepository;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.crm.repository.LeadRepository;
import com.vishatech.erp.repository.RecordRevisionRepository;
import com.vishatech.erp.crm.dto.AttachmentResponse;
import com.vishatech.erp.service.DocumentRepositoryService;
import com.vishatech.erp.service.FileStorageService;
import com.vishatech.erp.service.EditHistoryService;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class FollowUpService {

    private final FollowUpRepository followUpRepository;
    private final LeadRepository leadRepository;
    private final EditHistoryRepository editHistoryRepository;
    private final RecordRevisionRepository recordRevisionRepository;
    private final FileStorageService fileStorageService;
    private final DocumentRepositoryService documentRepositoryService;
    private final String baseUrl;

    public FollowUpService(FollowUpRepository followUpRepository, LeadRepository leadRepository,
                           EditHistoryRepository editHistoryRepository,
                           RecordRevisionRepository recordRevisionRepository,
                           FileStorageService fileStorageService,
                           DocumentRepositoryService documentRepositoryService,
                           @Value("${app.base-url:http://localhost:8080}") String baseUrl) {
        this.followUpRepository = followUpRepository;
        this.leadRepository = leadRepository;
        this.editHistoryRepository = editHistoryRepository;
        this.recordRevisionRepository = recordRevisionRepository;
        this.fileStorageService = fileStorageService;
        this.documentRepositoryService = documentRepositoryService;
        this.baseUrl = baseUrl;
    }

    /**
     * Paged follow-up listing.
     * <p>
     * {@code quotationId} is the ONLY scope that is not a plain column filter:
     * when supplied, the page is restricted to the follow-ups whose real
     * {@code followups.quotationId} is that quotation (the same relationship the
     * quotation list's Follow-up Status column resolves), and nothing else is
     * returned. When it is null the listing behaves exactly as before it
     * existed — the general CRM Follow-ups page passes no quotationId.
     */
    public Page<FollowUpResponse> list(int page, int size, String search, String sort,
                                       String status, String priority, String stage,
                                       String dateFrom, String dateTo, Long quotationId) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<FollowUp> spec = buildSpecification(search, status, priority, stage, dateFrom, dateTo, quotationId);
        // Latest follow-up DATE+TIME per Lead/Client (computed across the whole
        // history so the value is correct even when the rows sit on different
        // pages, and so two follow-ups on the same date are ordered by time).
        List<FollowUp> pageContent = followUpRepository.findAll(spec, pageable).getContent();
        Set<Long> leadIds = new HashSet<>();
        Set<Long> clientIds = new HashSet<>();
        for (FollowUp f : pageContent) {
            if (f.getLeadId() != null) leadIds.add(f.getLeadId());
            if (f.getClientId() != null) clientIds.add(f.getClientId());
        }
        Map<Long, LocalDateTime> latestByLead = new HashMap<>();
        Map<Long, LocalDateTime> latestByClient = new HashMap<>();
        if (!leadIds.isEmpty()) {
            for (FollowUp f : followUpRepository.findActiveByLeadIdIn(leadIds)) {
                LocalDateTime dt = followUpDateTime(f);
                if (dt != null) latestByLead.merge(f.getLeadId(), dt, (a, b) -> a.isAfter(b) ? a : b);
            }
        }
        if (!clientIds.isEmpty()) {
            for (FollowUp f : followUpRepository.findActiveByClientIdIn(clientIds)) {
                LocalDateTime dt = followUpDateTime(f);
                if (dt != null) latestByClient.merge(f.getClientId(), dt, (a, b) -> a.isAfter(b) ? a : b);
            }
        }
        return followUpRepository.findAll(spec, pageable)
                .map(f -> toResponse(f, lastFollowUpDate(f, latestByLead, latestByClient)));
    }

    /**
     * Full follow-up history for one Lead/Client, newest first. Used by the
     * "Follow-up History" action in the follow-ups list.
     */
    public List<FollowUpResponse> history(Long leadId, Long clientId) {
        List<FollowUp> history;
        if (leadId != null) {
            history = followUpRepository.findByLeadIdOrderByFollowupDateDesc(leadId);
        } else if (clientId != null) {
            history = followUpRepository.findByClientIdOrderByFollowupDateDesc(clientId);
        } else {
            throw new BadRequestException("A lead or client must be specified");
        }
        return history.stream().map(this::toResponse).toList();
    }

    public FollowUpResponse get(Long id) {
        FollowUp followUp = find(id);
        return toResponse(followUp, lastFollowUpDateFor(followUp));
    }

    public FollowUpResponse create(FollowUpRequest request) {
        if (request.leadId() == null && request.clientId() == null) {
            throw new BadRequestException("A Lead or Client must be selected for the follow-up");
        }
        FollowUp followUp = new FollowUp();
        if (request.leadId() != null) {
            assertLeadNotClosed(request.leadId());
            applyLead(followUp, request.leadId());
        }
        apply(followUp, request);
        FollowUp saved = followUpRepository.save(followUp);
        return toResponse(saved);
    }

    public FollowUpResponse update(Long id, FollowUpRequest request) {
        FollowUp followUp = find(id);
        EditHistoryService editHistory = EditHistoryService.get();
        Map<String, String> editBefore = editHistory.snapshot(followUp);
        com.vishatech.erp.service.RecordRevisionService.get().record("follow-up", followUp.getId(), followUp);
        if (request.leadId() == null && request.clientId() == null) {
            throw new BadRequestException("A Lead or Client must be selected for the follow-up");
        }
        if (request.leadId() != null && !request.leadId().equals(followUp.getLeadId())) {
            applyLead(followUp, request.leadId());
        }
        apply(followUp, request);
        FollowUp saved = followUpRepository.save(followUp);
        editHistory.recordEdit("follow-up", saved.getId(), editBefore, editHistory.snapshot(saved));
        return toResponse(saved);
    }

    public void delete(Long id) {
        // Soft delete (trash): the row stays in MySQL with status "Deleted" and
        // can be restored — mirrors the sales-module behavior.
        FollowUp followUp = find(id);
        followUp.setStatus("Deleted");
        followUp.setArchivedAt(LocalDateTime.now());
        followUpRepository.save(followUp);
    }

    public void permanentDelete(Long id) {
        FollowUp followUp = find(id);
        // Hard delete: purge edit-history + revision snapshots so the removed
        // record leaves no orphaned rows behind.
        editHistoryRepository.deleteByModuleTypeAndRecordId("follow-up", id);
        recordRevisionRepository.deleteByModuleTypeAndRecordId("follow-up", id);
        followUpRepository.delete(followUp);
    }

    public int bulkDelete(List<Long> ids) {
        // Soft delete for trash parity with the single-delete endpoint.
        int count = 0;
        for (Long id : ids) {
            FollowUp followUp = find(id);
            if (!"Deleted".equals(followUp.getStatus())) {
                followUp.setStatus("Deleted");
                followUp.setArchivedAt(LocalDateTime.now());
                followUpRepository.save(followUp);
                count++;
            }
        }
        return count;
    }

    public int bulkRestore(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            FollowUp followUp = find(id);
            if (!"Open".equals(followUp.getStatus())) {
                followUp.setStatus("Open");
                followUp.setArchivedAt(null);
                followUpRepository.save(followUp);
                count++;
            }
        }
        return count;
    }

    public int bulkPermanentDelete(List<Long> ids) {
        int count = 0;
        for (Long id : ids) {
            permanentDelete(id);
            count++;
        }
        return count;
    }

    public FollowUpResponse archive(Long id) {
        FollowUp followUp = find(id);
        followUp.setStatus("Archived");
        followUp.setArchivedAt(LocalDateTime.now());
        return toResponse(followUpRepository.save(followUp));
    }

    public FollowUpResponse restore(Long id) {
        FollowUp followUp = find(id);
        followUp.setStatus("Open");
        followUp.setArchivedAt(null);
        return toResponse(followUpRepository.save(followUp));
    }

    /**
     * Automatic Lead → Follow-up conversion (idempotent). Triggered by the
     * lead's existing "Add Follow-up" workflow action. Carries the lead's
     * current data onto a new follow-up (lead snapshot via {@link #applyLead},
     * plus priority and internal notes), without ever changing the lead's
     * stage/status. If a non-deleted follow-up already exists for the lead it
     * is returned as-is so repeated triggers never create duplicates.
     */
    public FollowUpCreationResponse createFromLead(Long leadId) {
        // Checked before the "already exists" shortcut: a closed lead must refuse
        // the request outright instead of answering 200 as if it had done work.
        Lead lead = leadRepository.findById(leadId)
                .orElseThrow(() -> new BadRequestException("Lead no longer exists (id: " + leadId + ")"));
        assertLeadNotClosed(lead);
        FollowUp existing = followUpRepository.findByLeadId(leadId).stream()
                .filter(f -> !"Deleted".equalsIgnoreCase(f.getStatus()))
                .findFirst()
                .orElse(null);
        if (existing != null) {
            return new FollowUpCreationResponse(false, toResponse(existing));
        }
        FollowUp followUp = new FollowUp();
        applyLead(followUp, leadId);
        // Carry the lead's priority and relevant notes onto the follow-up.
        followUp.setPriority(lead.getPriority());
        if (lead.getInternalNotes() != null && !lead.getInternalNotes().isBlank()) {
            followUp.setDiscussionSummary(lead.getInternalNotes());
        }
        followUp.setFollowupDate(LocalDate.now());
        followUp.setMode("Call");
        followUp.setStatus("Open");
        FollowUp saved = followUpRepository.save(followUp);
        return new FollowUpCreationResponse(true, toResponse(saved));
    }

    public FollowUpResponse duplicate(Long id) {
        FollowUp source = find(id);
        FollowUp copy = new FollowUp();
        copy.setLeadId(source.getLeadId());
        copy.setQuotationId(source.getQuotationId());
        copy.setLeadName(source.getLeadName());
        copy.setCompanyName(source.getCompanyName());
        copy.setContactPerson(source.getContactPerson());
        copy.setPhone(source.getPhone());
        copy.setEmail(source.getEmail());
        copy.setLeadStage(source.getLeadStage());
        copy.setSource(source.getSource());
        copy.setIndustry(source.getIndustry());
        copy.setExecutive(source.getExecutive());
        copy.setAddress(source.getAddress());
        copy.setFollowupDate(source.getFollowupDate());
        copy.setTime(source.getTime());
        copy.setMode(source.getMode());
        copy.setPriority(source.getPriority());
        copy.setCurrentStatus(source.getCurrentStatus());
        copy.setOutcome(source.getOutcome());
        copy.setDiscussionSummary(source.getDiscussionSummary());
        copy.setCustomerFeedback(source.getCustomerFeedback());
        copy.setRequirement(source.getRequirement());
        copy.setNextFollowupDate(source.getNextFollowupDate());
        copy.setAssignTo(source.getAssignTo());
        copy.setReminder(source.getReminder());
        copy.setReminderType(source.getReminderType());
        copy.setStatus("Open");
        return toResponse(followUpRepository.save(copy));
    }

    public List<FollowUpResponse.AttachmentResponse> getAttachments(Long id) {
        return find(id).getAttachments().stream().map(this::attachmentResponse).toList();
    }

    public FollowUpResponse.AttachmentResponse addAttachment(Long id, MultipartFile file) {
        FollowUp followUp = find(id);
        String storedName = fileStorageService.store(file);
        FollowUpAttachment attachment = new FollowUpAttachment();
        attachment.setName(file.getOriginalFilename());
        attachment.setStoredName(storedName);
        attachment.setContentType(file.getContentType());
        attachment.setSize(file.getSize());
        attachment.setUrl(baseUrl + "/v1/files/" + storedName);
        followUp.addAttachment(attachment);
        followUpRepository.save(followUp);
        documentRepositoryService.registerFromAttachment(
                file.getOriginalFilename(), "Follow-ups", id,
                null, null, null,
                baseUrl + "/v1/files/" + storedName,
                file.getContentType(), file.getSize(),
                currentUserName(), DocumentVisibility.TEAM_ONLY);
        return attachmentResponse(attachment);
    }

    // ============================== Helpers ==============================

    private FollowUp find(Long id) {
        return followUpRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Follow-up not found with id: " + id));
    }

    /**
     * A closed lead accepts no NEW follow-up. Existing follow-ups (and their
     * history) stay untouched: they are simply read back through the lead view.
     * Enforced here, on the service, so a direct API call cannot bypass it.
     */
    private void assertLeadNotClosed(Long leadId) {
        leadRepository.findById(leadId).ifPresent(this::assertLeadNotClosed);
    }

    private void assertLeadNotClosed(Lead lead) {
        if (lead.getStatus() == LeadStatus.INACTIVE) {
            throw new BadRequestException("Lead '" + lead.getName()
                    + "' is closed — no new follow-up can be created for it.");
        }
    }

    /**
     * Snapshot the selected lead's real fields onto the follow-up. The lead is
     * loaded from the database (never from hardcoded data) and any blank
     * request field falls back to the live lead value.
     */
    private void applyLead(FollowUp followUp, Long leadId) {
        if (leadId == null) {
            throw new BadRequestException("A lead must be selected for the follow-up");
        }
        Lead lead = leadRepository.findById(leadId)
                .orElseThrow(() -> new BadRequestException("Selected lead no longer exists (id: " + leadId + ")"));
        followUp.setLeadId(leadId);
        followUp.setLeadName(lead.getName());
        followUp.setCompanyName(lead.getBusinessName() != null ? lead.getBusinessName() : lead.getCompany());
        followUp.setContactPerson(lead.getName());
        followUp.setPhone(lead.getPhone());
        followUp.setEmail(lead.getEmail());
        followUp.setLeadStage(lead.getStage() == null ? null
                : lead.getStage().name().substring(0, 1).toUpperCase() + lead.getStage().name().substring(1).toLowerCase());
        followUp.setSource(lead.getSource());
        followUp.setIndustry(lead.getIndustry());
        followUp.setExecutive(lead.getOwner());
        followUp.setAddress(lead.getAddress());
    }

    private void apply(FollowUp followUp, FollowUpRequest request) {
        // Client relationship (nullable — ERP parity for client-originated follow-ups).
        followUp.setClientId(request.clientId());
        // Origin quotation (nullable). Only write it when the payload carries one
        // so a payload that omits the field (lead/client follow-ups) never wipes
        // an existing link, and an explicit null never clears it either.
        if (request.quotationId() != null) {
            followUp.setQuotationId(request.quotationId());
        }
        if (request.leadName() != null && !request.leadName().isBlank()) {
            followUp.setLeadName(request.leadName());
        }
        if (request.companyName() != null && !request.companyName().isBlank()) {
            followUp.setCompanyName(request.companyName());
        }
        if (request.contactPerson() != null && !request.contactPerson().isBlank()) {
            followUp.setContactPerson(request.contactPerson());
        }
        if (request.phone() != null && !request.phone().isBlank()) {
            followUp.setPhone(request.phone());
        }
        if (request.email() != null && !request.email().isBlank()) {
            followUp.setEmail(request.email());
        }
        if (request.leadStage() != null && !request.leadStage().isBlank()) {
            followUp.setLeadStage(request.leadStage());
        }
        if (request.source() != null && !request.source().isBlank()) {
            followUp.setSource(request.source());
        }
        if (request.industry() != null && !request.industry().isBlank()) {
            followUp.setIndustry(request.industry());
        }
        if (request.executive() != null && !request.executive().isBlank()) {
            followUp.setExecutive(request.executive());
        }
        if (request.address() != null && !request.address().isBlank()) {
            followUp.setAddress(request.address());
        }
        followUp.setFollowupDate(request.followupDate());
        // Only update time when the request actually carries one — a payload
        // that omits time must never wipe a previously saved follow-up time.
        if (request.time() != null) {
            followUp.setTime(request.time());
        }
        followUp.setMode(request.mode());
        followUp.setPriority(request.priority());
        followUp.setCurrentStatus(request.currentStatus());
        followUp.setOutcome(request.outcome());
        followUp.setDiscussionSummary(request.discussionSummary());
        followUp.setCustomerFeedback(request.customerFeedback());
        followUp.setRequirement(request.requirement());
        followUp.setNextFollowupDate(request.nextFollowupDate());
        followUp.setAssignTo(request.assignTo());
        followUp.setReminder(request.reminder());
        followUp.setReminderType(request.reminderType());
        if (request.status() != null && !request.status().isBlank()) {
            followUp.setStatus(request.status());
        }
    }

    private Specification<FollowUp> buildSpecification(String search, String status, String priority,
                                                       String stage, String dateFrom, String dateTo,
                                                       Long quotationId) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            // Quotation-scoped listing (Quotation Overview → Follow-ups tab).
            // Equality on the real quotationId column — never derived from the
            // customer/lead, and never dropped (an absent parameter leaves the
            // general CRM listing untouched, an explicit id can never widen the
            // result set to other quotations).
            if (quotationId != null) {
                predicates.add(cb.equal(root.get("quotationId"), quotationId));
            }
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("leadName")), like),
                        cb.like(cb.lower(root.get("companyName")), like),
                        cb.like(cb.lower(root.get("contactPerson")), like),
                        cb.like(cb.lower(root.get("phone")), like),
                        cb.like(cb.lower(root.get("email")), like),
                        // discussionSummary is a TEXT/CLOB column — cast to
                        // string before lower() (same pattern as CprService).
                        cb.like(cb.lower(cb.toString(root.get("discussionSummary"))), like)
                ));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), status));
            } else {
                // Default view excludes trashed rows (only visible in the Deleted tab).
                predicates.add(cb.notEqual(root.get("status"), "Deleted"));
            }
            if (priority != null && !priority.isBlank()) {
                predicates.add(cb.equal(root.get("priority"), priority));
            }
            if (stage != null && !stage.isBlank()) {
                predicates.add(cb.equal(root.get("leadStage"), stage));
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

    private Sort buildSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "followupDate");
        }
        String[] parts = sort.split(",");
        String field = parts[0];
        String mapped = switch (field) {
            case "followupDate", "date", "status", "priority", "leadStage", "stage" -> {
                yield field.equals("date") ? "followupDate" : field.equals("stage") ? "leadStage" : field;
            }
            case "leadName", "companyName", "contactPerson", "id" -> field;
            case "createdAt" -> "createdAt";
            case "updatedAt" -> "updatedAt";
            default -> "followupDate";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    /**
     * The most recent follow-up date for the same Lead/Client, computed across
     * the whole history. The list endpoint already computes this in batch; the
     * single-record paths (detail / history / mutations) left it null, so a View
     * driven by GET /followups/{id} showed "Last Follow-up —". Same query and
     * same aggregation as the list, just scoped to one record.
     */
    private LocalDate lastFollowUpDateFor(FollowUp followUp) {
        Map<Long, LocalDateTime> latestByLead = new HashMap<>();
        Map<Long, LocalDateTime> latestByClient = new HashMap<>();
        if (followUp.getLeadId() != null) {
            for (FollowUp f : followUpRepository.findActiveByLeadIdIn(List.of(followUp.getLeadId()))) {
                LocalDateTime dt = followUpDateTime(f);
                if (dt != null) latestByLead.merge(f.getLeadId(), dt, (a, b) -> a.isAfter(b) ? a : b);
            }
        }
        if (followUp.getClientId() != null) {
            for (FollowUp f : followUpRepository.findActiveByClientIdIn(List.of(followUp.getClientId()))) {
                LocalDateTime dt = followUpDateTime(f);
                if (dt != null) latestByClient.merge(f.getClientId(), dt, (a, b) -> a.isAfter(b) ? a : b);
            }
        }
        return lastFollowUpDate(followUp, latestByLead, latestByClient);
    }

    private LocalDate lastFollowUpDate(FollowUp followUp,
                                       Map<Long, LocalDateTime> latestByLead,
                                       Map<Long, LocalDateTime> latestByClient) {
        LocalDateTime latest = null;
        if (followUp.getLeadId() != null) {
            latest = latestByLead.get(followUp.getLeadId());
        }
        if (latest == null && followUp.getClientId() != null) {
            latest = latestByClient.get(followUp.getClientId());
        }
        return latest == null ? null : latest.toLocalDate();
    }

    /**
     * Combined follow-up date+time (missing/invalid time falls back to
     * midnight so date-only records still compare correctly).
     */
    private LocalDateTime followUpDateTime(FollowUp followUp) {
        LocalDate d = followUp.getFollowupDate();
        if (d == null) return null;
        return LocalDateTime.of(d, parseTime(followUp.getTime()));
    }

    private LocalTime parseTime(String time) {
        if (time == null || time.isBlank()) return LocalTime.MIDNIGHT;
        Matcher m = Pattern.compile("^(\\d{1,2}):(\\d{2})(?:\\s*(AM|PM))?$").matcher(time.trim().toUpperCase());
        if (!m.matches()) return LocalTime.MIDNIGHT;
        try {
            int hour = Integer.parseInt(m.group(1));
            int minute = Integer.parseInt(m.group(2));
            String ap = m.group(3);
            if ("PM".equals(ap) && hour < 12) hour += 12;
            if ("AM".equals(ap) && hour == 12) hour = 0;
            return LocalTime.of(hour, minute);
        } catch (RuntimeException e) {
            return LocalTime.MIDNIGHT;
        }
    }

    private FollowUpResponse toResponse(FollowUp followUp) {
        return toResponse(followUp, null);
    }

    private FollowUpResponse toResponse(FollowUp followUp, LocalDate lastFollowUpDate) {
        return new FollowUpResponse(
                followUp.getId(),
                followUp.getLeadId(),
                followUp.getClientId(),
                followUp.getQuotationId(),
                followUp.getLeadName(),
                followUp.getCompanyName(),
                followUp.getContactPerson(),
                followUp.getPhone(),
                followUp.getEmail(),
                followUp.getLeadStage(),
                followUp.getSource(),
                followUp.getIndustry(),
                followUp.getExecutive(),
                followUp.getAddress(),
                followUp.getFollowupDate(),
                followUp.getTime(),
                followUp.getMode(),
                followUp.getPriority(),
                followUp.getCurrentStatus(),
                followUp.getOutcome(),
                followUp.getDiscussionSummary(),
                followUp.getCustomerFeedback(),
                followUp.getRequirement(),
                followUp.getNextFollowupDate(),
                followUp.getAssignTo(),
                followUp.getReminder(),
                followUp.getReminderType(),
                followUp.getStatus(),
                followUp.getCreatedAt(),
                followUp.getUpdatedAt(),
                followUp.getArchivedAt(),
                lastFollowUpDate,
                followUp.getAttachments().stream().map(this::attachmentResponse).toList()
        );
    }

    private FollowUpResponse.AttachmentResponse attachmentResponse(FollowUpAttachment attachment) {
        return new FollowUpResponse.AttachmentResponse(attachment.getId(), attachment.getName(),
                attachment.getContentType(), attachment.getSize(), attachment.getUrl(),
                attachment.getUploadedAt() == null ? null : attachment.getUploadedAt().toString());
    }

    private String currentUserName() {
        Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "System";
    }
}
