package com.vishatech.erp.service;

import com.vishatech.erp.dto.ExpenseTripListResponse;
import com.vishatech.erp.dto.ExpenseTripRequest;
import com.vishatech.erp.dto.ExpenseTripResponse;
import com.vishatech.erp.entity.*;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.*;
import com.vishatech.erp.util.AuditContext;
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

@Service
@Transactional
public class ExpenseTripService {

    private final MarketingExpenseTripRepository tripRepository;
    private final MarketingExpenseRepository expenseRepository;
    private final MarketingExpenseAttachmentRepository attachmentRepository;
    private final MarketingExpenseAuditLogRepository auditLogRepository;
    private final AuditContext auditContext;

    public ExpenseTripService(MarketingExpenseTripRepository tripRepository,
                               MarketingExpenseRepository expenseRepository,
                               MarketingExpenseAttachmentRepository attachmentRepository,
                               MarketingExpenseAuditLogRepository auditLogRepository,
                               AuditContext auditContext) {
        this.tripRepository = tripRepository;
        this.expenseRepository = expenseRepository;
        this.attachmentRepository = attachmentRepository;
        this.auditLogRepository = auditLogRepository;
        this.auditContext = auditContext;
    }

    // ============================== CRUD ====================================

    @Transactional
    public ExpenseTripResponse create(ExpenseTripRequest request) {
        User user = requireUser();
        MarketingExpenseTrip trip = new MarketingExpenseTrip();
        trip.setMarketer(user.getFullName() == null || user.getFullName().isBlank() ? user.getEmail() : user.getFullName());
        trip.setMarketerUserId(user.getId());
        trip.setStatus("Planned");
        trip.setApprovalStatus("Draft");
        applyTripFields(trip, request);
        MarketingExpenseTrip saved = tripRepository.save(trip);
        addAudit(saved.getId(), null, "EXPENSE_CREATED", "Expense created", user);
        return toResponse(saved);
    }

    public ExpenseTripResponse get(Long id) {
        MarketingExpenseTrip trip = findTrip(id);
        assertCanAccess(trip);
        return toResponse(trip);
    }

    @Transactional
    public ExpenseTripResponse update(Long id, ExpenseTripRequest request) {
        MarketingExpenseTrip trip = findTrip(id);
        assertCanAccess(trip);
        if ("Trip OFF".equals(trip.getStatus()) || "Completed".equals(trip.getStatus()) || "Cancelled".equals(trip.getStatus())) {
            throw new BadRequestException("Cannot edit a " + trip.getStatus().toLowerCase() + " expense");
        }
        applyTripFields(trip, request);
        tripRepository.save(trip);
        return toResponse(trip);
    }

    @Transactional
    public void delete(Long id) {
        MarketingExpenseTrip trip = findTrip(id);
        assertCanAccess(trip);
        if (!"Draft".equals(trip.getApprovalStatus()) && !"Planned".equals(trip.getStatus())) {
            throw new BadRequestException("Only draft expenses can be deleted");
        }
        attachmentRepository.deleteByTripId(trip.getId());
        expenseRepository.deleteByTripId(trip.getId());
        auditLogRepository.deleteByTripId(trip.getId());
        tripRepository.delete(trip);
    }

    // ============================== Expense Actions ============================

    @Transactional
    public ExpenseTripResponse startTrip(Long id, ExpenseTripRequest request) {
        MarketingExpenseTrip trip = findTrip(id);
        assertCanAccess(trip);
        if ("Active".equals(trip.getStatus())) throw new BadRequestException("Expense already active");
        if ("Completed".equals(trip.getStatus())) throw new BadRequestException("Expense already completed");
        trip.setStatus("Active");
        trip.setTripOnDateTime(LocalDateTime.now());
        if (request != null) {
            if (request.tripOnLocation() != null) trip.setTripOnLocation(request.tripOnLocation());
            if (request.tripOnLatitude() != null) trip.setTripOnLatitude(request.tripOnLatitude());
            if (request.tripOnLongitude() != null) trip.setTripOnLongitude(request.tripOnLongitude());
        }
        tripRepository.save(trip);
        addAudit(trip.getId(), null, "EXPENSE_STARTED", "Expense started", requireUser());
        return toResponse(trip);
    }

