package com.vishatech.erp.service;

import com.vishatech.erp.dto.MapLocationResponse;
import com.vishatech.erp.dto.MarketingLocationRequest;
import com.vishatech.erp.entity.*;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.*;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.repository.CustomerRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Aggregates location data from all marketing entities into a unified
 * map-ready format.  The frontend Marketing Map page calls a single
 * endpoint and receives markers for customers, Q Forms, travel plan
 * stops, marketer positions, and user-created marketing locations.
 */
@Service
@Transactional(readOnly = true)
public class MarketingMapService {

    private final CustomerRepository customerRepository;
    private final QuestionnaireFormRepository qFormRepository;
    private final MarketingTravelPlanRepository travelPlanRepository;
    private final MarketingTravelPlanStopRepository stopRepository;
    private final MarketingLocationTrackingRepository locationTrackingRepository;
    private final MarketingVisitRepository visitRepository;
    private final UserRepository userRepository;
    private final MarketingLocationRepository marketingLocationRepository;
    private final MarketingExpenseTripRepository expenseTripRepository;
    private final QFormAttachmentRepository qFormAttachmentRepository;
    private final SalesAttachmentRepository salesAttachmentRepository;
    private final MarketingVisitActivityRepository activityRepository;
    private final com.vishatech.erp.service.FileStorageService fileStorageService;
    private final com.vishatech.erp.util.AuditContext auditContext;

    public MarketingMapService(
            CustomerRepository customerRepository,
            QuestionnaireFormRepository qFormRepository,
            MarketingTravelPlanRepository travelPlanRepository,
            MarketingTravelPlanStopRepository stopRepository,
            MarketingLocationTrackingRepository locationTrackingRepository,
            MarketingVisitRepository visitRepository,
            UserRepository userRepository,
            MarketingLocationRepository marketingLocationRepository,
            MarketingExpenseTripRepository expenseTripRepository,
            QFormAttachmentRepository qFormAttachmentRepository,
            SalesAttachmentRepository salesAttachmentRepository,
            MarketingVisitActivityRepository activityRepository,
            com.vishatech.erp.service.FileStorageService fileStorageService,
            com.vishatech.erp.util.AuditContext auditContext) {
        this.customerRepository = customerRepository;
        this.qFormRepository = qFormRepository;
        this.travelPlanRepository = travelPlanRepository;
        this.stopRepository = stopRepository;
        this.locationTrackingRepository = locationTrackingRepository;
        this.visitRepository = visitRepository;
        this.userRepository = userRepository;
        this.marketingLocationRepository = marketingLocationRepository;
        this.expenseTripRepository = expenseTripRepository;
        this.qFormAttachmentRepository = qFormAttachmentRepository;
        this.salesAttachmentRepository = salesAttachmentRepository;
        this.activityRepository = activityRepository;
        this.fileStorageService = fileStorageService;
        this.auditContext = auditContext;
    }

    /**
     * Returns all map-ready locations aggregated from every entity type.
     */
    public List<MapLocationResponse> getAllLocations(String typeFilter, String search) {
        List<MapLocationResponse> results = new ArrayList<>();

        if (typeFilter == null || typeFilter.isBlank() || "customer".equals(typeFilter)) {
            results.addAll(buildCustomerLocations(search));
        }
        if (typeFilter == null || typeFilter.isBlank() || "qform".equals(typeFilter)) {
            results.addAll(buildQFormLocations(search));
        }
        if (typeFilter == null || typeFilter.isBlank() || "travel_stop".equals(typeFilter) || "travel_planner".equals(typeFilter)) {
            results.addAll(buildTravelPlanLocations(search));
        }
        if (typeFilter == null || typeFilter.isBlank() || "marketer".equals(typeFilter)) {
            results.addAll(buildMarketerLocations());
        }
        if (typeFilter == null || typeFilter.isBlank() || "marketing_location".equals(typeFilter)) {
            results.addAll(buildMarketingLocationResults(search));
        }

        return results;
    }

    // ======================== Marketing Locations (user-created) ===========

    private List<MapLocationResponse> buildMarketingLocationResults(String search) {
        List<MarketingLocation> locations;
        if (search != null && !search.isBlank()) {
            locations = marketingLocationRepository.search(search, "Archived");
        } else {
            locations = marketingLocationRepository.findByStatusNotOrderByUpdatedAtDesc("Archived");
        }

        return locations.stream()
                .filter(m -> m.getLatitude() != null && m.getLongitude() != null)
                .map(m -> new MapLocationResponse(
                        m.getId(),
                        "marketing_location",
                        m.getLocationName(),
                        m.getLatitude(),
                        m.getLongitude(),
                        fullAddress(m.getAddress(), m.getCity(), m.getState(), m.getPin()),
                        m.getCity(),
                        m.getState(),
                        m.getStatus(),
                        m.getId(),
                        "ML-" + m.getId(),
                        m.getUpdatedAt(),
                        null,
                        null,
                        null,
                        m.getContactPerson(),
                        m.getPhone(),
                        null,
                        null,
                        null
                ))
                .toList();
    }

