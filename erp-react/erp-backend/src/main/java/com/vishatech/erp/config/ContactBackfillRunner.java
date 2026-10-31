package com.vishatech.erp.config;

import com.vishatech.erp.crm.service.ContactService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Makes the contact information that ALREADY exists visible in the CRM Contacts
 * module.
 *
 * The leads in the database predate the module: their primary/secondary contact
 * details live in columns on the lead row, so nothing would appear in Contacts
 * until each lead was saved again. This runner mirrors those rows through the
 * same idempotent sync the lead save path uses.
 *
 * Safety properties (they are the reason this runs automatically):
 *   * ADDITIVE — it only creates the missing contact rows; no lead, client or
 *     contact is ever deleted, and no column is rewritten.
 *   * IDEMPOTENT — each role is matched by {@code (lead_id, contact_type)}, so a
 *     restart (or a manual re-run through POST /contacts/backfill) changes
 *     nothing once the mirrors exist.
 *   * HONEST — a lead without contact details produces no contact at all; the
 *     module never fabricates a person to fill the table.
 *
 * Disable with {@code app.contacts.backfill-on-startup=false} (the test profile
 * leaves it enabled: it is a no-op on an empty database).
 */
@Component
@Order(20)
@ConditionalOnProperty(name = "app.contacts.backfill-on-startup", havingValue = "true", matchIfMissing = true)
public class ContactBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ContactBackfillRunner.class);

    private final ContactService contactService;

    public ContactBackfillRunner(ContactService contactService) {
        this.contactService = contactService;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            int changed = contactService.backfillFromLeads();
            log.info("CRM Contacts backfill complete: {} contact(s) created or refreshed from existing leads "
                    + "(idempotent — re-running changes nothing)", changed);
        } catch (RuntimeException ex) {
            // A backfill failure must never stop the application: the module
            // works with the rows that do exist and can be backfilled later
            // through POST /contacts/backfill.
            log.warn("CRM Contacts backfill could not complete: {}", ex.getMessage());
        }
    }
}