    @Transactional
    public ExpenseTripResponse endTrip(Long id, ExpenseTripRequest request) {
        MarketingExpenseTrip trip = findTrip(id);
        assertCanAccess(trip);
        if (!"Active".equals(trip.getStatus())) throw new BadRequestException("Only active expenses can be ended");
        trip.setStatus("Trip OFF");
        trip.setTripOffDateTime(LocalDateTime.now());
        if (request != null) {
            if (request.tripOffLocation() != null) trip.setTripOffLocation(request.tripOffLocation());
            if (request.tripOffLatitude() != null) trip.setTripOffLatitude(request.tripOffLatitude());
            if (request.tripOffLongitude() != null) trip.setTripOffLongitude(request.tripOffLongitude());
        }
        tripRepository.save(trip);
        addAudit(trip.getId(), null, "EXPENSE_COMPLETED", "Expense completed", requireUser());
        return toResponse(trip);
    }

    @Transactional
    public ExpenseTripResponse submit(Long id) {
        MarketingExpenseTrip trip = findTrip(id);
        assertCanAccess(trip);
        if (!"Trip OFF".equals(trip.getStatus()) && !"Completed".equals(trip.getStatus())) throw new BadRequestException("Complete the expense before submitting");
        // Check for WITH BILL expenses without attachments
        List<MarketingExpense> expenses = expenseRepository.findByTripIdOrderByExpenseDateAscExpenseTimeAscIdAsc(trip.getId());
        for (MarketingExpense e : expenses) {
            if ("WITH BILL".equals(e.getBillStatus())) {
                List<MarketingExpenseAttachment> atts = attachmentRepository.findByExpenseIdOrderByUploadedAtDesc(e.getId());
                if (atts.isEmpty()) {
                    throw new BadRequestException("Expense " + e.getId() + " requires a bill attachment (WITH BILL)");
                }
            }
        }
        trip.setApprovalStatus("Submitted");
        tripRepository.save(trip);
        addAudit(trip.getId(), null, "EXPENSE_SUBMITTED", "Expense submitted for approval", requireUser());
        return toResponse(trip);
    }

    @Transactional
    public ExpenseTripResponse approve(Long id) {
        MarketingExpenseTrip trip = findTrip(id);
        User approver = requireUser();
        if (!"Submitted".equals(trip.getApprovalStatus())) throw new BadRequestException("Only submitted expenses can be approved");
        trip.setApprovalStatus("Approved");
        trip.setApprovedBy(approver.getFullName() != null ? approver.getFullName() : approver.getEmail());
        trip.setApprovedAt(LocalDateTime.now());
        tripRepository.save(trip);
        addAudit(trip.getId(), null, "APPROVED", "Expense approved by " + trip.getApprovedBy(), approver);
        return toResponse(trip);
    }

    @Transactional
    public ExpenseTripResponse reject(Long id, ExpenseTripRequest request) {
        MarketingExpenseTrip trip = findTrip(id);
        User approver = requireUser();
        if (!"Submitted".equals(trip.getApprovalStatus())) throw new BadRequestException("Only submitted expenses can be rejected");
        trip.setApprovalStatus("Rejected");
        trip.setRejectionReason(request.rejectionReason());
        tripRepository.save(trip);
        addAudit(trip.getId(), null, "REJECTED", "Expense rejected: " + request.rejectionReason(), approver);
        return toResponse(trip);
    }

    @Transactional
    public ExpenseTripResponse requestCorrection(Long id, ExpenseTripRequest request) {
        MarketingExpenseTrip trip = findTrip(id);
        User approver = requireUser();
        trip.setApprovalStatus("Correction Requested");
        trip.setCorrectionComments(request.correctionComments());
        tripRepository.save(trip);
        addAudit(trip.getId(), null, "CORRECTION_REQUESTED", "Correction requested: " + request.correctionComments(), approver);
        return toResponse(trip);
    }

    // ============================== Expense CRUD ============================

