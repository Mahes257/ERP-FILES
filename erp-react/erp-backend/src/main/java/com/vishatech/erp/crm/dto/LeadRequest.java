package com.vishatech.erp.crm.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import com.vishatech.erp.crm.entity.Lead;

public record LeadRequest(
        @NotBlank(message = "Lead name is required") String leadName,
        String firstName,
        String lastName,
        String companyName,
        String designation,
        String phone,
        @Email(message = "Invalid email format") String email,
        BigDecimal estimatedValue,
        String pipelineStage,
        String leadSource,
        String assignedTo,
        String website,
        String address,
        String city,
        String state,
        String pincode,
        String country,
        String businessName,
        String businessType,
        String industry,
        String taxId,
        String secondaryName,
        String secondaryPhone,
        String secondaryEmail,
        String internalNotes,
        String description,
        String pan,
        String preferredVendor,
        String project,
        String priority,
        // The create/edit form's public "Notes" text block (stored as a lead note).
        String notes
) {
}
