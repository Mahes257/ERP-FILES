package com.vishatech.erp.crm.dto;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.util.List;

public record CustomerRequest(
        @NotBlank(message = "Business name is required") String businessName,
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
        List<CustomerContactRequest> contacts,
        List<CustomerShippingRequest> shippingAddresses,
        // ---- CRM Contacts integration (both optional, both additive) --------
        // The lead this client was created from (the "Convert to Client" flow).
        // Its captured contacts are linked to the new client instead of being
        // duplicated, so a converted person keeps one record with both the lead
        // and the client reference.
        Long leadId,
        // Contacts the operator picked from the Contacts module in the client
        // form (the real contact ids, not just their text) — the same rows are
        // linked to this client.
        List<Long> linkedContactIds
) {

    public record CustomerContactRequest(String name, String email, String phone, String designation) {
    }

    public record CustomerShippingRequest(String country, String state, String city, String postal, String street) {
    }
}