    @Transactional
    public ExpenseTripResponse addExpense(Long tripId, ExpenseTripRequest.ExpenseDto dto) {
        MarketingExpenseTrip trip = findTrip(tripId);
        assertCanAccess(trip);
        if ("Submitted".equals(trip.getApprovalStatus()) || "Approved".equals(trip.getApprovalStatus())) {
            throw new BadRequestException("Cannot add expenses to a submitted/approved record");
        }
        if ("Trip OFF".equals(trip.getStatus()) || "Completed".equals(trip.getStatus())) {
            throw new BadRequestException("Cannot add expenses after completion");
        }
        User user = requireUser();
        MarketingExpense expense = new MarketingExpense();
        expense.setTripId(tripId);
        expense.setCreatedBy(user.getFullName() != null ? user.getFullName() : user.getEmail());
        expense.setCreatedByUserId(user.getId());
        // WITHOUT BILL reason is optional per ERP spec — no validation required
        applyExpenseFields(expense, dto);
        expenseRepository.save(expense);
        recalculateTotals(trip);
        addAudit(tripId, expense.getId(), "EXPENSE_ADDED", "Expense added: " + dto.expenseType() + " ₹" + dto.amount(), user);
        return toResponse(trip);
    }

    @Transactional
    public ExpenseTripResponse updateExpense(Long tripId, Long expenseId, ExpenseTripRequest.ExpenseDto dto) {
        MarketingExpenseTrip trip = findTrip(tripId);
        assertCanAccess(trip);
        MarketingExpense expense = findExpense(expenseId);
        if (!tripId.equals(expense.getTripId())) throw new BadRequestException("Expense does not belong to this record");
        applyExpenseFields(expense, dto);
        expenseRepository.save(expense);
        recalculateTotals(trip);
        return toResponse(trip);
    }

    @Transactional
    public ExpenseTripResponse deleteExpense(Long tripId, Long expenseId) {
        MarketingExpenseTrip trip = findTrip(tripId);
        assertCanAccess(trip);
        MarketingExpense expense = findExpense(expenseId);
        if (!tripId.equals(expense.getTripId())) throw new BadRequestException("Expense does not belong to this record");
        attachmentRepository.deleteByExpenseId(expenseId);
        expenseRepository.delete(expense);
        recalculateTotals(trip);
        addAudit(tripId, expenseId, "EXPENSE_DELETED", "Expense deleted: " + expense.getExpenseType(), requireUser());
        return toResponse(trip);
    }

    // ============================== Totals ==================================

    private void recalculateTotals(MarketingExpenseTrip trip) {
        List<MarketingExpense> expenses = expenseRepository.findByTripIdOrderByExpenseDateAscExpenseTimeAscIdAsc(trip.getId());
        BigDecimal total = BigDecimal.ZERO, withBill = BigDecimal.ZERO, withoutBill = BigDecimal.ZERO;
        BigDecimal travel = BigDecimal.ZERO, stay = BigDecimal.ZERO, food = BigDecimal.ZERO, local = BigDecimal.ZERO, other = BigDecimal.ZERO;
        for (MarketingExpense e : expenses) {
            BigDecimal amt = e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO;
            total = total.add(amt);
            if ("WITH BILL".equals(e.getBillStatus())) withBill = withBill.add(amt);
            else withoutBill = withoutBill.add(amt);
            switch (e.getExpenseType()) {
                case "Travel", "Travel Ticket", "Local Travel" -> travel = travel.add(amt);
                case "Stay" -> stay = stay.add(amt);
                case "Food" -> food = food.add(amt);
                default -> other = other.add(amt);
            }
        }
        trip.setTotalAmount(total);
        trip.setWithBillTotal(withBill);
        trip.setWithoutBillTotal(withoutBill);
        trip.setTravelTotal(travel);
        trip.setStayTotal(stay);
        trip.setFoodTotal(food);
        trip.setLocalTravelTotal(local);
        trip.setOtherTotal(other);
        trip.setExpenseCount(expenses.size());
        tripRepository.save(trip);
    }

    // ============================== List & Search ============================