    @Transactional
    public MapLocationResponse createMarketingLocation(MarketingLocationRequest req) {
        MarketingLocation loc = new MarketingLocation();
        loc.setLocationName(req.locationName());
        loc.setAddress(req.address());
        loc.setCity(req.city());
        loc.setState(req.state());
        loc.setPin(req.pin());
        loc.setContactPerson(req.contactPerson());
        loc.setPhone(req.phone());
        loc.setMarketingVisitReference(req.marketingVisitReference());
        loc.setRemarks(req.remarks());
        loc.setLocationType(req.locationType() != null ? req.locationType() : "other");
        loc.setLatitude(req.latitude());
        loc.setLongitude(req.longitude());
        if (req.latitude() != null && req.longitude() != null) {
            loc.setGeocodedAt(LocalDateTime.now());
        }
        marketingLocationRepository.save(loc);
        return toResponse(loc);
    }

    @Transactional
    public MapLocationResponse updateMarketingLocation(Long id, MarketingLocationRequest req) {
        MarketingLocation loc = marketingLocationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Marketing location not found with id: " + id));
        loc.setLocationName(req.locationName());
        loc.setAddress(req.address());
        loc.setCity(req.city());
        loc.setState(req.state());
        loc.setPin(req.pin());
        loc.setContactPerson(req.contactPerson());
        loc.setPhone(req.phone());
        loc.setMarketingVisitReference(req.marketingVisitReference());
        loc.setRemarks(req.remarks());
        if (req.locationType() != null) loc.setLocationType(req.locationType());
        loc.setLatitude(req.latitude());
        loc.setLongitude(req.longitude());
        if (req.latitude() != null && req.longitude() != null) {
            loc.setGeocodedAt(LocalDateTime.now());
        }
        return toResponse(loc);
    }

    @Transactional
    public void deleteMarketingLocation(Long id) {
        MarketingLocation loc = marketingLocationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Marketing location not found with id: " + id));
        loc.setStatus("Archived");
    }

    @Transactional(readOnly = true)
    public MapLocationResponse getMarketingLocation(Long id) {
        return marketingLocationRepository.findById(id)
                .map(this::toResponse)
                .orElseThrow(() -> new ResourceNotFoundException("Marketing location not found with id: " + id));
    }

    private MapLocationResponse toResponse(MarketingLocation m) {
        return new MapLocationResponse(
                m.getId(),
                "marketing_location",
                m.getLocationName(),
                m.getLatitude(),
                m.getLongitude(),
                fullAddress(m.getAddress(), m.getCity(), m.getState(), m.getPin()),
                m.getCity(),
                m.getState(),
                m.getStatus(),
                m.getId(),
                "ML-" + m.getId(),
                m.getUpdatedAt(),
                null,
                null,
                null,
                m.getContactPerson(),
                m.getPhone(),
                null,
                null,
                null
        );
    }

    // ======================== Customers =====================================

    private List<MapLocationResponse> buildCustomerLocations(String search) {
        List<Customer> customers = customerRepository.findAll();
        return customers.stream()
                .filter(c -> c.getLatitude() != null && c.getLongitude() != null)
                .filter(c -> matchesSearch(search,
                        c.getBusinessName(), c.getBillingAddress(),
                        c.getBillingCity(), c.getBillingState()))
                .map(c -> new MapLocationResponse(
                        c.getId(),
                        "customer",
                        c.getBusinessName(),
                        c.getLatitude(),
                        c.getLongitude(),
                        fullAddress(c.getBillingAddress(), c.getBillingCity(), c.getBillingState(), c.getBillingPin()),
                        c.getBillingCity(),
                        c.getBillingState(),
                        c.getStatus(),
                        c.getId(),
                        c.getClientCode(),
                        c.getUpdatedAt(),
                        null, null, null,
                        c.getContactPerson(),
                        c.getPhone(),
                        c.getEmail(),
                        null, null
                ))
                .toList();
    }

    // ======================== Q Forms =======================================

    private List<MapLocationResponse> buildQFormLocations(String search) {
        List<QuestionnaireForm> forms = qFormRepository.findAll();
        return forms.stream()
                .filter(q -> !q.isDeleted())
                .filter(q -> q.getLatitude() != null && q.getLongitude() != null)
                .filter(q -> matchesSearch(search,
                        q.getPlantName(), q.getPlantLocation(),
                        null, null))
                .map(q -> {
                    String refNo = "QF-" + q.getId();
                    return new MapLocationResponse(
                            q.getId(),
                            "qform",
                            q.getPlantName(),
                            q.getLatitude(),
                            q.getLongitude(),
                            q.getPlantLocation(),
                            null,
                            null,
                            q.getStatus(),
                            q.getId(),
                            refNo,
                            q.getUpdatedAt(),
                            null,
                            q.getPlantName(),
                            q.getMarketer(),
                            null, null, null,
                            null,
                            q.getDateOfVisit() != null ? q.getDateOfVisit().toString() : null
                    );
                })
                .toList();
    }

    // ======================== Travel Plan Stops ==============================

