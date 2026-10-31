package com.vishatech.erp.service;

import com.vishatech.erp.dto.MarketingVisitActivityResponse;
import com.vishatech.erp.entity.MarketingVisit;
import com.vishatech.erp.entity.MarketingVisitActivity;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.MarketingVisitActivityRepository;
import com.vishatech.erp.repository.MarketingVisitRepository;
import com.vishatech.erp.util.AuditContext;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Transactional
public class MarketingVisitActivityService {

    private final MarketingVisitActivityRepository activityRepository;
    private final MarketingVisitRepository visitRepository;
    private final AuditContext auditContext;

    public MarketingVisitActivityService(
            MarketingVisitActivityRepository activityRepository,
            MarketingVisitRepository visitRepository,
            AuditContext auditContext) {
        this.activityRepository = activityRepository;
        this.visitRepository = visitRepository;
        this.auditContext = auditContext;
    }

    /** List all activities for a given original visit, chronological order. */
    @Transactional(readOnly = true)
    public List<MarketingVisitActivity> listByVisit(Long visitId) {
        return activityRepository.findByVisitIdOrderByActivityDateAscIdAsc(visitId);
    }

    /**
     * List follow-ups and extensions. When {@code visitId} is given, only that
     * visit's activities are returned (chronological order); otherwise ALL
     * follow-up / extension records are returned, newest first. Every row is
     * enriched with the linked original visit's reference fields.
     */
    @Transactional(readOnly = true)
    public List<MarketingVisitActivityResponse> listActivities(Long visitId) {
        List<MarketingVisitActivity> activities;
        if (visitId != null) {
            activities = activityRepository.findByVisitIdOrderByActivityDateAscIdAsc(visitId);
        } else {
            activities = activityRepository.findAll(
                    Sort.by(Sort.Direction.DESC, "activityDate").and(Sort.by(Sort.Direction.DESC, "id")));
        }
        return enrich(activities);
    }

    /** Get a single activity by ID, enriched with its linked visit reference fields. */
    @Transactional(readOnly = true)
    public MarketingVisitActivityResponse get(Long id) {
        MarketingVisitActivity activity = activityRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Activity not found with id: " + id));
        MarketingVisit visit = activity.getVisitId() == null
                ? null
                : visitRepository.findById(activity.getVisitId()).orElse(null);
        return toResponse(activity, visit);
    }

    /** Create a new follow-up or visit extension. */
    public MarketingVisitActivityResponse create(MarketingVisitActivity activity) {
        // Validate the original visit exists
        if (activity.getVisitId() == null) {
            throw new IllegalArgumentException("visitId is required");
        }
        MarketingVisit visit = visitRepository.findById(activity.getVisitId())
                .orElseThrow(() -> new IllegalArgumentException("Original visit not found: " + activity.getVisitId()));

        if (activity.getActivityType() == null || activity.getActivityType().isBlank()) {
            activity.setActivityType("followup");
        }
        // Audit stamping belongs to the service layer (matches Purchase/Production),
        // never the controller.
        activity.setCreatedBy(auditContext.currentUserName());
        activity.setCreatedByUserId(auditContext.currentUserId());
        return toResponse(activityRepository.save(activity), visit);
    }