    public Page<ExpenseTripListResponse> list(int page, int size, String search, String sort,
                                               String status, String approvalStatus, String marketer,
                                               String dateFrom, String dateTo) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort, "createdAt"));
        Specification<MarketingExpenseTrip> spec = buildSpecification(search, status, approvalStatus, marketer, dateFrom, dateTo)
                .and(scopeSpecification());
        return tripRepository.findAll(spec, pageable).map(this::toListResponse);
    }

    // ============================== Helpers =================================

    private void applyTripFields(MarketingExpenseTrip trip, ExpenseTripRequest request) {
        if (request.travelPlanRef() != null) trip.setTravelPlanRef(request.travelPlanRef().trim());
        if (request.startLocation() != null) trip.setStartLocation(request.startLocation().trim());
        if (request.startLatitude() != null) trip.setStartLatitude(request.startLatitude());
        if (request.startLongitude() != null) trip.setStartLongitude(request.startLongitude());
        if (request.destination() != null) trip.setDestination(request.destination().trim());
        if (request.purpose() != null) trip.setPurpose(request.purpose().trim());
        if (request.startDate() != null) trip.setStartDate(request.startDate());
        if (request.startTime() != null) trip.setStartTime(request.startTime());
        if (request.expectedEndDate() != null) trip.setExpectedEndDate(request.expectedEndDate());
        if (request.expectedEndTime() != null) trip.setExpectedEndTime(request.expectedEndTime());
        if (request.visitRef() != null) trip.setVisitRef(request.visitRef().trim());
        if (request.visitId() != null) trip.setVisitId(request.visitId());
        if (request.remarks() != null) trip.setRemarks(request.remarks());
    }

    private void applyExpenseFields(MarketingExpense e, ExpenseTripRequest.ExpenseDto dto) {
        if (dto.expenseType() != null) e.setExpenseType(dto.expenseType());
        if (dto.expenseSubType() != null) e.setExpenseSubType(dto.expenseSubType());
        if (dto.expenseDate() != null) e.setExpenseDate(dto.expenseDate());
        if (dto.expenseTime() != null) e.setExpenseTime(dto.expenseTime());
        if (dto.location() != null) e.setLocation(dto.location());
        if (dto.travelMode() != null) e.setTravelMode(dto.travelMode());
        if (dto.travelFrom() != null) e.setTravelFrom(dto.travelFrom());
        if (dto.travelTo() != null) e.setTravelTo(dto.travelTo());
        if (dto.ticketNumber() != null) e.setTicketNumber(dto.ticketNumber());
        if (dto.operatorProvider() != null) e.setOperatorProvider(dto.operatorProvider());
        if (dto.passengerName() != null) e.setPassengerName(dto.passengerName());
        if (dto.hotelName() != null) e.setHotelName(dto.hotelName());
        if (dto.checkInDate() != null) e.setCheckInDate(dto.checkInDate());
        if (dto.checkInTime() != null) e.setCheckInTime(dto.checkInTime());
        if (dto.checkOutDate() != null) e.setCheckOutDate(dto.checkOutDate());
        if (dto.checkOutTime() != null) e.setCheckOutTime(dto.checkOutTime());
        if (dto.numberOfNights() != null) e.setNumberOfNights(dto.numberOfNights());
        if (dto.restaurantVendor() != null) e.setRestaurantVendor(dto.restaurantVendor());
        if (dto.numberOfPersons() != null) e.setNumberOfPersons(dto.numberOfPersons());
        if (dto.mealType() != null) e.setMealType(dto.mealType());
        if (dto.localTravelMode() != null) e.setLocalTravelMode(dto.localTravelMode());
        if (dto.localFrom() != null) e.setLocalFrom(dto.localFrom());
        if (dto.localTo() != null) e.setLocalTo(dto.localTo());
        if (dto.travelPurpose() != null) e.setTravelPurpose(dto.travelPurpose());
        if (dto.amount() != null) e.setAmount(dto.amount());
        if (dto.paymentMethod() != null) e.setPaymentMethod(dto.paymentMethod());
        if (dto.remarks() != null) e.setRemarks(dto.remarks());
        if (dto.billStatus() != null) e.setBillStatus(dto.billStatus());
        if (dto.withoutBillReason() != null) e.setWithoutBillReason(dto.withoutBillReason());
        if (dto.description() != null) e.setDescription(dto.description());
    }

    private void addAudit(Long tripId, Long expenseId, String action, String description, User user) {
        MarketingExpenseAuditLog log = new MarketingExpenseAuditLog();
        log.setTripId(tripId);
        log.setExpenseId(expenseId);
        log.setAction(action);
        log.setDescription(description);
        log.setPerformedBy(user.getFullName() != null ? user.getFullName() : user.getEmail());
        log.setPerformedByUserId(user.getId());
        auditLogRepository.save(log);
    }

    // ---- Finders ----
    private MarketingExpenseTrip findTrip(Long id) {
        return tripRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Marketing Expense not found: " + id));
    }
    private MarketingExpense findExpense(Long id) {
        return expenseRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Expense not found: " + id));
    }
    private User requireUser() {
        User user = auditContext.currentUser();
        if (user == null) throw new AccessDeniedException("Authentication required");
        return user;
    }
    private void assertCanAccess(MarketingExpenseTrip trip) {
        User user = requireUser();
        if (user.getRole() == UserRole.ADMIN || user.getRole() == UserRole.MANAGER) return;
        if (trip.getMarketerUserId() == null || !trip.getMarketerUserId().equals(user.getId())) {
            throw new AccessDeniedException("You can only access your own expense trips");
        }
    }

    // ---- Specifications ----
    private Specification<MarketingExpenseTrip> buildSpecification(String search, String status, String approvalStatus, String marketer, String dateFrom, String dateTo) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("deleted"), false));
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("marketer")), like),
                        cb.like(cb.lower(root.get("startLocation")), like),
                        cb.like(cb.lower(root.get("destination")), like),
                        cb.like(cb.lower(root.get("purpose")), like),
                        cb.like(cb.lower(root.get("visitRef")), like)
                ));
            }
            if (status != null && !status.isBlank()) predicates.add(cb.equal(root.get("status"), status));
            if (approvalStatus != null && !approvalStatus.isBlank()) predicates.add(cb.equal(root.get("approvalStatus"), approvalStatus));
            if (marketer != null && !marketer.isBlank()) predicates.add(cb.equal(root.get("marketer"), marketer));
            if (dateFrom != null && !dateFrom.isBlank()) predicates.add(cb.greaterThanOrEqualTo(root.get("startDate"), LocalDate.parse(dateFrom)));
            if (dateTo != null && !dateTo.isBlank()) predicates.add(cb.lessThanOrEqualTo(root.get("startDate"), LocalDate.parse(dateTo)));
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Specification<MarketingExpenseTrip> scopeSpecification() {
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
            case "tripNo", "marketer", "startDate", "status", "approvalStatus", "totalAmount", "createdAt", "updatedAt" -> field;
            default -> defaultField;
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    // ---- Summary Dashboard ----

    public record ExpenseSummary(
            long activeTrips,
            long pendingSubmission,
            long pendingApproval,
            long approvedTrips,
            long rejectedTrips,
            long completedTrips,
            java.math.BigDecimal totalExpenseAmount,
            java.math.BigDecimal withBillAmount,
            java.math.BigDecimal withoutBillAmount
    ) {}

    public ExpenseSummary getSummary(String dateFrom, String dateTo, String marketer) {
        // Counts
        long activeTrips = tripRepository.countByStatus("Active");
        long completedTrips = tripRepository.countByStatus("Completed");
        long approvedTrips = tripRepository.countByApprovalStatus("Approved");
        long rejectedTrips = tripRepository.countByApprovalStatus("Rejected");
        long submittedTrips = tripRepository.countByApprovalStatus("Submitted");
        long draftTrips = tripRepository.countByApprovalStatus("Draft");
        // Pending submission = Completed status + Draft approval
        long pendingSubmission = Math.max(0, completedTrips - submittedTrips - approvedTrips - rejectedTrips);
        // "Pending Approval" is the Submitted approval state — the workflow only
        // ever writes Draft/Submitted/Approved/Rejected/Correction Requested, so
        // counting the literal "Pending Approval" always returned 0 and the KPI
        // disagreed with the "Pending Approval" tab (which filters Submitted).
        long pendingApprovalTrips = submittedTrips;
        // Totals
        java.math.BigDecimal total = expenseRepository.sumAllExpenses();
        java.math.BigDecimal withBill = expenseRepository.sumWithBillExpenses();
        java.math.BigDecimal withoutBill = expenseRepository.sumWithoutBillExpenses();
        return new ExpenseSummary(activeTrips, pendingSubmission, pendingApprovalTrips, approvedTrips, rejectedTrips, completedTrips, total, withBill, withoutBill);
    }

    // ---- Duplicate Detection ----

    public List<MarketingExpense> findDuplicateExpenses(Long tripId, java.time.LocalDate expenseDate, String expenseType, java.math.BigDecimal amount, Long excludeId) {
        return expenseRepository.findPotentialDuplicates(tripId, expenseDate, expenseType, amount, excludeId);
    }

    // ---- Number generation ----
    private String tripNo(Long id, LocalDateTime createdAt) {
        if (id == null) return "ME-";
        int year = createdAt == null ? Year.now().getValue() : createdAt.getYear();
        return "ME-" + year + "-" + String.format("%04d", id);
    }

    // ---- Mapping ----
    private ExpenseTripListResponse toListResponse(MarketingExpenseTrip t) {
        return new ExpenseTripListResponse(
                t.getId(), tripNo(t.getId(), t.getCreatedAt()), t.getMarketer(), t.getTravelPlanRef(),
                t.getStartLocation(), t.getDestination(), t.getPurpose(), t.getStartDate(),
                t.getTripOnDateTime(), t.getTripOffDateTime(), t.getStatus(), t.getApprovalStatus(),
                t.getTotalAmount(), t.getWithBillTotal(), t.getWithoutBillTotal(),
                t.getTravelTotal(), t.getStayTotal(), t.getFoodTotal(), t.getLocalTravelTotal(), t.getOtherTotal(),
                t.getExpenseCount(),
                t.getApprovedBy(), t.getCreatedAt(), t.getUpdatedAt());
    }

    private ExpenseTripResponse toResponse(MarketingExpenseTrip t) {
        List<MarketingExpense> expenses = expenseRepository.findByTripIdOrderByExpenseDateAscExpenseTimeAscIdAsc(t.getId());
        List<MarketingExpenseAttachment> atts = attachmentRepository.findByTripIdOrderByUploadedAtDesc(t.getId());
        List<MarketingExpenseAuditLog> logs = auditLogRepository.findByTripIdOrderByPerformedAtAscIdAsc(t.getId());
        return new ExpenseTripResponse(
                t.getId(), tripNo(t.getId(), t.getCreatedAt()), t.getMarketer(), t.getMarketerUserId(),
                t.getTravelPlanRef(), t.getStartLocation(), t.getStartLatitude(), t.getStartLongitude(),
                t.getDestination(), t.getPurpose(), t.getStartDate(), t.getStartTime(),
                t.getExpectedEndDate(), t.getExpectedEndTime(), t.getVisitRef(),
                t.getTripOnDateTime(), t.getTripOnLocation(), t.getTripOffDateTime(), t.getTripOffLocation(),
                t.getRemarks(), t.getStatus(), t.getApprovalStatus(),
                t.getTotalAmount(), t.getWithBillTotal(), t.getWithoutBillTotal(),
                t.getTravelTotal(), t.getStayTotal(), t.getFoodTotal(), t.getLocalTravelTotal(), t.getOtherTotal(),
                t.getExpenseCount(), t.getApprovedBy(), t.getApprovedAt(),
                t.getRejectionReason(), t.getCorrectionComments(),
                expenses.stream().map(e -> {
                    List<ExpenseTripResponse.AttachmentDto> eAtts = atts.stream()
                            .filter(a -> a.getExpenseId() != null && a.getExpenseId().equals(e.getId()))
                            .map(a -> new ExpenseTripResponse.AttachmentDto(a.getId(), a.getExpenseId(), a.getName(), a.getStoredName(), a.getContentType(), a.getSize(), a.getUploadedAt()))
                            .toList();
                    return new ExpenseTripResponse.ExpenseDto(
                            e.getId(), e.getExpenseType(), e.getExpenseSubType(), e.getExpenseDate(), e.getExpenseTime(), e.getLocation(),
                            e.getTravelMode(), e.getTravelFrom(), e.getTravelTo(), e.getTicketNumber(), e.getOperatorProvider(), e.getPassengerName(),
                            e.getHotelName(), e.getCheckInDate(), e.getCheckInTime(), e.getCheckOutDate(), e.getCheckOutTime(), e.getNumberOfNights(),
                            e.getRestaurantVendor(), e.getNumberOfPersons(), e.getMealType(),
                            e.getLocalTravelMode(), e.getLocalFrom(), e.getLocalTo(), e.getTravelPurpose(),
                            e.getAmount(), e.getPaymentMethod(), e.getRemarks(), e.getBillStatus(), e.getWithoutBillReason(), e.getDescription(),
                            eAtts, e.getCreatedBy(), e.getCreatedAt(), e.getUpdatedAt());
                }).toList(),
                atts.stream().map(a -> new ExpenseTripResponse.AttachmentDto(a.getId(), a.getExpenseId(), a.getName(), a.getStoredName(), a.getContentType(), a.getSize(), a.getUploadedAt())).toList(),
                logs.stream().map(l -> new ExpenseTripResponse.AuditLogDto(l.getId(), l.getAction(), l.getDescription(), l.getPerformedBy(), l.getPerformedAt())).toList(),
                t.getCreatedAt(), t.getUpdatedAt());
    }
}