    private List<MapLocationResponse> buildTravelPlanLocations(String search) {
        // A registry's stops are private to the marketer who owns the registry
        // (TravelPlanService enforces that per record), so the shared map only
        // pins the caller's own routes. ADMIN/MANAGER still see every registry;
        // anything else, including an unresolved caller, sees none.
        User caller = auditContext.currentUser();
        boolean everyTravelPlan = caller != null
                && (caller.getRole() == UserRole.ADMIN || caller.getRole() == UserRole.MANAGER);
        List<MarketingTravelPlan> plans = travelPlanRepository.findAll().stream()
                .filter(p -> !p.isDeleted())
                .filter(p -> everyTravelPlan
                        || (caller != null && caller.getId().equals(p.getMarketerUserId())))
                .toList();

        List<MapLocationResponse> results = new ArrayList<>();

        for (MarketingTravelPlan plan : plans) {
            List<MarketingTravelPlanStop> stops = stopRepository
                    .findByTravelPlanIdOrderBySequenceAscIdAsc(plan.getId());

            for (MarketingTravelPlanStop stop : stops) {
                if (stop.getLatitude() == null || stop.getLongitude() == null) continue;
                if ("Cancelled".equals(stop.getStatus())) continue;

                if (matchesSearch(search,
                        stop.getCompanyName(), stop.getAddress(),
                        stop.getCity(), stop.getState())) {
                    results.add(new MapLocationResponse(
                            stop.getId(),
                            "travel_stop",
                            stop.getCompanyName(),
                            stop.getLatitude(),
                            stop.getLongitude(),
                            fullAddress(stop.getAddress(), stop.getCity(), stop.getState(), null),
                            stop.getCity(),
                            stop.getState(),
                            stop.getStatus(),
                            plan.getId(),
                            planNo(plan),
                            stop.getUpdatedAt() != null ? stop.getUpdatedAt() : plan.getUpdatedAt(),
                            stop.getCustomerName(),
                            stop.getCompanyName(),
                            plan.getMarketer(),
                            stop.getContactPerson(),
                            stop.getContactPhone(),
                            stop.getContactEmail(),
                            stop.getSequence(),
                            stop.getPlannedDate() != null ? stop.getPlannedDate().toString() : null
                    ));
                }
            }
        }

        return results;
    }

    // ======================== Marketer Locations =============================

    private List<MapLocationResponse> buildMarketerLocations() {
        LocalDateTime since = LocalDateTime.now().minusHours(2);
        List<MarketingLocationTracking> recent = locationTrackingRepository.findRecentLocations(since);

        Map<Long, MarketingLocationTracking> latestPerPlan = recent.stream()
                .collect(Collectors.toMap(
                        MarketingLocationTracking::getTravelPlanId,
                        l -> l,
                        (a, b) -> a.getRecordedAt().isAfter(b.getRecordedAt()) ? a : b
                ));

        List<MapLocationResponse> results = new ArrayList<>();

        for (Map.Entry<Long, MarketingLocationTracking> entry : latestPerPlan.entrySet()) {
            MarketingLocationTracking loc = entry.getValue();
            String planNo = travelPlanRepository.findById(entry.getKey())
                    .map(this::planNo).orElse(null);

            results.add(new MapLocationResponse(
                    loc.getId(),
                    "marketer",
                    loc.getMarketerName(),
                    loc.getLatitude(),
                    loc.getLongitude(),
                    loc.getLocationLabel(),
                    null,
                    null,
                    computeMarketerStatus(loc.getRecordedAt()),
                    entry.getKey(),
                    planNo,
                    loc.getRecordedAt(),
                    null, null,
                    loc.getMarketerName(),
                    null, null, null,
                    null, null
            ));
        }

        return results;
    }

    // ======================== Helpers ========================================

    private String planNo(MarketingTravelPlan plan) {
        return "TP-" + plan.getId();
    }

    private String fullAddress(String address, String city, String state, String pin) {
        StringBuilder sb = new StringBuilder();
        if (address != null && !address.isBlank()) sb.append(address);
        if (city != null && !city.isBlank()) {
            if (!sb.isEmpty()) sb.append(", ");
            sb.append(city);
        }
        if (state != null && !state.isBlank()) {
            if (!sb.isEmpty()) sb.append(", ");
            sb.append(state);
        }
        if (pin != null && !pin.isBlank()) {
            if (!sb.isEmpty()) sb.append(" - ");
            sb.append(pin);
        }
        return sb.isEmpty() ? null : sb.toString();
    }

    private boolean matchesSearch(String search, String... fields) {
        if (search == null || search.isBlank()) return true;
        String lower = search.trim().toLowerCase();
        for (String field : fields) {
            if (field != null && field.toLowerCase().contains(lower)) return true;
        }
        return false;
    }

    private String computeMarketerStatus(LocalDateTime recordedAt) {
        if (recordedAt == null) return "Offline";
        long minutesAgo = java.time.Duration.between(recordedAt, LocalDateTime.now()).toMinutes();
        if (minutesAgo <= 5) return "Online";
        if (minutesAgo <= 120) return "Recent";
        return "Offline";
    }