    /** Update an existing follow-up or visit extension (never creates a duplicate). */
    public MarketingVisitActivityResponse update(Long id, MarketingVisitActivity updates) {
        // A missing record is a 404, matching the rest of the API
        // (ResourceNotFoundException -> GlobalExceptionHandler).
        MarketingVisitActivity existing = activityRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Activity not found with id: " + id));

        // Update all mutable fields
        if (updates.getActivityDate() != null) existing.setActivityDate(updates.getActivityDate());
        if (updates.getActivityTime() != null) existing.setActivityTime(updates.getActivityTime());
        if (updates.getCompanyName() != null) existing.setCompanyName(updates.getCompanyName());
        if (updates.getContactName() != null) existing.setContactName(updates.getContactName());
        if (updates.getContactDesignation() != null) existing.setContactDesignation(updates.getContactDesignation());
        if (updates.getContactDepartment() != null) existing.setContactDepartment(updates.getContactDepartment());
        if (updates.getContactPhone() != null) existing.setContactPhone(updates.getContactPhone());
        if (updates.getContactWhatsApp() != null) existing.setContactWhatsApp(updates.getContactWhatsApp());
        if (updates.getContactEmail() != null) existing.setContactEmail(updates.getContactEmail());
        if (updates.getFollowupType() != null) existing.setFollowupType(updates.getFollowupType());
        if (updates.getDiscussion() != null) existing.setDiscussion(updates.getDiscussion());
        if (updates.getCustomerResponse() != null) existing.setCustomerResponse(updates.getCustomerResponse());
        if (updates.getStatus() != null) existing.setStatus(updates.getStatus());
        if (updates.getOutcome() != null) existing.setOutcome(updates.getOutcome());
        if (updates.getCustomerRequirement() != null) existing.setCustomerRequirement(updates.getCustomerRequirement());
        if (updates.getNextAction() != null) existing.setNextAction(updates.getNextAction());
        if (updates.getNextFollowupDate() != null) existing.setNextFollowupDate(updates.getNextFollowupDate());
        if (updates.getNextFollowupTime() != null) existing.setNextFollowupTime(updates.getNextFollowupTime());
        if (updates.getAssignedEmployee() != null) existing.setAssignedEmployee(updates.getAssignedEmployee());
        if (updates.getRemarks() != null) existing.setRemarks(updates.getRemarks());
        if (updates.getGroupName() != null) existing.setGroupName(updates.getGroupName());
        if (updates.getAttachmentPaths() != null) existing.setAttachmentPaths(updates.getAttachmentPaths());
        if (updates.getActivityType() != null) existing.setActivityType(updates.getActivityType());

        MarketingVisitActivity saved = activityRepository.save(existing);
        MarketingVisit visit = saved.getVisitId() == null
                ? null
                : visitRepository.findById(saved.getVisitId()).orElse(null);
        return toResponse(saved, visit);
    }

    /** Delete an activity. */
    public void delete(Long id) {
        if (!activityRepository.existsById(id)) {
            throw new ResourceNotFoundException("Activity not found with id: " + id);
        }
        activityRepository.deleteById(id);
    }

    /** Get the original visit details for reference. */
    @Transactional(readOnly = true)
    public MarketingVisit getOriginalVisit(Long visitId) {
        return visitRepository.findById(visitId)
                .orElseThrow(() -> new ResourceNotFoundException("Marketing visit not found with id: " + visitId));
    }

    // ---- Response mapping -------------------------------------------------

    private List<MarketingVisitActivityResponse> enrich(List<MarketingVisitActivity> activities) {
        Set<Long> visitIds = activities.stream()
                .map(MarketingVisitActivity::getVisitId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, MarketingVisit> visits = visitIds.isEmpty()
                ? Map.of()
                : visitRepository.findAllById(visitIds).stream()
                        .collect(Collectors.toMap(MarketingVisit::getId, v -> v));
        return activities.stream()
                .map(a -> toResponse(a, visits.get(a.getVisitId())))
                .toList();
    }

    private MarketingVisitActivityResponse toResponse(MarketingVisitActivity a, MarketingVisit v) {
        return new MarketingVisitActivityResponse(
                a.getId(),
                a.getVisitId(),
                a.getActivityType(),
                a.getActivityDate(),
                a.getActivityTime(),
                a.getCompanyName(),
                a.getContactName(),
                a.getContactDesignation(),
                a.getContactDepartment(),
                a.getContactPhone(),
                a.getContactWhatsApp(),
                a.getContactEmail(),
                a.getFollowupType(),
                a.getDiscussion(),
                a.getCustomerResponse(),
                a.getStatus(),
                a.getOutcome(),
                a.getCustomerRequirement(),
                a.getNextAction(),
                a.getNextFollowupDate(),
                a.getNextFollowupTime(),
                a.getAssignedEmployee(),
                a.getRemarks(),
                a.getGroupName(),
                a.getAttachmentPaths(),
                a.getCreatedBy(),
                a.getCreatedByUserId(),
                a.getCreatedAt(),
                a.getUpdatedAt(),
                v != null ? v.getVisitNo() : null,
                v != null ? v.getLocation() : null,
                v != null ? v.getCompanyName() : null,
                v != null ? v.getScheduleDate() : null
        );
    }
}