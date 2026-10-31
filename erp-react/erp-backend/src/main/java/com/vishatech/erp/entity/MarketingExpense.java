package com.vishatech.erp.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One expense entry within a Marketing Expense Trip.
 * Types: Travel Ticket / Stay / Food / Local Travel / Other Trip Expense
 * Bill Status: WITH BILL / WITHOUT BILL
 */
@Entity
@Table(name = "marketing_expenses")
public class MarketingExpense {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;

    @Column(nullable = false) private Long tripId;

    /** Expense type: Travel / Stay / Food / Other (category) */
    @Column(nullable = false, length = 40) private String expenseType;

    /** Category-specific choice: e.g. Train (Travel), Lunch (Food), Hotel (Stay), Parking (Other). */
    @Column(length = 50) private String expenseSubType;

    private LocalDate expenseDate;
    private String expenseTime;
    private String location;

    // Travel Ticket fields
    private String travelMode; // Bus / Taxi / Train / Flight
    private String travelFrom;
    private String travelTo;
    private String ticketNumber;
    private String operatorProvider;
    private String passengerName;

    // Stay/Lodge fields
    private String hotelName;
    private LocalDate checkInDate;
    private String checkInTime;
    private LocalDate checkOutDate;
    private String checkOutTime;
    private Integer numberOfNights;

    // Food fields
    private String restaurantVendor;
    private Integer numberOfPersons;
    private String mealType; // Breakfast / Lunch / Dinner / Other

    // Local Travel fields
    private String localTravelMode; // Taxi / Auto / Cab / Local Transport / Other
    private String localFrom;
    private String localTo;
    private String travelPurpose;

    // Common fields
    @Column(precision = 12, scale = 2) private BigDecimal amount = BigDecimal.ZERO;
    private String paymentMethod;
    @Lob @Column(columnDefinition = "TEXT") private String remarks;

    /** WITH BILL / WITHOUT BILL */
    @Column(nullable = false, length = 20) private String billStatus = "WITHOUT BILL";

    /** Required reason when billStatus = WITHOUT BILL */
    @Lob @Column(columnDefinition = "TEXT") private String withoutBillReason;

    // Other Trip Expense
    @Lob @Column(columnDefinition = "TEXT") private String description;

    private String createdBy;
    private Long createdByUserId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist void onCreate() { createdAt = LocalDateTime.now(); updatedAt = createdAt; }
    @PreUpdate void onUpdate() { updatedAt = LocalDateTime.now(); }

    // Getters and setters
    public Long getId() { return id; } public void setId(Long id) { this.id = id; }
    public Long getTripId() { return tripId; } public void setTripId(Long v) { this.tripId = v; }
    public String getExpenseType() { return expenseType; } public void setExpenseType(String v) { this.expenseType = v; }
    public String getExpenseSubType() { return expenseSubType; } public void setExpenseSubType(String v) { this.expenseSubType = v; }
    public LocalDate getExpenseDate() { return expenseDate; } public void setExpenseDate(LocalDate v) { this.expenseDate = v; }
    public String getExpenseTime() { return expenseTime; } public void setExpenseTime(String v) { this.expenseTime = v; }
    public String getLocation() { return location; } public void setLocation(String v) { this.location = v; }
    public String getTravelMode() { return travelMode; } public void setTravelMode(String v) { this.travelMode = v; }
    public String getTravelFrom() { return travelFrom; } public void setTravelFrom(String v) { this.travelFrom = v; }
    public String getTravelTo() { return travelTo; } public void setTravelTo(String v) { this.travelTo = v; }
    public String getTicketNumber() { return ticketNumber; } public void setTicketNumber(String v) { this.ticketNumber = v; }
    public String getOperatorProvider() { return operatorProvider; } public void setOperatorProvider(String v) { this.operatorProvider = v; }
    public String getPassengerName() { return passengerName; } public void setPassengerName(String v) { this.passengerName = v; }
    public String getHotelName() { return hotelName; } public void setHotelName(String v) { this.hotelName = v; }
    public LocalDate getCheckInDate() { return checkInDate; } public void setCheckInDate(LocalDate v) { this.checkInDate = v; }
    public String getCheckInTime() { return checkInTime; } public void setCheckInTime(String v) { this.checkInTime = v; }
    public LocalDate getCheckOutDate() { return checkOutDate; } public void setCheckOutDate(LocalDate v) { this.checkOutDate = v; }
    public String getCheckOutTime() { return checkOutTime; } public void setCheckOutTime(String v) { this.checkOutTime = v; }
    public Integer getNumberOfNights() { return numberOfNights; } public void setNumberOfNights(Integer v) { this.numberOfNights = v; }
    public String getRestaurantVendor() { return restaurantVendor; } public void setRestaurantVendor(String v) { this.restaurantVendor = v; }
    public Integer getNumberOfPersons() { return numberOfPersons; } public void setNumberOfPersons(Integer v) { this.numberOfPersons = v; }
    public String getMealType() { return mealType; } public void setMealType(String v) { this.mealType = v; }
    public String getLocalTravelMode() { return localTravelMode; } public void setLocalTravelMode(String v) { this.localTravelMode = v; }
    public String getLocalFrom() { return localFrom; } public void setLocalFrom(String v) { this.localFrom = v; }
    public String getLocalTo() { return localTo; } public void setLocalTo(String v) { this.localTo = v; }
    public String getTravelPurpose() { return travelPurpose; } public void setTravelPurpose(String v) { this.travelPurpose = v; }
    public BigDecimal getAmount() { return amount; } public void setAmount(BigDecimal v) { this.amount = v; }
    public String getPaymentMethod() { return paymentMethod; } public void setPaymentMethod(String v) { this.paymentMethod = v; }
    public String getRemarks() { return remarks; } public void setRemarks(String v) { this.remarks = v; }
    public String getBillStatus() { return billStatus; } public void setBillStatus(String v) { this.billStatus = v; }
    public String getWithoutBillReason() { return withoutBillReason; } public void setWithoutBillReason(String v) { this.withoutBillReason = v; }
    public String getDescription() { return description; } public void setDescription(String v) { this.description = v; }
    public String getCreatedBy() { return createdBy; } public void setCreatedBy(String v) { this.createdBy = v; }
    public Long getCreatedByUserId() { return createdByUserId; } public void setCreatedByUserId(Long v) { this.createdByUserId = v; }
    public LocalDateTime getCreatedAt() { return createdAt; } public void setCreatedAt(LocalDateTime v) { this.createdAt = v; }
    public LocalDateTime getUpdatedAt() { return updatedAt; } public void setUpdatedAt(LocalDateTime v) { this.updatedAt = v; }
}