    /**
     * Link a marketing location to an ERP Customer.
     */
    @Transactional
    public MapLocationResponse linkCustomer(Long locationId, java.util.Map<String, Object> body) {
        MarketingLocation loc = marketingLocationRepository.findById(locationId)
                .orElseThrow(() -> new ResourceNotFoundException("Marketing location not found with id: " + locationId));
        Long customerId = body.get("customerId") != null ? ((Number) body.get("customerId")).longValue() : null;
        String customerName = (String) body.getOrDefault("customerName", null);
        loc.setCustomerId(customerId);
        loc.setCustomerName(customerName);
        marketingLocationRepository.save(loc);
        return toResponse(loc);
    }

    /**
     * Get visit summary for any map entity type.
     * Accepts type parameter to look up the correct source entity.
     * Types: customer, qform, travel_stop, travel_planner, marketer, marketing_location
     */
    @Transactional(readOnly = true)
    public java.util.Map<String, Object> getLocationSummary(Long locationId, String type) {
        assertTravelStopAccessible(locationId, type);
        // Resolve location data from the correct entity table based on type
        String locationName = null;
        String address = null;
        String city = null;
        String phone = null;
        String locationType = type;
        String customerName = null;

        if ("customer".equals(type)) {
            var cust = customerRepository.findById(locationId);
            if (cust.isEmpty()) throw new ResourceNotFoundException("Map entity not found");
            var c = cust.get();
            locationName = c.getBusinessName();
            address = fullAddress(c.getBillingAddress(), c.getBillingCity(), c.getBillingState(), c.getBillingPin());
            city = c.getBillingCity();
            phone = c.getPhone();
            customerName = c.getBusinessName();
        } else if ("qform".equals(type)) {
            var qf = qFormRepository.findById(locationId);
            if (qf.isEmpty()) throw new ResourceNotFoundException("Map entity not found");
            var q = qf.get();
            locationName = q.getPlantName();
            address = q.getPlantLocation() != null ? q.getPlantLocation() : q.getLocationAddress();
            customerName = q.getPlantName();
        } else if ("travel_stop".equals(type)) {
            var stop = stopRepository.findById(locationId);
            if (stop.isEmpty()) throw new ResourceNotFoundException("Map entity not found");
            var s = stop.get();
            locationName = s.getCompanyName();
            address = fullAddress(s.getAddress(), s.getCity(), s.getState(), null);
            city = s.getCity();
            phone = s.getContactPhone();
            customerName = s.getCustomerName();
        } else if ("marketer".equals(type)) {
            var track = locationTrackingRepository.findById(locationId);
            if (track.isEmpty()) throw new ResourceNotFoundException("Map entity not found");
            var t = track.get();
            locationName = t.getMarketerName();
            address = t.getLocationLabel();
            customerName = t.getMarketerName();
        } else {
            // Default: marketing_location
            var ml = marketingLocationRepository.findById(locationId);
            if (ml.isEmpty()) throw new ResourceNotFoundException("Map entity not found");
            var m = ml.get();
            locationName = m.getLocationName();
            address = m.getAddress();
            city = m.getCity();
            phone = m.getPhone();
            locationType = m.getLocationType();
            customerName = m.getCustomerName();
        }

        java.util.Map<String, Object> summary = new java.util.HashMap<>();
        summary.put("locationId", locationId);
        summary.put("locationName", locationName);
        summary.put("address", address);
        summary.put("city", city);
        summary.put("phone", phone);
        summary.put("locationType", locationType);
        summary.put("customerName", customerName);

            // Find matching visits by company name or location
            String searchTerm = locationName;
            List<com.vishatech.erp.entity.MarketingVisit> visits = new java.util.ArrayList<>();
            if (searchTerm != null && !searchTerm.isBlank()) {
                visits = visitRepository.findAll().stream()
                    .filter(v -> !v.isDeleted())
                    .filter(v -> searchTerm.equalsIgnoreCase(v.getCompanyName())
                            || (v.getLocation() != null && searchTerm.equalsIgnoreCase(v.getLocation())))
                    .sorted(java.util.Comparator.comparing(
                        (com.vishatech.erp.entity.MarketingVisit v) -> v.getScheduleDate() != null ? v.getScheduleDate() : java.time.LocalDate.MIN,
                        java.util.Comparator.reverseOrder()))
                    .toList();
            }

            summary.put("totalVisits", visits.size());

            // Visit status breakdown
            long plannedCount = visits.stream().filter(v -> "Planned".equalsIgnoreCase(v.getVisitStatus()) || "Scheduled".equalsIgnoreCase(v.getVisitStatus())).count();
            long completedCount = visits.stream().filter(v -> "Completed".equalsIgnoreCase(v.getVisitStatus())).count();
            long cancelledCount = visits.stream().filter(v -> "Cancelled".equalsIgnoreCase(v.getVisitStatus())).count();
            summary.put("plannedVisits", plannedCount);
            summary.put("completedVisits", completedCount);
            summary.put("cancelledVisits", cancelledCount);

            // Assigned marketer from most recent visit
            String assignedTo = visits.isEmpty() ? null : visits.get(0).getMarketer();
            summary.put("assignedTo", assignedTo);

            // Last visit with full details
            if (!visits.isEmpty()) {
                com.vishatech.erp.entity.MarketingVisit lv = visits.get(0);
                java.util.Map<String, Object> lastVisitMap = new java.util.HashMap<>();
                lastVisitMap.put("id", lv.getId());
                lastVisitMap.put("visitNo", lv.getVisitNo() != null ? lv.getVisitNo() : String.format("VST-%05d", lv.getId()));
                lastVisitMap.put("companyName", lv.getCompanyName());
                lastVisitMap.put("location", lv.getLocation());
                lastVisitMap.put("contactPerson", lv.getContactPerson());
                lastVisitMap.put("meetingDesignation", lv.getMeetingDesignation());
                lastVisitMap.put("phone", lv.getPhone());
                lastVisitMap.put("scheduleDate", lv.getScheduleDate());
                lastVisitMap.put("visitStatus", lv.getVisitStatus());
                lastVisitMap.put("appointmentStatus", lv.getAppointmentStatus());
                lastVisitMap.put("marketer", lv.getMarketer());
                lastVisitMap.put("outcome", lv.getOutcome());
                lastVisitMap.put("qFormStatus", lv.getQFormStatus());
                lastVisitMap.put("nextAction", lv.getNextAction());
                lastVisitMap.put("followupDate", lv.getFollowupDate());
                lastVisitMap.put("leadNo", lv.getLeadNo());
                lastVisitMap.put("visitDescription", lv.getVisitDescription());
                summary.put("lastVisit", lastVisitMap);
            } else {
                summary.put("lastVisit", null);
            }

            // Upcoming visit
            com.vishatech.erp.entity.MarketingVisit upcoming = visits.stream()
                .filter(v -> v.getScheduleDate() != null && v.getScheduleDate().isAfter(java.time.LocalDate.now()))
                .findFirst().orElse(null);
            if (upcoming != null) {
                java.util.Map<String, Object> upMap = new java.util.HashMap<>();
                upMap.put("id", upcoming.getId());
                upMap.put("scheduleDate", upcoming.getScheduleDate());
                upMap.put("visitStatus", upcoming.getVisitStatus());
                upMap.put("appointmentStatus", upcoming.getAppointmentStatus());
                summary.put("upcomingVisit", upMap);
            } else {
                summary.put("upcomingVisit", null);
            }

            // Recent visits (last 5)
            java.util.List<java.util.Map<String, Object>> recentVisits = new java.util.ArrayList<>();
            for (com.vishatech.erp.entity.MarketingVisit v : visits.stream().limit(5).toList()) {
                java.util.Map<String, Object> rv = new java.util.HashMap<>();
                rv.put("id", v.getId());
                rv.put("visitNo", v.getVisitNo() != null ? v.getVisitNo() : String.format("VST-%05d", v.getId()));
                rv.put("companyName", v.getCompanyName());
                rv.put("contactPerson", v.getContactPerson());
                rv.put("scheduleDate", v.getScheduleDate());
                rv.put("visitStatus", v.getVisitStatus());
                rv.put("appointmentStatus", v.getAppointmentStatus());
                rv.put("marketer", v.getMarketer());
                rv.put("outcome", v.getOutcome());
                rv.put("qFormStatus", v.getQFormStatus());
                rv.put("nextAction", v.getNextAction());
                rv.put("followupDate", v.getFollowupDate());
                recentVisits.add(rv);
            }
            summary.put("recentVisits", recentVisits);

            // Expense totals
            java.util.Set<Long> visitIds = visits.stream()
                .map(com.vishatech.erp.entity.MarketingVisit::getId)
                .collect(java.util.stream.Collectors.toSet());
            java.math.BigDecimal totalExpenses = java.math.BigDecimal.ZERO;
            java.math.BigDecimal withBillTotal = java.math.BigDecimal.ZERO;
            java.math.BigDecimal withoutBillTotal = java.math.BigDecimal.ZERO;
            int expenseTripCount = 0;
            try {
                var allTrips = expenseTripRepository.findAll().stream()
                    .filter(e -> {
                        if (e.getVisitId() != null && visitIds.contains(e.getVisitId())) return true;
                        if (e.getVisitRef() != null && !e.getVisitRef().isBlank()) {
                            try {
                                if (visitIds.contains(Long.parseLong(e.getVisitRef()))) return true;
                            } catch (NumberFormatException ignored) {}
                        }
                        if (searchTerm.equalsIgnoreCase(e.getDestination())) return true;
                        if (searchTerm.equalsIgnoreCase(e.getStartLocation())) return true;
                        return false;
                    })
                    .toList();
                expenseTripCount = allTrips.size();
                for (var trip : allTrips) {
                    if (trip.getTotalAmount() != null) totalExpenses = totalExpenses.add(trip.getTotalAmount());
                    if (trip.getWithBillTotal() != null) withBillTotal = withBillTotal.add(trip.getWithBillTotal());
                    if (trip.getWithoutBillTotal() != null) withoutBillTotal = withoutBillTotal.add(trip.getWithoutBillTotal());
                }
            } catch (Exception ignored) {}
            summary.put("totalExpenses", totalExpenses);
            summary.put("withBillTotal", withBillTotal);
            summary.put("withoutBillTotal", withoutBillTotal);
            summary.put("expenseTripCount", expenseTripCount);

            return summary;
        }

