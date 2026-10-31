package com.vishatech.erp.service;

import com.vishatech.erp.dto.LocationTrackingRequest;
import com.vishatech.erp.dto.LocationTrackingResponse;
import com.vishatech.erp.entity.MarketingLocationTracking;
import com.vishatech.erp.entity.MarketingTravelPlan;
import com.vishatech.erp.entity.MarketingTravelPlanStop;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.MarketingLocationTrackingRepository;
import com.vishatech.erp.repository.MarketingTravelPlanRepository;
import com.vishatech.erp.repository.MarketingTravelPlanStopRepository;
import com.vishatech.erp.util.AuditContext;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class MarketingLocationTrackingService {

    private final MarketingLocationTrackingRepository locationRepository;
    private final MarketingTravelPlanRepository travelPlanRepository;
    private final MarketingTravelPlanStopRepository stopRepository;
    private final AuditContext auditContext;

    public MarketingLocationTrackingService(
            MarketingLocationTrackingRepository locationRepository,
            MarketingTravelPlanRepository travelPlanRepository,
            MarketingTravelPlanStopRepository stopRepository,
            AuditContext auditContext) {
        this.locationRepository = locationRepository;
        this.travelPlanRepository = travelPlanRepository;
        this.stopRepository = stopRepository;
        this.auditContext = auditContext;
    }

    /**
     * Submit a GPS location update for an active trip.
     * Only allowed when the travel plan is in Active status.
     */
    public LocationTrackingResponse submitLocation(LocationTrackingRequest request) {
        User user = requireUser();
        MarketingTravelPlan plan = travelPlanRepository.findById(request.travelPlanId())
                .orElseThrow(() -> new BadRequestException("Travel plan not found"));

        if (!"Active".equals(plan.getStatus())) {
            throw new BadRequestException("Location tracking is only available for active trips");
        }

        MarketingLocationTracking entry = new MarketingLocationTracking();
        entry.setTravelPlanId(plan.getId());
        entry.setUserId(user.getId());
        entry.setMarketerName(user.getFullName() != null ? user.getFullName() : user.getEmail());
        entry.setLatitude(request.latitude());
        entry.setLongitude(request.longitude());
        entry.setAccuracy(request.accuracy());
        entry.setSpeed(request.speed());
        entry.setHeading(request.heading());
        entry.setCurrentStopId(request.currentStopId());
        entry.setLocationLabel(request.locationLabel());
        entry.setBatteryLevel(request.batteryLevel());
        entry.setRecordedAt(request.recordedAt() != null ? request.recordedAt() : LocalDateTime.now());

        MarketingLocationTracking saved = locationRepository.save(entry);
        return toResponse(saved);
    }

    /**
     * Get the latest location for each active trip.
     * Used by the Marketing Map to show current marketer positions.
     */
    @Transactional(readOnly = true)
    public List<LocationTrackingResponse> getActiveLocations() {
        // Only return locations from the last 2 hours
        LocalDateTime since = LocalDateTime.now().minusHours(2);
        List<MarketingLocationTracking> recent = locationRepository.findRecentLocations(since);

        // Group by travel plan and keep only the latest per plan
        return recent.stream()
                .collect(Collectors.groupingBy(
                        MarketingLocationTracking::getTravelPlanId,
                        Collectors.collectingAndThen(
                                Collectors.toList(),
                                list -> list.stream()
                                        .max((a, b) -> a.getRecordedAt().compareTo(b.getRecordedAt()))
                                        .orElse(null)
                        )
                ))
                .values()
                .stream()
                .filter(loc -> loc != null)
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    /**
     * Get the latest location for a specific travel plan.
     */
    @Transactional(readOnly = true)
    public LocationTrackingResponse getLatestLocation(Long travelPlanId) {
        MarketingLocationTracking loc = locationRepository
                .findFirstByTravelPlanIdOrderByRecordedAtDesc(travelPlanId)
                .orElse(null);
        return loc != null ? toResponse(loc) : null;
    }

    /**
     * Get location history for a travel plan (for route trail).
     */
    @Transactional(readOnly = true)
    public List<LocationTrackingResponse> getLocationHistory(Long travelPlanId) {
        return locationRepository.findByTravelPlanIdOrderByRecordedAtAsc(travelPlanId)
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    private LocationTrackingResponse toResponse(MarketingLocationTracking loc) {
        long ageSeconds = java.time.Duration.between(loc.getRecordedAt(), LocalDateTime.now()).getSeconds();

        // Resolve current stop name
        String stopName = null;
        if (loc.getCurrentStopId() != null) {
            stopName = stopRepository.findById(loc.getCurrentStopId())
                    .map(MarketingTravelPlanStop::getCompanyName)
                    .orElse(null);
        }

        // Resolve plan number
        String planNo = travelPlanRepository.findById(loc.getTravelPlanId())
                .map(p -> "TP-" + p.getId())
                .orElse(null);

        return new LocationTrackingResponse(
                loc.getId(), loc.getTravelPlanId(), planNo,
                loc.getUserId(), loc.getMarketerName(),
                loc.getLatitude(), loc.getLongitude(),
                loc.getAccuracy(), loc.getSpeed(), loc.getHeading(),
                loc.getCurrentStopId(), stopName,
                loc.getLocationLabel(), loc.getBatteryLevel(),
                loc.getRecordedAt(), loc.getReceivedAt(),
                ageSeconds
        );
    }

    private User requireUser() {
        User user = auditContext.currentUser();
        if (user == null) throw new AccessDeniedException("Authentication required");
        return user;
    }
}
