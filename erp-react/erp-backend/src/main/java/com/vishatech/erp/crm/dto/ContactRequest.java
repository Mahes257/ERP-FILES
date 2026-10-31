package com.vishatech.erp.crm.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import com.vishatech.erp.crm.entity.Contact;

/**
 * Create/update payload for a CRM contact.
 *
 * {@code leadId} / {@code clientId} are real foreign keys (never a business-name
 * match): the service verifies both rows exist before associating them, so a
 * contact can only ever be linked to a lead or client that is actually there.
 */
public record ContactRequest(
        @NotBlank(message = "Contact name is required") String name,
        String designation,
        String phone,
        @Email(message = "Invalid email format") String email,
        /** Primary | Secondary (the lead form's Contact Person / Secondary Contact). */
        String contactType,
        String businessName,
        Long leadId,
        Long clientId,
        /** Active | Inactive | Archived | Deleted. */
        String status
) {
}