    /**
     * Returns photo attachments associated with a specific entity (location).
     * Uses the unified sales_attachments table with moduleType=type for ALL entity types,
     * so photos uploaded from the map panel are always found regardless of entity type.
     */
    public java.util.List<java.util.Map<String, Object>> getEntityPhotos(Long locationId, String type) {
        assertTravelStopAccessible(locationId, type);
        java.util.List<java.util.Map<String, Object>> photos = new java.util.ArrayList<>();

        String moduleType = type != null ? type : "marketing_location";

        var attachments = salesAttachmentRepository.findByModuleTypeAndModuleIdOrderByUploadedAtAsc(moduleType, locationId);
        for (var att : attachments) {
            if (att.getStoredName() != null && isImage(att.getContentType(), att.getName())) {
                java.util.Map<String, Object> photo = new java.util.HashMap<>();
                photo.put("id", att.getId());
                photo.put("uri", "/files/" + att.getStoredName());
                photo.put("caption", att.getName());
                photo.put("source", moduleType);
                photo.put("sourceId", locationId);
                photos.add(photo);
            }
        }

        return photos;
    }

    /**
     * Upload a photo attachment for any map entity.
     * Uses SalesAttachment with moduleType=type so photos are stored per entity type.
     */
    @org.springframework.transaction.annotation.Transactional
    public java.util.Map<String, Object> uploadLocationPhoto(Long locationId, org.springframework.web.multipart.MultipartFile file, String type) {
        assertTravelStopAccessible(locationId, type);
        String storedName = fileStorageService.store(file);
        SalesAttachment att = new SalesAttachment();
        String moduleType = type != null ? type : "marketing_location";
        att.setModuleType(moduleType);
        att.setModuleId(locationId);
        att.setName(file.getOriginalFilename());
        att.setStoredName(storedName);
        att.setContentType(file.getContentType());
        att.setSize(file.getSize());
        att.setUrl("/files/" + storedName);
        salesAttachmentRepository.save(att);

        java.util.Map<String, Object> result = new java.util.HashMap<>();
        result.put("id", att.getId());
        result.put("uri", att.getUrl());
        result.put("caption", att.getName());
        result.put("source", moduleType);
        result.put("sourceId", locationId);
        return result;
    }

