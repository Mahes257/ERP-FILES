package com.vishatech.erp.crm.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record CustomerResponse(
        Long id,
        String businessName,
        String clientCode,
        String alias,
        String contactPerson,
        String email,
        String phone,
        String gstin,
        String pan,
        String billingAddress,
        String billingCity,
        String billingState,
        String billingPin,
        String shippingAddress,
        String shippingCity,
        String shippingState,
        String shippingPin,
        String country,
        String paymentTerms,
        BigDecimal creditLimit,
        String salesPerson,
        String category,
        String status,
        String notes,
        LocalDateTime createdAt,
        // ---- CRM Clients form fields (customer-create.html) -------------------
        String industry,
        String website,
        String clientType,
        String taxTreatment,
        String mapNo,
        String currency,
        String bankName,
        String accountHolderName,
        String accountNumber,
        String ifsc,
        String branch,
        String upiId,
        BigDecimal openingBalance,
        LocalDateTime updatedAt,
        List<CustomerContactResponse> contacts,
        List<CustomerShippingResponse> shippingAddresses,
        List<CustomerAttachmentResponse> attachments
) {

    public record CustomerContactResponse(Long id, String name, String email, String phone, String designation) {
    }

    public record CustomerShippingResponse(Long id, String country, String state, String city, String postal, String street) {
    }

    public record CustomerAttachmentResponse(Long id, String name, String contentType, long size, String url, String uploadedAt) {
    }
}
