package com.vishatech.erp.service;

import com.vishatech.erp.dto.TravelPlanListResponse;
import com.vishatech.erp.dto.TravelPlanRequest;
import com.vishatech.erp.dto.TravelPlanResponse;
import com.vishatech.erp.entity.MarketingPlanChangeHistory;
import com.vishatech.erp.entity.MarketingRouteSnapshot;
import com.vishatech.erp.entity.MarketingTravelPlan;
import com.vishatech.erp.entity.MarketingTravelPlanStop;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.MarketingPlanChangeHistoryRepository;
import com.vishatech.erp.repository.MarketingRouteSnapshotRepository;
import com.vishatech.erp.repository.MarketingTravelPlanRepository;
import com.vishatech.erp.repository.MarketingTravelPlanStopRepository;
import com.vishatech.erp.sales.api.AttachmentStorePort;
import com.vishatech.erp.util.AuditContext;
import com.vishatech.erp.crm.entity.Customer;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Marketing Travel Planner service.  Handles the full lifecycle:
 * create → draft → submit → approve/reject → active trip → complete.
 *
 * <p>Completely independent from Sales.  All data lives in Marketing tables.
 */
@Service
@Transactional
public class TravelPlanService {

    public static final List<String> PLAN_STATUSES =
            List.of("Draft", "Submitted", "Approved", "Rejected", "Revision Required",
                    "Active", "Completed", "Cancelled");
    public static final List<String> STOP_STATUSES =
            List.of("Planned", "Active", "Completed", "Cancelled", "Rescheduled", "Skipped");
    public static final List<String> PURPOSES =
            List.of("Marketing Visit", "Customer Visit", "Plant Survey", "Follow-up",
                    "Technical Discussion", "Other");

    /**
     * Module type every Travel Registry attachment row carries in the shared
     * {@code sales_attachments} table.
     *
     * <p>Registry attachments reuse the ERP-wide, database-backed attachment
     * store (the same table, entity and ledger that Sales and Production use, and
     * the same {@code (moduleType, moduleId)} addressing), so no new table, no
     * migration and no separate storage service is introduced. Existing rows are
     * untouched: {@code MARKETING_TRAVEL_PLAN} did not exist before, so the values
     * already stored for other modules keep their meaning.
     */
    public static final String ATTACHMENT_MODULE = "MARKETING_TRAVEL_PLAN";

    private final MarketingTravelPlanRepository planRepository;
    private final MarketingTravelPlanStopRepository stopRepository;
    private final MarketingRouteSnapshotRepository routeSnapshotRepository;
    private final MarketingPlanChangeHistoryRepository changeHistoryRepository;
    private final AuditContext auditContext;
    private final AttachmentStorePort attachmentStore;

    public TravelPlanService(MarketingTravelPlanRepository planRepository,
                              MarketingTravelPlanStopRepository stopRepository,
                              MarketingRouteSnapshotRepository routeSnapshotRepository,
                              MarketingPlanChangeHistoryRepository changeHistoryRepository,
                              AuditContext auditContext,
                              AttachmentStorePort attachmentStore) {
        this.planRepository = planRepository;
        this.stopRepository = stopRepository;
        this.routeSnapshotRepository = routeSnapshotRepository;
        this.changeHistoryRepository = changeHistoryRepository;
        this.auditContext = auditContext;
        this.attachmentStore = attachmentStore;
    }

    // ============================== CRUD ====================================

    /** Stable palette of visually distinct route colors for trip plans. */
    private static final String[] ROUTE_COLORS = {
        "#2563eb", "#dc2626", "#059669", "#7c3aed", "#d97706",
        "#0891b2", "#e11d48", "#4f46e5", "#ea580c", "#0d9488",
        "#9333ea", "#be123c", "#2563eb", "#65a30d", "#c026d3"
    };

    private String nextRouteColor() {
        long count = planRepository.count();
        return ROUTE_COLORS[(int)(count % ROUTE_COLORS.length)];
    }

    @Transactional
    public TravelPlanResponse create(TravelPlanRequest request) {
        User user = requireUser();
        MarketingTravelPlan plan = new MarketingTravelPlan();
        plan.setMarketer(user.getFullName() == null || user.getFullName().isBlank()
                ? user.getEmail() : user.getFullName());
        plan.setMarketerUserId(user.getId());
        plan.setStatus("Draft");
        plan.setRouteColor(nextRouteColor());
        applyPlanFields(plan, request);
        MarketingTravelPlan saved = planRepository.save(plan);

        // Save stops if provided
        if (request.stops() != null) {
            saveStops(saved.getId(), request.stops());
        }

        // Record history
        addHistory(saved.getId(), null, "CREATED", "Travel plan created", user);

        return toResponse(saved);
    }