    /**
     * Delete a photo attachment for any map entity type.
     */
    @org.springframework.transaction.annotation.Transactional
    public void deleteLocationPhoto(Long locationId, Long attachmentId, String type) {
        assertTravelStopAccessible(locationId, type);
        var att = salesAttachmentRepository.findById(attachmentId);
        String moduleType = type != null ? type : "marketing_location";
        if (att.isEmpty() || !moduleType.equals(att.get().getModuleType())
                || !locationId.equals(att.get().getModuleId())) {
            throw new ResourceNotFoundException("Photo attachment not found with id: " + attachmentId);
        }
        salesAttachmentRepository.deleteById(attachmentId);
    }

    /**
     * A travel stop belongs to a private registry (TravelPlanService enforces that
     * per registry), so its map detail panels - summary, about, photos, updates and
     * photo upload/delete - follow the registry's own rule: the plan's marketer, or
     * an ADMIN/MANAGER. Without this, a stop id guessed from the map would expose a
     * coworker's registry data. Any other {@code type} keeps its existing behaviour.
     */
    private void assertTravelStopAccessible(Long locationId, String type) {
        if (!"travel_stop".equals(type) && !"travel_planner".equals(type)) return;
        MarketingTravelPlanStop stop = stopRepository.findById(locationId)
                .orElseThrow(() -> new ResourceNotFoundException("Map entity not found"));
        User caller = auditContext.currentUser();
        if (caller == null) throw new AccessDeniedException("Authentication required");
        if (caller.getRole() == UserRole.ADMIN || caller.getRole() == UserRole.MANAGER) return;
        boolean owns = travelPlanRepository.findById(stop.getTravelPlanId())
                .map(plan -> caller.getId().equals(plan.getMarketerUserId()))
                .orElse(false);
        if (!owns) {
            throw new AccessDeniedException("You can only access your own travel plans");
        }
    }

    private boolean isImage(String contentType, String name) {
        if (contentType != null && contentType.startsWith("image/")) return true;
        if (name != null && name.matches("(?i).*\\.(jpg|jpeg|png|gif|webp|bmp)$")) return true;
        return false;
    }

    // ======================== Updates / Activity History ========================

