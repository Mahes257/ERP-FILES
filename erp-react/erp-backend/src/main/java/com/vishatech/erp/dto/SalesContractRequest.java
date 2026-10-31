package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record SalesContractRequest(
        String scNo,
        String poRef,
        String contractDate,
        String leadNo,
        String qtnRef,
        String status,
        String currency,
        String taxType,
        String hsnView,
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
        String deliveryTerms,
        String salesExecutive,
        String validity,
        String duration,
        String warranty,
        String commercialTerms,
        String scope,
        String exclusions,
        String remarks,
        BigDecimal discount,
        BigDecimal charges,
        List<SalesContractItemRequest> items
) {
}