    public TravelPlanResponse get(Long id) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse update(Long id, TravelPlanRequest request) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        if ("Approved".equals(plan.getStatus()) || "Active".equals(plan.getStatus())
                || "Completed".equals(plan.getStatus())) {
            throw new BadRequestException("Cannot edit a " + plan.getStatus().toLowerCase() + " plan");
        }
        applyPlanFields(plan, request);
        planRepository.save(plan);
        if (request.stops() != null) {
            replaceStops(plan.getId(), request.stops());
        }
        addHistory(plan.getId(), null, "PLAN_UPDATED", "Travel plan updated", requireUser());
        return toResponse(plan);
    }

    @Transactional
    public void delete(Long id) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        if (!"Draft".equals(plan.getStatus())) {
            throw new BadRequestException("Only draft plans can be deleted");
        }
        stopRepository.deleteByTravelPlanId(plan.getId());
        routeSnapshotRepository.deleteByTravelPlanId(plan.getId());
        changeHistoryRepository.deleteByTravelPlanId(plan.getId());
        // The registry's attachment rows go with it, so deleting a draft never
        // leaves rows (or the storage-ledger entries they hold) pointing at a
        // record that no longer exists.
        attachmentStore.list(ATTACHMENT_MODULE, plan.getId())
                .forEach(ref -> attachmentStore.delete(ATTACHMENT_MODULE, plan.getId(), ref.id()));
        planRepository.delete(plan);
    }

    // ============================== Attachments ==============================

    /**
     * Every attachment stored against this registry, oldest first — the ordering
     * the shared attachment store uses everywhere.
     */
    @Transactional(readOnly = true)
    public List<AttachmentStorePort.AttachmentRef> getAttachments(Long id) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        return attachmentStore.list(ATTACHMENT_MODULE, plan.getId());
    }

    /**
     * Stores the uploaded file and files it against this registry.
     *
     * <p>The registry is resolved and access-checked <em>before</em> the bytes
     * are written, so a file can never be stored for a registry that does not
     * exist or that the caller is not allowed to see. Validation (size, extension,
     * project-wide storage pool) is the shared store's, unchanged.
     */
    @Transactional
    public AttachmentStorePort.AttachmentRef addAttachment(Long id, MultipartFile file) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        return attachmentStore.add(ATTACHMENT_MODULE, plan.getId(), file);
    }

    /**
     * Deletes one attachment of this registry. An id that is unknown, or filed
     * under a different registry, is a 404 — never another record's file.
     */
    @Transactional
    public void deleteAttachment(Long id, Long attachmentId) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        attachmentStore.delete(ATTACHMENT_MODULE, plan.getId(), attachmentId);
    }

    // ============================== Draft / Submit ===========================

    @Transactional
    public TravelPlanResponse saveDraft(Long id, TravelPlanRequest request) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        if ("Approved".equals(plan.getStatus()) || "Active".equals(plan.getStatus())
                || "Completed".equals(plan.getStatus())) {
            throw new BadRequestException("Cannot edit a " + plan.getStatus().toLowerCase() + " plan");
        }
        applyPlanFields(plan, request);
        plan.setStatus("Draft");
        planRepository.save(plan);
        if (request.stops() != null) {
            replaceStops(plan.getId(), request.stops());
        }
        addHistory(plan.getId(), null, "DRAFT_SAVED", "Draft saved", requireUser());
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse submit(Long id) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        if (!"Draft".equals(plan.getStatus()) && !"Revision Required".equals(plan.getStatus())) {
            throw new BadRequestException("Only draft or revision-required plans can be submitted");
        }
        plan.setStatus("Submitted");
        plan.setApprovalStatus("Pending");
        planRepository.save(plan);
        addHistory(plan.getId(), null, "SUBMITTED", "Plan submitted for approval", requireUser());
        return toResponse(plan);
    }

    // ============================== Approval ================================    @Transactional
    public TravelPlanResponse approve(Long id) {
        MarketingTravelPlan plan = findPlan(id);
        // Same record rule as every other registry operation: only the plan's own
        // marketer, or an ADMIN/MANAGER, may move it through approval. Without
        // this an outsider could approve or reject a registry it cannot read.
        assertCanAccess(plan);
        User approver = requireUser();
        if (!"Submitted".equals(plan.getStatus())) {
            throw new BadRequestException("Only submitted plans can be approved");
        }
        plan.setStatus("Approved");
        plan.setApprovalStatus("Approved");
        plan.setApprovedBy(approver.getFullName() != null ? approver.getFullName() : approver.getEmail());
        plan.setApprovedAt(LocalDateTime.now());
        planRepository.save(plan);
        addHistory(plan.getId(), null, "APPROVED", "Plan approved by " + plan.getApprovedBy(), approver);
        return toResponse(plan);
    }    @Transactional
    public TravelPlanResponse reject(Long id, TravelPlanRequest request) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        User approver = requireUser();
        if (!"Submitted".equals(plan.getStatus())) {
            throw new BadRequestException("Only submitted plans can be rejected");
        }
        plan.setStatus("Rejected");
        plan.setApprovalStatus("Rejected");
        plan.setRejectionReason(request.rejectionReason());
        planRepository.save(plan);
        addHistory(plan.getId(), null, "REJECTED", "Plan rejected: " + request.rejectionReason(), approver);
        return toResponse(plan);
    }    @Transactional
    public TravelPlanResponse requestRevision(Long id, TravelPlanRequest request) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        User approver = requireUser();
        if (!"Submitted".equals(plan.getStatus())) {
            throw new BadRequestException("Only submitted plans can be sent for revision");
        }
        plan.setStatus("Revision Required");
        plan.setApprovalStatus("Revision Required");
        plan.setRevisionComments(request.revisionComments());
        planRepository.save(plan);
        addHistory(plan.getId(), null, "REVISION_REQUESTED",
                "Revision requested: " + request.revisionComments(), approver);
        return toResponse(plan);
    }

    // ============================== Trip Execution ===========================

    @Transactional
    public TravelPlanResponse startTrip(Long id, TravelPlanRequest request) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        if (!"Approved".equals(plan.getStatus())) {
            throw new BadRequestException("Only approved plans can be started");
        }
        plan.setStatus("Active");
        plan.setTripActualStart(LocalDateTime.now());
        if (request.checkInLatitude() != null) plan.setTripStartLatitude(request.checkInLatitude());
        if (request.checkInLongitude() != null) plan.setTripStartLongitude(request.checkInLongitude());
        planRepository.save(plan);
        addHistory(plan.getId(), null, "TRIP_STARTED", "Trip started", requireUser());
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse endTrip(Long id, TravelPlanRequest request) {
        MarketingTravelPlan plan = findPlan(id);
        assertCanAccess(plan);
        if (!"Active".equals(plan.getStatus())) {
            throw new BadRequestException("Only active trips can be ended");
        }
        plan.setStatus("Completed");
        plan.setTripActualEnd(LocalDateTime.now());
        if (request.checkOutLatitude() != null) plan.setTripEndLatitude(request.checkOutLatitude());
        if (request.checkOutLongitude() != null) plan.setTripEndLongitude(request.checkOutLongitude());
        planRepository.save(plan);
        addHistory(plan.getId(), null, "TRIP_ENDED", "Trip completed", requireUser());
        return toResponse(plan);
    }

    // ============================== Stop Operations ==========================

    @Transactional
    public TravelPlanResponse addStop(Long planId, TravelPlanRequest.StopDto stopDto) {
        MarketingTravelPlan plan = findPlan(planId);
        assertCanAccess(plan);
        if ("Completed".equals(plan.getStatus()) || "Cancelled".equals(plan.getStatus())) {
            throw new BadRequestException("Cannot add stops to a " + plan.getStatus().toLowerCase() + " plan");
        }

        // Get current max sequence
        List<MarketingTravelPlanStop> existing = stopRepository.findByTravelPlanIdOrderBySequenceAscIdAsc(planId);
        int nextSeq = existing.isEmpty() ? 1 : existing.stream()
                .mapToInt(MarketingTravelPlanStop::getSequence).max().orElse(0) + 1;

        MarketingTravelPlanStop stop = new MarketingTravelPlanStop();
        stop.setTravelPlanId(planId);
        stop.setSequence(stopDto.sequence() != null ? stopDto.sequence() : nextSeq);
        stop.setStatus("Planned");
        applyStopFields(stop, stopDto);
        stopRepository.save(stop);

        recalculateRoute(plan);
        addHistory(planId, stop.getId(), "STOP_ADDED",
                "Stop added: " + stop.getCompanyName(), requireUser());
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse updateStop(Long planId, Long stopId, TravelPlanRequest.StopDto stopDto) {
        MarketingTravelPlan plan = findPlan(planId);
        assertCanAccess(plan);
        MarketingTravelPlanStop stop = findStop(stopId);
        if (!planId.equals(stop.getTravelPlanId())) {
            throw new BadRequestException("Stop does not belong to this plan");
        }
        applyStopFields(stop, stopDto);
        stopRepository.save(stop);
        recalculateRoute(plan);
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse cancelStop(Long planId, Long stopId, String reason) {
        MarketingTravelPlan plan = findPlan(planId);
        assertCanAccess(plan);
        MarketingTravelPlanStop stop = findStop(stopId);
        if (!planId.equals(stop.getTravelPlanId())) {
            throw new BadRequestException("Stop does not belong to this plan");
        }
        stop.setStatus("Cancelled");
        stop.setCancelledAt(LocalDateTime.now());
        stop.setCancelledBy(requireUser().getFullName());
        stop.setCancellationReason(reason);
        stopRepository.save(stop);

        recalculateRoute(plan);
        addHistory(planId, stopId, "STOP_CANCELLED",
                "Stop cancelled: " + stop.getCompanyName() + " — Reason: " + reason, requireUser());
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse rescheduleStop(Long planId, Long stopId, TravelPlanRequest request) {
        MarketingTravelPlan plan = findPlan(planId);
        assertCanAccess(plan);
        MarketingTravelPlanStop stop = findStop(stopId);
        if (!planId.equals(stop.getTravelPlanId())) {
            throw new BadRequestException("Stop does not belong to this plan");
        }
        stop.setStatus("Rescheduled");
        stop.setRescheduledDate(request.rescheduledDate());
        stop.setRescheduledTime(request.rescheduledTime());
        stop.setRescheduleNotes(request.rescheduleNotes());
        stopRepository.save(stop);
        addHistory(planId, stopId, "STOP_RESCHEDULED",
                "Stop rescheduled: " + stop.getCompanyName() + " to " + request.rescheduledDate(), requireUser());
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse reorderStops(Long planId, List<Long> orderedStopIds) {
        MarketingTravelPlan plan = findPlan(planId);
        assertCanAccess(plan);
        List<MarketingTravelPlanStop> stops = stopRepository.findByTravelPlanIdOrderBySequenceAscIdAsc(planId);
        for (int i = 0; i < orderedStopIds.size(); i++) {
            Long stopId = orderedStopIds.get(i);
            for (MarketingTravelPlanStop stop : stops) {
                if (stop.getId().equals(stopId)) {
                    stop.setSequence(i + 1);
                    stopRepository.save(stop);
                    break;
                }
            }
        }
        recalculateRoute(plan);
        addHistory(planId, null, "STOP_REORDERED", "Stops reordered", requireUser());
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse checkIn(Long planId, Long stopId, TravelPlanRequest request) {
        MarketingTravelPlan plan = findPlan(planId);
        assertCanAccess(plan);
        MarketingTravelPlanStop stop = findStop(stopId);
        if (!planId.equals(stop.getTravelPlanId())) {
            throw new BadRequestException("Stop does not belong to this plan");
        }
        stop.setStatus("Active");
        stop.setActualCheckIn(LocalDateTime.now());
        stop.setCheckInNotes(request.checkInNotes());
        stopRepository.save(stop);
        addHistory(planId, stopId, "STOP_CHECKED_IN",
                "Checked in at: " + stop.getCompanyName(), requireUser());
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse checkOut(Long planId, Long stopId, TravelPlanRequest request) {
        MarketingTravelPlan plan = findPlan(planId);
        assertCanAccess(plan);
        MarketingTravelPlanStop stop = findStop(stopId);
        if (!planId.equals(stop.getTravelPlanId())) {
            throw new BadRequestException("Stop does not belong to this plan");
        }
        stop.setStatus("Completed");
        stop.setActualCheckOut(LocalDateTime.now());
        stop.setCheckOutNotes(request.checkOutNotes());
        stopRepository.save(stop);
        addHistory(planId, stopId, "STOP_CHECKED_OUT",
                "Checked out from: " + stop.getCompanyName(), requireUser());
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse markStopReached(Long planId, Long stopId) {
        MarketingTravelPlan plan = findPlan(planId);
        assertCanAccess(plan);
        MarketingTravelPlanStop stop = findStop(stopId);
        if (!planId.equals(stop.getTravelPlanId())) {
            throw new BadRequestException("Stop does not belong to this plan");
        }
        stop.setStatus("Reached");
        stopRepository.save(stop);
        addHistory(planId, stopId, "STOP_REACHED",
                "Stop reached: " + stop.getCompanyName(), requireUser());
        return toResponse(plan);
    }

    @Transactional
    public TravelPlanResponse markStopSkipped(Long planId, Long stopId) {
        MarketingTravelPlan plan = findPlan(planId);
        assertCanAccess(plan);
        MarketingTravelPlanStop stop = findStop(stopId);
        if (!planId.equals(stop.getTravelPlanId())) {
            throw new BadRequestException("Stop does not belong to this plan");
        }
        stop.setStatus("Skipped");
        stopRepository.save(stop);
        addHistory(planId, stopId, "STOP_SKIPPED",
                "Stop skipped: " + stop.getCompanyName(), requireUser());
        recalculateRoute(plan);
        return toResponse(plan);
    }

    // ============================== Route Calculation ========================

    /**
     * Recalculate the route for a plan.  This uses the Haversine formula as a
     * fallback when Google Maps API is unavailable.  When Google Routes API is
     * configured, it can be called here instead.
     *
     * <p>The method:
     * 1. Gets all active (non-cancelled) stops in sequence order
     * 2. Calculates distance between consecutive stops
     * 3. Estimates travel time (assuming average 60 km/h)
     * 4. Saves a route snapshot for history
     * 5. Updates the plan's total distance and travel time
     */
    @Transactional
    public TravelPlanResponse recalculateRoute(Long planId) {
        MarketingTravelPlan plan = findPlan(planId);
        assertCanAccess(plan);
        recalculateRoute(plan);
        return toResponse(plan);
    }

    private void recalculateRoute(MarketingTravelPlan plan) {
        List<MarketingTravelPlanStop> allStops = stopRepository.findByTravelPlanIdOrderBySequenceAscIdAsc(plan.getId());
        List<MarketingTravelPlanStop> activeStops = allStops.stream()
                .filter(s -> !"Cancelled".equals(s.getStatus()) && !"Skipped".equals(s.getStatus()))
                .collect(Collectors.toList());

        // Save previous values for snapshot
        BigDecimal prevDistance = plan.getTotalDistanceKm();
        Integer prevTime = plan.getTotalTravelTimeMinutes();

        BigDecimal totalDistance = BigDecimal.ZERO;
        int totalTimeMinutes = 0;
        BigDecimal prevLat = plan.getStartLatitude();
        BigDecimal prevLng = plan.getStartLongitude();

        for (int i = 0; i < activeStops.size(); i++) {
            MarketingTravelPlanStop stop = activeStops.get(i);
            if (stop.getLatitude() != null && stop.getLongitude() != null && prevLat != null && prevLng != null) {
                double dist = haversineKm(
                        prevLat.doubleValue(), prevLng.doubleValue(),
                        stop.getLatitude().doubleValue(), stop.getLongitude().doubleValue());
                BigDecimal distBd = BigDecimal.valueOf(dist).setScale(2, java.math.RoundingMode.HALF_UP);
                stop.setDistanceFromPreviousKm(distBd);
                // Assume average 60 km/h travel speed
                int travelMinutes = (int) Math.round(dist / 60.0 * 60);
                stop.setTravelTimeFromPreviousMinutes(travelMinutes);
                totalDistance = totalDistance.add(distBd);
                totalTimeMinutes += travelMinutes;
                stopRepository.save(stop);
            }
            prevLat = stop.getLatitude();
            prevLng = stop.getLongitude();
        }

        // Add return leg if ending location is different from last stop
        if (plan.getEndLatitude() != null && plan.getEndLongitude() != null
                && prevLat != null && prevLng != null) {
            double returnDist = haversineKm(
                    prevLat.doubleValue(), prevLng.doubleValue(),
                    plan.getEndLatitude().doubleValue(), plan.getEndLongitude().doubleValue());
            totalDistance = totalDistance.add(BigDecimal.valueOf(returnDist).setScale(2, java.math.RoundingMode.HALF_UP));
            totalTimeMinutes += (int) Math.round(returnDist / 60.0 * 60);
        }

        plan.setTotalDistanceKm(totalDistance);
        plan.setTotalTravelTimeMinutes(totalTimeMinutes);
        plan.setActiveStopsCount(activeStops.size());
        planRepository.save(plan);

        // Save route snapshot
        MarketingRouteSnapshot snapshot = new MarketingRouteSnapshot();
        snapshot.setTravelPlanId(plan.getId());
        snapshot.setTriggerType("RECALCULATED");
        snapshot.setActiveStopSequence(activeStops.stream()
                .map(s -> String.valueOf(s.getId()))
                .collect(Collectors.joining(",")));
        snapshot.setTotalDistanceKm(totalDistance);
        snapshot.setTotalTravelTimeMinutes(totalTimeMinutes);
        snapshot.setPreviousTotalDistanceKm(prevDistance);
        snapshot.setPreviousTotalTravelTimeMinutes(prevTime);
        if (prevDistance != null) {
            snapshot.setDistanceDifferenceKm(totalDistance.subtract(prevDistance));
        }
        snapshot.setCalculatedBy("System (Haversine)");
        routeSnapshotRepository.save(snapshot);
    }

    /**
     * Haversine formula to calculate distance between two lat/lng points in km.
     */
    private double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6371.0; // Earth radius in km
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // ============================== Summary =================================

    public record PlanSummary(
            long totalPlans, long pendingApproval, long approvedPlans,
            long activeTrips, long completedTrips, long cancelledTrips, long upcomingTrips
    ) {}

    public PlanSummary getSummary() {
        Long owner = scopeOwnerId();
        if (owner != null) {
            // A marketer's own tally. The registry's KPI cards and its status tabs
            // are the same list seen two ways, so they must count exactly the rows
            // this caller may open — never the company's other registries. Each
            // count mirrors the global query it replaces (same status, same
            // soft-delete rule), so only the ownership filter is new.
            List<MarketingTravelPlan> own =
                    planRepository.findByMarketerUserIdOrderByCreatedAtDesc(owner);
            LocalDate today = LocalDate.now();
            long upcoming = own.stream()
                    .filter(plan -> !plan.isDeleted() && "Approved".equals(plan.getStatus()))
                    .filter(plan -> plan.getStartDate() != null && !plan.getStartDate().isBefore(today))
                    .count();
            return new PlanSummary(
                    own.size(),
                    countOwnedByStatus(own, "Submitted"),
                    countOwnedByStatus(own, "Approved"),
                    countOwnedByStatus(own, "Active"),
                    countOwnedByStatus(own, "Completed"),
                    countOwnedByStatus(own, "Cancelled"),
                    upcoming);
        }
        long total = planRepository.count();
        long pending = planRepository.countByStatus("Submitted");
        long approved = planRepository.countByStatus("Approved");
        long active = planRepository.countByStatus("Active");
        long completed = planRepository.countByStatus("Completed");
        long cancelled = planRepository.countByStatus("Cancelled");
        // Upcoming = Approved plans with start date >= today
        long upcoming = planRepository.countByStatusAndStartDateAfter("Approved", LocalDate.now());
        return new PlanSummary(total, pending, approved, active, completed, cancelled, upcoming);
    }

    /** One owned plan status, counted the way {@code countByStatus} counts globally. */
    private static long countOwnedByStatus(List<MarketingTravelPlan> plans, String status) {
        return plans.stream()
                .filter(plan -> !plan.isDeleted() && status.equals(plan.getStatus()))
                .count();
    }

    // ============================== List & Search ============================

    public Page<TravelPlanListResponse> list(int page, int size, String search, String sort,
                                              String status, String marketer,
                                              String dateFrom, String dateTo) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort, "createdAt"));

        Specification<MarketingTravelPlan> spec = buildSpecification(search, status, marketer, dateFrom, dateTo)
                .and(scopeSpecification());

        return planRepository.findAll(spec, pageable).map(this::toListResponse);
    }

    /**
     * Full journeys (with stops) for the Marketing Map. Scoped the same way
     * as {@link #list}: ADMIN/MANAGER see all, others only their own plans.
     */
    @Transactional(readOnly = true)
    public List<TravelPlanResponse> mapJourneys(String status, String marketer) {
        Specification<MarketingTravelPlan> spec = buildSpecification(null, status, marketer, null, null)
                .and(scopeSpecification());
        return planRepository.findAll(spec, Sort.by(Sort.Direction.DESC, "startDate"))
                .stream().map(this::toResponse).toList();
    }

    // ============================== Helpers =================================

    private void applyPlanFields(MarketingTravelPlan plan, TravelPlanRequest request) {
        if (request.startDate() != null) plan.setStartDate(request.startDate());
        if (request.startTime() != null) plan.setStartTime(request.startTime());
        if (request.endDate() != null) plan.setEndDate(request.endDate());
        if (request.endTime() != null) plan.setEndTime(request.endTime());
        if (request.startingLocation() != null) plan.setStartingLocation(request.startingLocation().trim());
        if (request.startLatitude() != null) plan.setStartLatitude(request.startLatitude());
        if (request.startLongitude() != null) plan.setStartLongitude(request.startLongitude());
        if (request.endingLocation() != null) plan.setEndingLocation(request.endingLocation().trim());
        if (request.endLatitude() != null) plan.setEndLatitude(request.endLatitude());
        if (request.endLongitude() != null) plan.setEndLongitude(request.endLongitude());
        if (request.purpose() != null) plan.setPurpose(request.purpose().trim());
        if (request.remarks() != null) plan.setRemarks(request.remarks());
    }

    private void applyStopFields(MarketingTravelPlanStop stop, TravelPlanRequest.StopDto dto) {
        if (dto.companyName() != null) stop.setCompanyName(dto.companyName().trim());
        if (dto.customerName() != null) stop.setCustomerName(dto.customerName().trim());
        if (dto.visitId() != null) stop.setVisitId(dto.visitId());
        if (dto.googlePlaceId() != null) stop.setGooglePlaceId(dto.googlePlaceId());
        if (dto.address() != null) stop.setAddress(dto.address().trim());
        if (dto.state() != null) stop.setState(dto.state().trim());
        if (dto.district() != null) stop.setDistrict(dto.district().trim());
        if (dto.city() != null) stop.setCity(dto.city().trim());
        if (dto.latitude() != null) stop.setLatitude(dto.latitude());
        if (dto.longitude() != null) stop.setLongitude(dto.longitude());
        if (dto.plannedDate() != null) stop.setPlannedDate(dto.plannedDate());
        if (dto.plannedArrivalTime() != null) stop.setPlannedArrivalTime(dto.plannedArrivalTime());
        if (dto.expectedStayDurationMinutes() != null) stop.setExpectedStayDurationMinutes(dto.expectedStayDurationMinutes());
        if (dto.appointmentStatus() != null) stop.setAppointmentStatus(dto.appointmentStatus());
        if (dto.contactPerson() != null) stop.setContactPerson(dto.contactPerson().trim());
        if (dto.contactDesignation() != null) stop.setContactDesignation(dto.contactDesignation().trim());
        if (dto.contactPhone() != null) stop.setContactPhone(dto.contactPhone().trim());
        if (dto.contactEmail() != null) stop.setContactEmail(dto.contactEmail().trim());
        if (dto.plannedDepartureTime() != null) stop.setPlannedDepartureTime(dto.plannedDepartureTime());
        if (dto.purposeOfVisit() != null) stop.setPurposeOfVisit(dto.purposeOfVisit().trim());
        if (dto.priority() != null) stop.setPriority(dto.priority().trim());
        if (dto.remarks() != null) stop.setRemarks(dto.remarks());
    }

    private void saveStops(Long planId, List<TravelPlanRequest.StopDto> stops) {
        int seq = 1;
        for (TravelPlanRequest.StopDto dto : stops) {
            MarketingTravelPlanStop stop = new MarketingTravelPlanStop();
            stop.setTravelPlanId(planId);
            stop.setSequence(dto.sequence() != null ? dto.sequence() : seq++);
            stop.setStatus("Planned");
            applyStopFields(stop, dto);
            stopRepository.save(stop);
        }
    }

    private void replaceStops(Long planId, List<TravelPlanRequest.StopDto> stops) {
        stopRepository.deleteByTravelPlanId(planId);
        saveStops(planId, stops);
    }

    private void addHistory(Long planId, Long stopId, String action, String description, User user) {
        MarketingPlanChangeHistory history = new MarketingPlanChangeHistory();
        history.setTravelPlanId(planId);
        history.setStopId(stopId);
        history.setAction(action);
        history.setDescription(description);
        history.setPerformedBy(user.getFullName() != null ? user.getFullName() : user.getEmail());
        history.setPerformedByUserId(user.getId());
        changeHistoryRepository.save(history);
    }

    // ---- Finders ----

    private MarketingTravelPlan findPlan(Long id) {
        return planRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Travel Plan not found with id: " + id));
    }

    private MarketingTravelPlanStop findStop(Long id) {
        return stopRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Travel Plan Stop not found with id: " + id));
    }

    private User requireUser() {
        User user = auditContext.currentUser();
        if (user == null) throw new AccessDeniedException("Authentication required");
        return user;
    }

    private void assertCanAccess(MarketingTravelPlan plan) {
        User user = requireUser();
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) return;
        if (plan.getMarketerUserId() == null || !plan.getMarketerUserId().equals(user.getId())) {
            throw new AccessDeniedException("You can only access your own travel plans");
        }
    }

    /**
     * The marketer whose registries the caller may see, or {@code null} for
     * ADMIN/MANAGER (every registry) — the single-owner form of
     * {@link #scopeSpecification()}, used by the aggregates that are not built
     * from a Specification. An unauthenticated caller is rejected here rather
     * than quietly treated as unrestricted.
     */
    private Long scopeOwnerId() {
        User user = requireUser();
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) {
            return null;
        }
        return user.getId();
    }

    // ---- Specification builder ----

    private Specification<MarketingTravelPlan> buildSpecification(String search, String status,
                                                                   String marketer, String dateFrom,
                                                                   String dateTo) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("deleted"), false));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(cb.toString(root.get("id"))), like),
                        cb.like(cb.lower(root.get("marketer")), like),
                        cb.like(cb.lower(root.get("startingLocation")), like),
                        cb.like(cb.lower(root.get("endingLocation")), like),
                        cb.like(cb.lower(root.get("purpose")), like)
                ));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (marketer != null && !marketer.isBlank()) {
                predicates.add(cb.equal(root.get("marketer"), marketer));
            }
            if (dateFrom != null && !dateFrom.isBlank()) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("startDate"), LocalDate.parse(dateFrom)));
            }
            if (dateTo != null && !dateTo.isBlank()) {
                predicates.add(cb.lessThanOrEqualTo(root.get("startDate"), LocalDate.parse(dateTo)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<MarketingTravelPlan> scopeSpecification() {
        return (root, query, cb) -> {
            User user = auditContext.currentUser();
            if (user == null) return cb.disjunction();
            if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) return cb.conjunction();
            return cb.equal(root.get("marketerUserId"), user.getId());
        };
    }

    private Sort buildSort(String sort, String defaultField) {
        if (sort == null || sort.isBlank()) return Sort.by(Sort.Direction.DESC, defaultField);
        String[] parts = sort.split(",");
        String field = parts[0];
        String mapped = switch (field) {
            case "planNo", "startDate", "endDate", "startingLocation", "endingLocation",
                 "purpose", "status", "marketer", "totalDistanceKm", "activeStopsCount",
                 "createdAt", "updatedAt" -> field;
            default -> defaultField;
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    // ---- Number generation ----

    private String planNo(Long id, LocalDateTime createdAt) {
        if (id == null) return "TP-";
        int year = createdAt == null ? Year.now().getValue() : createdAt.getYear();
        return "TP-" + year + "-" + String.format("%04d", id);
    }

    // ---- Mapping ----

    private TravelPlanListResponse toListResponse(MarketingTravelPlan plan) {
        return new TravelPlanListResponse(
                plan.getId(),
                planNo(plan.getId(), plan.getCreatedAt()),
                plan.getMarketer(),
                plan.getStartDate(),
                plan.getEndDate(),
                plan.getStartingLocation(),
                plan.getEndingLocation(),
                plan.getPurpose(),
                plan.getStatus(),
                plan.getTotalDistanceKm(),
                plan.getTotalTravelTimeMinutes(),
                plan.getActiveStopsCount(),
                plan.getApprovedBy(),
                plan.getApprovedAt(),
                plan.getCreatedAt(),
                plan.getUpdatedAt()
        );
    }

    private TravelPlanResponse toResponse(MarketingTravelPlan plan) {
        List<MarketingTravelPlanStop> stops = stopRepository.findByTravelPlanIdOrderBySequenceAscIdAsc(plan.getId());
        List<MarketingPlanChangeHistory> history = changeHistoryRepository.findByTravelPlanIdOrderByPerformedAtAscIdAsc(plan.getId());
        List<MarketingRouteSnapshot> snapshots = routeSnapshotRepository.findByTravelPlanIdOrderByCalculatedAtDesc(plan.getId());

        return new TravelPlanResponse(
                plan.getId(),
                planNo(plan.getId(), plan.getCreatedAt()),
                plan.getMarketer(),
                plan.getMarketerUserId(),
                plan.getStartDate(),
                plan.getStartTime(),
                plan.getEndDate(),
                plan.getEndTime(),
                plan.getStartingLocation(),
                plan.getStartLatitude(),
                plan.getStartLongitude(),
                plan.getEndingLocation(),
                plan.getEndLatitude(),
                plan.getEndLongitude(),
                plan.getPurpose(),
                plan.getRemarks(),
                plan.getStatus(),
                plan.getTotalDistanceKm(),
                plan.getTotalTravelTimeMinutes(),
                plan.getActiveStopsCount(),
                plan.getRouteColor(),
                plan.getApprovedBy(),
                plan.getApprovedAt(),
                plan.getApprovalStatus(),
                plan.getRejectionReason(),
                plan.getRevisionComments(),
                plan.getTripActualStart(),
                plan.getTripActualEnd(),
                stops.stream().map(this::toStopDto).toList(),
                history.stream().map(this::toHistoryDto).toList(),
                snapshots.stream().map(this::toSnapshotDto).toList(),
                plan.getCreatedAt(),
                plan.getUpdatedAt()
        );
    }

    private TravelPlanResponse.StopDto toStopDto(MarketingTravelPlanStop s) {
        return new TravelPlanResponse.StopDto(
                s.getId(), s.getSequence(), s.getCompanyName(), s.getCustomerName(),
                s.getVisitId(), s.getGooglePlaceId(), s.getAddress(),
                s.getState(), s.getDistrict(), s.getCity(),
                s.getLatitude(), s.getLongitude(),
                s.getPlannedDate(), s.getPlannedArrivalTime(),
                s.getExpectedStayDurationMinutes(), s.getAppointmentStatus(),
                s.getContactPerson(), s.getContactDesignation(), s.getContactPhone(),
                s.getContactEmail(), s.getPlannedDepartureTime(),
                s.getPurposeOfVisit(), s.getPriority(), s.getRemarks(),
                s.getStatus(), s.getCancelledAt(), s.getCancelledBy(),
                s.getCancellationReason(),
                s.getRescheduledDate(), s.getRescheduledTime(), s.getRescheduleNotes(),
                s.getDistanceFromPreviousKm(), s.getTravelTimeFromPreviousMinutes(),
                s.getActualCheckIn(), s.getActualCheckOut(),
                s.getCheckInNotes(), s.getCheckOutNotes(),
                s.getCreatedAt(), s.getUpdatedAt()
        );
    }

    private TravelPlanResponse.HistoryDto toHistoryDto(MarketingPlanChangeHistory h) {
        return new TravelPlanResponse.HistoryDto(
                h.getId(), h.getAction(), h.getDescription(),
                h.getPerformedBy(), h.getPerformedAt()
        );
    }

    private TravelPlanResponse.RouteSnapshotDto toSnapshotDto(MarketingRouteSnapshot r) {
        return new TravelPlanResponse.RouteSnapshotDto(
                r.getId(), r.getTriggerType(),
                r.getTotalDistanceKm(), r.getTotalTravelTimeMinutes(),
                r.getPreviousTotalDistanceKm(), r.getPreviousTotalTravelTimeMinutes(),
                r.getDistanceDifferenceKm(), r.getCalculatedBy(), r.getCalculatedAt()
        );
    }
}
