package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record SalesOrderRequest(
        String soNo,
        String customerPo,
        String orderDate,
        String leadNo,
        String scRef,
        String qtnRef,
        String status,
        String currency,
        String taxType,
        String hsnView,
        String priority,
        Long clientId,
        String clientName,
        String contactPerson,
        String email,
        String phone,
        String city,
        String state,
        String billingAddress,
        String shippingAddress,
        String gstin,
        String pan,
        String paymentTerms,
        String salesExecutive,
        String deliveryDate,
        String deliveryTerms,
        String terms,
        String remarks,
        // ---- Release & Procurement Method ----
        String releaseMethod,
        String releaseRequired,
        String actionType,
        String releaseDate,
        String releaseToDepartment,
        String participationRequired,
        String assignedTo,
        String departmentTeam,
        String actionDeadline,
        String actionRemarks,
        String actionInstructions,
        BigDecimal discount,
        BigDecimal charges,
        List<SalesOrderItemRequest> items,
        List<SalesOrderEActionRequest> eActions
) {
}