    /**
     * Returns activity/update history for a specific map entity.
     * For marketing_location and customer, finds matching visits and their
     * follow-up activities.
     */
    public java.util.List<java.util.Map<String, Object>> getEntityUpdates(Long locationId, String type) {
        assertTravelStopAccessible(locationId, type);
        java.util.List<java.util.Map<String, Object>> updates = new java.util.ArrayList<>();
        String searchTerm = resolveLocationName(locationId, type);
        if (searchTerm == null || searchTerm.isBlank()) return updates;

        // Find matching visits for this entity
        List<com.vishatech.erp.entity.MarketingVisit> visits = findVisitsForEntity(locationId, type, searchTerm);

        // Get visit activities (follow-ups, extensions) for those visits
        for (var visit : visits) {
            var activities = activityRepository.findByVisitIdOrderByActivityDateAscIdAsc(visit.getId());
            for (var act : activities) {
                java.util.Map<String, Object> update = new java.util.HashMap<>();
                update.put("id", act.getId());
                update.put("visitId", act.getVisitId());
                update.put("activityType", act.getActivityType());
                update.put("date", act.getActivityDate());
                update.put("time", act.getActivityTime());
                update.put("companyName", act.getCompanyName());
                update.put("contactName", act.getContactName());
                update.put("followupType", act.getFollowupType());
                update.put("discussion", act.getDiscussion());
                update.put("customerResponse", act.getCustomerResponse());
                update.put("status", act.getStatus());
                update.put("outcome", act.getOutcome());
                update.put("nextAction", act.getNextAction());
                update.put("nextFollowupDate", act.getNextFollowupDate());
                update.put("assignedEmployee", act.getAssignedEmployee());
                update.put("remarks", act.getRemarks());
                update.put("createdBy", act.getCreatedBy());
                update.put("createdAt", act.getCreatedAt());
                updates.add(update);
            }

            // Also add the visit itself as an update entry
            java.util.Map<String, Object> visitUpdate = new java.util.HashMap<>();
            visitUpdate.put("id", visit.getId());
            visitUpdate.put("type", "visit");
            visitUpdate.put("date", visit.getScheduleDate());
            visitUpdate.put("companyName", visit.getCompanyName());
            visitUpdate.put("visitStatus", visit.getVisitStatus());
            visitUpdate.put("outcome", visit.getOutcome());
            visitUpdate.put("marketer", visit.getMarketer());
            visitUpdate.put("visitDescription", visit.getVisitDescription());
            visitUpdate.put("discussion", visit.getDiscussion());
            visitUpdate.put("remarks", visit.getRemarks());
            visitUpdate.put("createdAt", visit.getCreatedAt());
            visitUpdate.put("visitNo", visit.getVisitNo() != null ? visit.getVisitNo() : String.format("VST-%05d", visit.getId()));
            updates.add(visitUpdate);
        }

        // Sort by date descending (most recent first)
        updates.sort((a, b) -> {
            java.time.temporal.TemporalAccessor dateA = (java.time.temporal.TemporalAccessor) (a.get("date") != null ? a.get("date") : a.get("createdAt"));
            java.time.temporal.TemporalAccessor dateB = (java.time.temporal.TemporalAccessor) (b.get("date") != null ? b.get("date") : b.get("createdAt"));
            if (dateA == null && dateB == null) return 0;
            if (dateA == null) return 1;
            if (dateB == null) return -1;
            return java.time.LocalDateTime.from(dateB).compareTo(java.time.LocalDateTime.from(dateA));
        });

        return updates;
    }

    // ======================== About / Full Location Info ========================

