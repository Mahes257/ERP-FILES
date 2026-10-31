package com.vishatech.erp.service;

import com.vishatech.erp.crm.dto.CustomerResponse;
import com.vishatech.erp.crm.service.CustomerService;
import com.vishatech.erp.dto.TravelScheduleListResponse;
import com.vishatech.erp.dto.TravelScheduleRequest;
import com.vishatech.erp.dto.TravelScheduleResponse;
import com.vishatech.erp.entity.MarketingTravelSchedule;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.MarketingTravelScheduleRepository;
import com.vishatech.erp.repository.UserRepository;
import com.vishatech.erp.sales.api.AttachmentStorePort;
import com.vishatech.erp.util.AuditContext;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.Year;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
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
 * Marketing Travel Scheduler service — the schedule lifecycle behind
 * {@code /marketing/travel-schedules}.
 *
 * <p><b>Approval.</b> The scheduler does not invent a policy: it reuses the
 * mechanism the Travel Registry already runs in this module — a new record is
 * always created as {@code Draft}, and only {@link #submit}, {@link #approve},
 * {@link #reject} and {@link #requestRevision} move {@code status} /
 * {@code approvalStatus}, with the same allowed transitions and the same
 * approver stamp ({@code approvedBy}/{@code approvedAt} from the authenticated
 * principal). No request field can set a status, so a schedule can never be
 * approved by editing the form or by creating it pre-approved.
 *
 * <p><b>Ownership.</b> ADMIN and MANAGER see every schedule; everyone else sees
 * the schedules assigned to them or requested by them — the registry's
 * owner-scoping rule extended by the requester, because a schedule is by design
 * raised for another employee.
 *
 * <p><b>Attachments.</b> Supporting documents use the ERP-wide attachment store
 * (the same table and port the Travel Registry uses) under module type
 * {@value #ATTACHMENT_MODULE}.
 *
 * <p><b>Numbering.</b> {@code TS-YYYY-NNNN}, derived from the row id and the
 * creation year — the registry's {@code TP-YYYY-NNNN} convention, with no
 * counter to drift.
 */
@Service
@Transactional
public class TravelScheduleService {

    /** Lifecycle states a schedule can hold — the registry's vocabulary. */
    public static final List<String> STATUSES =
            List.of("Draft", "Submitted", "Approved", "Rejected", "Revision Required",
                    "Completed", "Cancelled");

    public static final List<String> PRIORITIES = List.of("Normal", "High", "Urgent");

    public static final List<String> TRAVEL_MODES = List.of("Car", "Train", "Flight", "Other");

    /** Module type every Travel Schedule attachment row carries. */
    public static final String ATTACHMENT_MODULE = "MARKETING_TRAVEL_SCHEDULE";

    /** 24-hour clock, with optional seconds — the format the forms send. */
    private static final Pattern TIME_PATTERN = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$");

    private final MarketingTravelScheduleRepository scheduleRepository;
    private final UserRepository userRepository;
    private final CustomerService customerService;
    private final AttachmentStorePort attachmentStore;
    private final AuditContext auditContext;

    public TravelScheduleService(MarketingTravelScheduleRepository scheduleRepository,
                                 UserRepository userRepository,
                                 CustomerService customerService,
                                 AttachmentStorePort attachmentStore,
                                 AuditContext auditContext) {
        this.scheduleRepository = scheduleRepository;
        this.userRepository = userRepository;
        this.customerService = customerService;
        this.attachmentStore = attachmentStore;
        this.auditContext = auditContext;
    }

    /** One assignable employee: the user-master id plus its display name. */
    public record EmployeeOption(Long id, String name) {}

    /**
     * Options the scheduler form renders — one source of truth, none of it
     * client-supplied.
     *
     * <p>{@code employees} resolves the assignment picker from the user master
     * here rather than sending the form to {@code GET /users}, which is gated on
     * {@code SETTINGS_MANAGE} and therefore unreachable for a marketing user who
     * is otherwise allowed to raise a schedule for a colleague.
     */
    public record ScheduleOptions(List<String> purposes,
                                  List<String> priorities,
                                  List<String> travelModes,
                                  List<EmployeeOption> employees) {}

    @Transactional(readOnly = true)
    public ScheduleOptions getOptions() {
        List<EmployeeOption> employees = userRepository.findAll(Sort.by("fullName")).stream()
                .filter(User::isEnabled)
                .map(user -> new EmployeeOption(user.getId(), displayName(user)))
                .toList();
        return new ScheduleOptions(TravelPlanService.PURPOSES, PRIORITIES, TRAVEL_MODES, employees);
    }

    // ============================== CRUD ====================================

    @Transactional
    public TravelScheduleResponse create(TravelScheduleRequest request) {
        User requester = requireUser();
        MarketingTravelSchedule schedule = new MarketingTravelSchedule();
        schedule.setStatus("Draft");
        schedule.setRequestedBy(displayName(requester));
        schedule.setRequestedByUserId(requester.getId());
        schedule.setPriority("Normal");
        applyFields(schedule, request);
        validate(schedule, true);
        MarketingTravelSchedule saved = scheduleRepository.save(schedule);
        return toResponse(saved);
    }

    public TravelScheduleResponse get(Long id) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        return toResponse(schedule);
    }

    public Page<TravelScheduleListResponse> list(int page, int size, String search, String sort,
                                                 String status, Long assignedUserId,
                                                 String dateFrom, String dateTo, String destination) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));

        Specification<MarketingTravelSchedule> spec =
                buildSpecification(search, status, assignedUserId, dateFrom, dateTo, destination)
                        .and(scopeSpecification());

        return scheduleRepository.findAll(spec, pageable).map(this::toListResponse);
    }

    @Transactional
    public TravelScheduleResponse update(Long id, TravelScheduleRequest request) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        if ("Approved".equals(schedule.getStatus()) || "Completed".equals(schedule.getStatus())
                || "Cancelled".equals(schedule.getStatus())) {
            throw new BadRequestException("Cannot edit a " + schedule.getStatus().toLowerCase() + " schedule");
        }
        applyFields(schedule, request);
        validate(schedule, false);
        return toResponse(scheduleRepository.save(schedule));
    }

    @Transactional
    public void delete(Long id) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        if (!"Draft".equals(schedule.getStatus())) {
            throw new BadRequestException("Only draft schedules can be deleted");
        }
        // The schedule's attachment rows go with it, so a deleted draft leaves
        // neither rows nor storage-ledger entries pointing at a gone record.
        attachmentStore.list(ATTACHMENT_MODULE, schedule.getId())
                .forEach(ref -> attachmentStore.delete(ATTACHMENT_MODULE, schedule.getId(), ref.id()));
        scheduleRepository.delete(schedule);
    }

    // ============================== Approval ================================

    @Transactional
    public TravelScheduleResponse submit(Long id) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        if (!"Draft".equals(schedule.getStatus()) && !"Revision Required".equals(schedule.getStatus())) {
            throw new BadRequestException("Only draft or revision-required schedules can be submitted");
        }
        schedule.setStatus("Submitted");
        schedule.setApprovalStatus("Pending");
        return toResponse(scheduleRepository.save(schedule));
    }

    @Transactional
    public TravelScheduleResponse approve(Long id) {
        MarketingTravelSchedule schedule = findSchedule(id);
        // The workflow runs on ONE record, so it obeys the record rule first:
        // only the requester/assignee, or an ADMIN/MANAGER, may move a schedule
        // through approval. Without this an outsider could approve or reject a
        // schedule it is not even allowed to read.
        assertCanAccess(schedule);
        User approver = requireUser();
        if (!"Submitted".equals(schedule.getStatus())) {
            throw new BadRequestException("Only submitted schedules can be approved");
        }
        schedule.setStatus("Approved");
        schedule.setApprovalStatus("Approved");
        schedule.setApprovedBy(displayName(approver));
        schedule.setApprovedAt(LocalDateTime.now());
        return toResponse(scheduleRepository.save(schedule));
    }

    @Transactional
    public TravelScheduleResponse reject(Long id, TravelScheduleRequest request) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        User approver = requireUser();
        if (!"Submitted".equals(schedule.getStatus())) {
            throw new BadRequestException("Only submitted schedules can be rejected");
        }
        String reason = request == null ? null : request.rejectionReason();
        if (reason == null || reason.isBlank()) {
            throw new BadRequestException("Rejection reason is required");
        }
        schedule.setStatus("Rejected");
        schedule.setApprovalStatus("Rejected");
        schedule.setApprovedBy(displayName(approver));
        schedule.setApprovedAt(LocalDateTime.now());
        schedule.setRejectionReason(reason.trim());
        return toResponse(scheduleRepository.save(schedule));
    }

    @Transactional
    public TravelScheduleResponse requestRevision(Long id, TravelScheduleRequest request) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        User approver = requireUser();
        if (!"Submitted".equals(schedule.getStatus())) {
            throw new BadRequestException("Only submitted schedules can be sent for revision");
        }
        String comments = request == null ? null : request.revisionComments();
        if (comments == null || comments.isBlank()) {
            throw new BadRequestException("Revision comments are required");
        }
        schedule.setStatus("Revision Required");
        schedule.setApprovalStatus("Revision Required");
        schedule.setApprovedBy(displayName(approver));
        schedule.setApprovedAt(LocalDateTime.now());
        schedule.setRevisionComments(comments.trim());
        return toResponse(scheduleRepository.save(schedule));
    }

    @Transactional
    public TravelScheduleResponse complete(Long id) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        if (!"Approved".equals(schedule.getStatus())) {
            throw new BadRequestException("Only approved schedules can be completed");
        }
        schedule.setStatus("Completed");
        return toResponse(scheduleRepository.save(schedule));
    }

    @Transactional
    public TravelScheduleResponse cancel(Long id, String reason) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        if ("Cancelled".equals(schedule.getStatus()) || "Completed".equals(schedule.getStatus())) {
            throw new BadRequestException("A " + schedule.getStatus().toLowerCase() + " schedule cannot be cancelled");
        }
        if (reason == null || reason.isBlank()) {
            throw new BadRequestException("Cancellation reason is required");
        }
        schedule.setStatus("Cancelled");
        schedule.setCancelledBy(displayName(requireUser()));
        schedule.setCancelledAt(LocalDateTime.now());
        schedule.setCancellationReason(reason.trim());
        return toResponse(scheduleRepository.save(schedule));
    }

    // ============================== Attachments ==============================

    @Transactional(readOnly = true)
    public List<AttachmentStorePort.AttachmentRef> getAttachments(Long id) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        return attachmentStore.list(ATTACHMENT_MODULE, schedule.getId());
    }

    @Transactional
    public AttachmentStorePort.AttachmentRef addAttachment(Long id, MultipartFile file) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        return attachmentStore.add(ATTACHMENT_MODULE, schedule.getId(), file);
    }

    @Transactional
    public void deleteAttachment(Long id, Long attachmentId) {
        MarketingTravelSchedule schedule = findSchedule(id);
        assertCanAccess(schedule);
        attachmentStore.delete(ATTACHMENT_MODULE, schedule.getId(), attachmentId);
    }

    // ============================== Field application =======================

    private void applyFields(MarketingTravelSchedule schedule, TravelScheduleRequest request) {
        if (request == null) return;
        if (request.scheduleTitle() != null) schedule.setScheduleTitle(request.scheduleTitle().trim());
        if (request.assignedUserId() != null) applyAssignee(schedule, request.assignedUserId());
        if (request.purpose() != null) schedule.setPurpose(request.purpose().trim());
        if (request.priority() != null) schedule.setPriority(request.priority().trim());
        if (request.startDate() != null) schedule.setStartDate(request.startDate());
        if (request.startTime() != null) schedule.setStartTime(request.startTime().trim());
        if (request.endDate() != null) schedule.setEndDate(request.endDate());
        if (request.endTime() != null) schedule.setEndTime(request.endTime().trim());
        if (request.startingLocation() != null) schedule.setStartingLocation(request.startingLocation().trim());
        if (request.endingLocation() != null) schedule.setEndingLocation(request.endingLocation().trim());
        if (request.travelMode() != null) schedule.setTravelMode(request.travelMode().trim());
        if (request.estimatedDistanceKm() != null) schedule.setEstimatedDistanceKm(request.estimatedDistanceKm());
        if (request.customerId() != null) applyCustomer(schedule, request.customerId());
        if (request.meetingDetails() != null) schedule.setMeetingDetails(request.meetingDetails());
        if (request.contactPerson() != null) schedule.setContactPerson(request.contactPerson().trim());
        if (request.contactPhone() != null) schedule.setContactPhone(request.contactPhone().trim());
        if (request.remarks() != null) schedule.setRemarks(request.remarks());
    }

    /** Resolves the employee from the user master; the name snapshot comes from there, never from the client. */
    private void applyAssignee(MarketingTravelSchedule schedule, Long userId) {
        User employee = userRepository.findById(userId)
                .orElseThrow(() -> new BadRequestException("Assigned employee does not exist"));
        if (!employee.isEnabled()) {
            throw new BadRequestException("Assigned employee is disabled");
        }
        schedule.setAssignedUserId(employee.getId());
        schedule.setAssignedTo(displayName(employee));
    }

    /** Resolves the optional client through CRM's own service surface and snapshots its business name. */
    private void applyCustomer(MarketingTravelSchedule schedule, Long customerId) {
        CustomerResponse customer = customerService.get(customerId);
        schedule.setCustomerId(customer.id());
        schedule.setCustomerName(customer.businessName());
        if (schedule.getContactPerson() == null || schedule.getContactPerson().isBlank()) {
            if (customer.contactPerson() != null && !customer.contactPerson().isBlank()) {
                schedule.setContactPerson(customer.contactPerson());
                schedule.setContactPhone(customer.phone());
            }
        }
    }

    // ============================== Validation ==============================

    /**
     * Validates the record as it would be stored. {@code creating} makes the
     * required set explicit: an update may send a subset (patch semantics), but
     * it can never leave a required field empty or an end before its start.
     */
    private void validate(MarketingTravelSchedule schedule, boolean creating) {
        requireText(schedule.getScheduleTitle(), "Schedule title");
        if (schedule.getAssignedUserId() == null) {
            throw new BadRequestException("Assigned employee is required");
        }
        requireText(schedule.getPurpose(), "Travel purpose");
        requireText(schedule.getStartingLocation(), "Starting location");
        requireText(schedule.getEndingLocation(), "Destination");
        if (schedule.getStartDate() == null) {
            throw new BadRequestException("Start date is required");
        }
        if (schedule.getEndDate() == null) {
            throw new BadRequestException("End date is required");
        }
        if (creating || schedule.getStartTime() != null) {
            requireText(schedule.getStartTime(), "Start time");
        }
        if (creating || schedule.getEndTime() != null) {
            requireText(schedule.getEndTime(), "End time");
        }
        validateTimeFormat(schedule.getStartTime(), "Start time");
        validateTimeFormat(schedule.getEndTime(), "End time");
        validateOrder(schedule);
        if (schedule.getPriority() != null && !PRIORITIES.contains(schedule.getPriority())) {
            throw new BadRequestException("Priority must be one of: " + String.join(", ", PRIORITIES));
        }
        if (schedule.getTravelMode() != null && !TRAVEL_MODES.contains(schedule.getTravelMode())) {
            throw new BadRequestException("Travel mode must be one of: " + String.join(", ", TRAVEL_MODES));
        }
        if (schedule.getEstimatedDistanceKm() != null
                && schedule.getEstimatedDistanceKm().compareTo(BigDecimal.ZERO) < 0) {
            throw new BadRequestException("Estimated distance cannot be negative");
        }
    }

    private void validateOrder(MarketingTravelSchedule schedule) {
        LocalDateTime start = at(schedule.getStartDate(), schedule.getStartTime());
        LocalDateTime end = at(schedule.getEndDate(), schedule.getEndTime());
        if (start != null && end != null && end.isBefore(start)) {
            throw new BadRequestException("End date/time cannot be earlier than the start date/time");
        }
    }

    private LocalDateTime at(LocalDate date, String time) {
        if (date == null) return null;
        LocalTime localTime = LocalTime.MIDNIGHT;
        if (time != null && TIME_PATTERN.matcher(time).matches()) {
            localTime = time.length() > 5 ? LocalTime.parse(time) : LocalTime.parse(time + ":00");
        }
        return LocalDateTime.of(date, localTime);
    }

    private void validateTimeFormat(String time, String label) {
        if (time != null && !time.isBlank() && !TIME_PATTERN.matcher(time).matches()) {
            throw new BadRequestException(label + " must use the 24-hour HH:mm format");
        }
    }

    private void requireText(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException(label + " is required");
        }
    }

    // ============================== Access ==================================

    private MarketingTravelSchedule findSchedule(Long id) {
        return scheduleRepository.findById(id)
                .filter(s -> !s.isDeleted())
                .orElseThrow(() -> new ResourceNotFoundException("Travel Schedule not found with id: " + id));
    }

    private User requireUser() {
        User user = auditContext.currentUser();
        if (user == null) throw new AccessDeniedException("Authentication required");
        return user;
    }

    private void assertCanAccess(MarketingTravelSchedule schedule) {
        User user = requireUser();
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) return;
        boolean assignee = schedule.getAssignedUserId() != null
                && schedule.getAssignedUserId().equals(user.getId());
        boolean requester = schedule.getRequestedByUserId() != null
                && schedule.getRequestedByUserId().equals(user.getId());
        if (!assignee && !requester) {
            throw new AccessDeniedException("You can only access travel schedules assigned to you or requested by you");
        }
    }

    private Specification<MarketingTravelSchedule> scopeSpecification() {
        return (root, query, cb) -> {
            User user = auditContext.currentUser();
            if (user == null) return cb.disjunction();
            if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) {
                return cb.conjunction();
            }
            return cb.or(
                    cb.equal(root.get("assignedUserId"), user.getId()),
                    cb.equal(root.get("requestedByUserId"), user.getId()));
        };
    }

    // ============================== Specification ===========================

    private Specification<MarketingTravelSchedule> buildSpecification(String search, String status,
                                                                     Long assignedUserId,
                                                                     String dateFrom, String dateTo,
                                                                     String destination) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("deleted"), false));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(cb.toString(root.get("id"))), like),
                        cb.like(cb.lower(root.get("scheduleTitle")), like),
                        cb.like(cb.lower(root.get("assignedTo")), like),
                        cb.like(cb.lower(root.get("purpose")), like),
                        cb.like(cb.lower(root.get("startingLocation")), like),
                        cb.like(cb.lower(root.get("endingLocation")), like),
                        cb.like(cb.lower(root.get("customerName")), like)
                ));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (assignedUserId != null) {
                predicates.add(cb.equal(root.get("assignedUserId"), assignedUserId));
            }
            if (destination != null && !destination.isBlank()) {
                String likeDestination = "%" + destination.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("endingLocation")), likeDestination),
                        cb.like(cb.lower(root.get("startingLocation")), likeDestination)
                ));
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

    private Sort buildSort(String sort) {
        if (sort == null || sort.isBlank()) return Sort.by(Sort.Direction.DESC, "createdAt");
        String[] parts = sort.split(",");
        String mapped = switch (parts[0]) {
            case "scheduleNo" -> "id";
            case "scheduleTitle", "assignedTo", "startDate", "endDate", "endingLocation",
                 "purpose", "status", "priority", "createdAt", "updatedAt" -> parts[0];
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    // ============================== Mapping =================================

    private TravelScheduleResponse toResponse(MarketingTravelSchedule s) {
        return new TravelScheduleResponse(
                s.getId(),
                scheduleNo(s),
                s.getScheduleTitle(),
                s.getAssignedUserId(),
                s.getAssignedTo(),
                s.getRequestedBy(),
                s.getRequestedByUserId(),
                s.getPurpose(),
                s.getPriority(),
                s.getStartDate(),
                s.getStartDate(),
                s.getStartTime(),
                s.getEndDate(),
                s.getEndTime(),
                s.getStartingLocation(),
                s.getEndingLocation(),
                s.getTravelMode(),
                s.getEstimatedDistanceKm(),
                s.getCustomerId(),
                s.getCustomerName(),
                s.getMeetingDetails(),
                s.getContactPerson(),
                s.getContactPhone(),
                s.getRemarks(),
                s.getStatus(),
                s.getApprovalStatus(),
                s.getApprovedBy(),
                s.getApprovedAt(),
                s.getRejectionReason(),
                s.getRevisionComments(),
                s.getCancelledBy(),
                s.getCancelledAt(),
                s.getCancellationReason(),
                s.getCreatedAt(),
                s.getUpdatedAt());
    }

    private TravelScheduleListResponse toListResponse(MarketingTravelSchedule s) {
        return new TravelScheduleListResponse(
                s.getId(),
                scheduleNo(s),
                s.getScheduleTitle(),
                s.getAssignedUserId(),
                s.getAssignedTo(),
                s.getPurpose(),
                s.getPriority(),
                s.getStartDate(),
                s.getStartDate(),
                s.getEndDate(),
                s.getStartingLocation(),
                s.getEndingLocation(),
                s.getTravelMode(),
                s.getStatus(),
                s.getApprovedBy(),
                s.getApprovedAt(),
                s.getCreatedAt(),
                s.getUpdatedAt());
    }

    /** TS-YYYY-NNNN — the registry's numbering convention, derived, never stored. */
    private String scheduleNo(MarketingTravelSchedule schedule) {
        int year = schedule.getCreatedAt() != null
                ? schedule.getCreatedAt().getYear()
                : Year.now().getValue();
        return "TS-" + year + "-" + String.format("%04d", schedule.getId());
    }

    private String displayName(User user) {
        return user.getFullName() == null || user.getFullName().isBlank()
                ? user.getEmail()
                : user.getFullName();
    }
}