    /**
     * Returns comprehensive location information for the About tab.
     */
    @Transactional(readOnly = true)
    public java.util.Map<String, Object> getEntityAbout(Long locationId, String type) {
        assertTravelStopAccessible(locationId, type);
        java.util.Map<String, Object> about = new java.util.HashMap<>();
        about.put("locationId", locationId);
        about.put("type", type);

        if ("customer".equals(type)) {
            var cust = customerRepository.findById(locationId);
            if (cust.isEmpty()) throw new ResourceNotFoundException("Map entity not found");
            var c = cust.get();
            about.put("name", c.getBusinessName());
            about.put("address", fullAddress(c.getBillingAddress(), c.getBillingCity(), c.getBillingState(), c.getBillingPin()));
            about.put("city", c.getBillingCity());
            about.put("state", c.getBillingState());
            about.put("pincode", c.getBillingPin());
            about.put("phone", c.getPhone());
            about.put("email", c.getEmail());
            about.put("contactPerson", c.getContactPerson());
            about.put("status", c.getStatus());
            about.put("latitude", c.getLatitude());
            about.put("longitude", c.getLongitude());
            about.put("clientCode", c.getClientCode());
            about.put("createdAt", c.getCreatedAt());
            about.put("updatedAt", c.getUpdatedAt());
            about.put("typeLabel", "Customer");
        } else if ("qform".equals(type)) {
            var qf = qFormRepository.findById(locationId);
            if (qf.isEmpty()) throw new ResourceNotFoundException("Map entity not found");
            var q = qf.get();
            about.put("name", q.getPlantName());
            about.put("address", q.getPlantLocation() != null ? q.getPlantLocation() : q.getLocationAddress());
            about.put("latitude", q.getLatitude());
            about.put("longitude", q.getLongitude());
            about.put("status", q.getStatus());
            about.put("marketer", q.getMarketer());
            about.put("dateOfVisit", q.getDateOfVisit());
            about.put("createdAt", q.getCreatedAt());
            about.put("updatedAt", q.getUpdatedAt());
            about.put("typeLabel", "Q Form Location");
        } else if ("travel_stop".equals(type)) {
            var stop = stopRepository.findById(locationId);
            if (stop.isEmpty()) throw new ResourceNotFoundException("Map entity not found");
            var s = stop.get();
            about.put("name", s.getCompanyName());
            about.put("address", fullAddress(s.getAddress(), s.getCity(), s.getState(), null));
            about.put("city", s.getCity());
            about.put("state", s.getState());
            about.put("phone", s.getContactPhone());
            about.put("email", s.getContactEmail());
            about.put("contactPerson", s.getContactPerson());
            about.put("customerName", s.getCustomerName());
            about.put("status", s.getStatus());
            about.put("latitude", s.getLatitude());
            about.put("longitude", s.getLongitude());
            about.put("sequence", s.getSequence());
            about.put("plannedDate", s.getPlannedDate());
            about.put("createdAt", s.getCreatedAt());
            about.put("updatedAt", s.getUpdatedAt());
            about.put("typeLabel", "Travel Stop");
        } else if ("marketer".equals(type)) {
            var track = locationTrackingRepository.findById(locationId);
            if (track.isEmpty()) throw new ResourceNotFoundException("Map entity not found");
            var t = track.get();
            about.put("name", t.getMarketerName());
            about.put("address", t.getLocationLabel());
            about.put("latitude", t.getLatitude());
            about.put("longitude", t.getLongitude());
            about.put("recordedAt", t.getRecordedAt());
            about.put("typeLabel", "Marketer Location");
        } else {
            // marketing_location
            var ml = marketingLocationRepository.findById(locationId);
            if (ml.isEmpty()) throw new ResourceNotFoundException("Map entity not found");
            var m = ml.get();
            about.put("name", m.getLocationName());
            about.put("address", m.getAddress());
            about.put("city", m.getCity());
            about.put("state", m.getState());
            about.put("pincode", m.getPin());
            about.put("phone", m.getPhone());
            about.put("contactPerson", m.getContactPerson());
            about.put("status", m.getStatus());
            about.put("latitude", m.getLatitude());
            about.put("longitude", m.getLongitude());
            about.put("locationType", m.getLocationType());
            about.put("customerName", m.getCustomerName());
            about.put("customerId", m.getCustomerId());
            about.put("remarks", m.getRemarks());
            about.put("marketingVisitReference", m.getMarketingVisitReference());
            about.put("createdAt", m.getCreatedAt());
            about.put("updatedAt", m.getUpdatedAt());
            about.put("typeLabel", "Marketing Location");
        }

        return about;
    }

    // ======================== Helper: Resolve location name for matching ==========

    private String resolveLocationName(Long locationId, String type) {
        if ("customer".equals(type)) {
            return customerRepository.findById(locationId).map(Customer::getBusinessName).orElse(null);
        } else if ("qform".equals(type)) {
            return qFormRepository.findById(locationId).map(QuestionnaireForm::getPlantName).orElse(null);
        } else if ("travel_stop".equals(type)) {
            return stopRepository.findById(locationId).map(MarketingTravelPlanStop::getCompanyName).orElse(null);
        } else if ("marketer".equals(type)) {
            return locationTrackingRepository.findById(locationId).map(MarketingLocationTracking::getMarketerName).orElse(null);
        } else {
            return marketingLocationRepository.findById(locationId).map(MarketingLocation::getLocationName).orElse(null);
        }
    }

    // ======================== Helper: Find visits for entity ===================

    private List<com.vishatech.erp.entity.MarketingVisit> findVisitsForEntity(Long locationId, String type, String searchTerm) {
        // For customers, we can match by customerId for exact linkage
        if ("customer".equals(type)) {
            Long customerId = customerRepository.findById(locationId).map(Customer::getId).orElse(null);
            if (customerId != null) {
                return visitRepository.findAll().stream()
                        .filter(v -> !v.isDeleted())
                        .filter(v -> customerId.equals(v.getCustomerId())
                                || (searchTerm != null && searchTerm.equalsIgnoreCase(v.getCompanyName()))
                                || (searchTerm != null && v.getLocation() != null && searchTerm.equalsIgnoreCase(v.getLocation())))
                        .sorted(java.util.Comparator.comparing(
                                (com.vishatech.erp.entity.MarketingVisit v) -> v.getScheduleDate() != null ? v.getScheduleDate() : java.time.LocalDate.MIN,
                                java.util.Comparator.reverseOrder()))
                        .toList();
            }
        }

        // For all other types, match by company name and location
        if (searchTerm != null && !searchTerm.isBlank()) {
            return visitRepository.findAll().stream()
                    .filter(v -> !v.isDeleted())
                    .filter(v -> searchTerm.equalsIgnoreCase(v.getCompanyName())
                            || (v.getLocation() != null && searchTerm.equalsIgnoreCase(v.getLocation())))
                    .sorted(java.util.Comparator.comparing(
                            (com.vishatech.erp.entity.MarketingVisit v) -> v.getScheduleDate() != null ? v.getScheduleDate() : java.time.LocalDate.MIN,
                            java.util.Comparator.reverseOrder()))
                    .toList();
        }
        return new java.util.ArrayList<>();
    }
}
