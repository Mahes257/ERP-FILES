package com.vishatech.erp.crm.service;

import com.vishatech.erp.crm.dto.ContactRequest;
import com.vishatech.erp.crm.dto.ContactResponse;
import com.vishatech.erp.crm.entity.Contact;
import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.DuplicateResourceException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.crm.repository.ContactRepository;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.crm.repository.LeadRepository;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * CRM Contacts — the real people captured by the Lead form.
 *
 * A contact row is a MIRROR of one person: the primary contact person of a lead
 * (or of a client-created contact), or its secondary contact. The module never
 * invents contacts: a role with no data produces no row, and every write path
 * keeps exactly one row per {@code (lead, contact_type)} pair.
 *
 *   Lead create/update  → {@link #syncFromLead(Lead)} upserts the lead's two
 *                         contacts (never duplicates, never loses data).
 *   Lead conversion     → {@link #linkLeadContactsToClient(Long, Long)} attaches
 *                         the SAME rows to the resulting client, so the person
 *                         is one record carrying both references.
 *   Client linking      → {@link #linkContactsToClient(List, Long)} attaches the
 *                         contacts an operator picked in the client form.
 *
 * Nothing here deletes a lead, a client or their data: the only rows this
 * service removes are the contact mirrors it owns (and a mirror is only removed
 * when the lead side has been cleared AND the contact was never linked to a
 * client).
 */
@Service
public class ContactService {

    private static final Set<String> STATUSES = Set.of(
            Contact.STATUS_ACTIVE, Contact.STATUS_INACTIVE, Contact.STATUS_ARCHIVED, Contact.STATUS_DELETED);

    private static final Set<String> TYPES = Set.of(Contact.TYPE_PRIMARY, Contact.TYPE_SECONDARY);

    /** "LEAD-000123" / "lead 123" → the lead id the search is really asking for. */
    private static final Pattern LEAD_REF = Pattern.compile("(?i)^\\s*lead[-\\s]*0*(\\d+)\\s*$");

    /** "CL-0001" → the client code the search is really asking for. */
    private static final Pattern CLIENT_REF = Pattern.compile("(?i)^\\s*cl[-\\s]*0*(\\d+)\\s*$");

    private final ContactRepository contactRepository;
    private final LeadRepository leadRepository;
    private final CustomerRepository customerRepository;

    public ContactService(ContactRepository contactRepository,
                          LeadRepository leadRepository,
                          CustomerRepository customerRepository) {
        this.contactRepository = contactRepository;
        this.leadRepository = leadRepository;
        this.customerRepository = customerRepository;
    }

    // ============================== Read ==============================

    @Transactional(readOnly = true)
    public Page<ContactResponse> list(int page, int size, String search, String sort,
                                      String contactType, String status, Long leadId, Long clientId,
                                      String association) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(size, 1), 200);
        Pageable pageable = PageRequest.of(safePage, safeSize, buildSort(sort));
        Specification<Contact> spec = buildSpecification(search, contactType, status, leadId, clientId, association);
        return contactRepository.findAll(spec, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public ContactResponse get(Long id) {
        return toResponse(find(id));
    }

    /** KPI counts for the Contacts list — every number is a real COUNT(*). */
    @Transactional(readOnly = true)
    public Map<String, Object> stats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        long active = contactRepository.countByStatus(Contact.STATUS_ACTIVE);
        long inactive = contactRepository.countByStatus(Contact.STATUS_INACTIVE);
        long archived = contactRepository.countByStatus(Contact.STATUS_ARCHIVED);
        long deleted = contactRepository.countByStatus(Contact.STATUS_DELETED);
        stats.put("active", active);
        stats.put("inactive", inactive);
        stats.put("archived", archived);
        stats.put("deleted", deleted);
        stats.put("primary", contactRepository.countByContactType(Contact.TYPE_PRIMARY));
        stats.put("secondary", contactRepository.countByContactType(Contact.TYPE_SECONDARY));
        stats.put("leadLinked", contactRepository.countByLeadIsNotNullAndStatusNot(Contact.STATUS_DELETED));
        stats.put("clientLinked", contactRepository.countByClientIsNotNullAndStatusNot(Contact.STATUS_DELETED));
        stats.put("leadOnly", contactRepository.countByLeadIsNotNullAndClientIsNullAndStatusNot(Contact.STATUS_DELETED));
        stats.put("total", active + inactive + archived + deleted);
        return stats;
    }

    /** The contacts of one lead (its primary and secondary person, when captured). */
    @Transactional(readOnly = true)
    public List<ContactResponse> forLead(Long leadId) {
        return contactRepository.findByLeadIdOrderByIdAsc(leadId).stream().map(this::toResponse).toList();
    }

    // ============================== Write ==============================

    @Transactional
    public ContactResponse create(ContactRequest request) {
        String type = normalizeType(request.contactType());
        Lead lead = resolveLead(request.leadId());
        Customer client = resolveClient(request.clientId());
        if (lead != null) {
            // A lead owns at most one contact per role: creating a second primary
            // contact for the same lead would split one person across two rows.
            Optional<Contact> existing = contactRepository.findByLeadIdAndContactType(lead.getId(), type);
            if (existing.isPresent()) {
                throw new DuplicateResourceException(
                        "This lead already has a " + type.toLowerCase() + " contact.");
            }
        }
        Contact contact = new Contact();
        contact.setName(trim(request.name()));
        contact.setDesignation(trim(request.designation()));
        contact.setPhone(trim(request.phone()));
        contact.setEmail(trim(request.email()));
        contact.setContactType(type);
        contact.setBusinessName(trim(request.businessName()));
        contact.setLead(lead);
        contact.setClient(client);
        contact.setStatus(normalizeStatus(request.status(), Contact.STATUS_ACTIVE));
        contact.setSource(lead != null ? "Lead" : "Manual");
        return toResponse(contactRepository.save(contact));
    }

    @Transactional
    public ContactResponse update(Long id, ContactRequest request) {
        Contact contact = find(id);
        String type = normalizeType(request.contactType());
        Lead lead = resolveLead(request.leadId());
        Customer client = resolveClient(request.clientId());
        if (lead != null) {
            // Moving/renaming a contact type must not collide with the lead's
            // other contact of the same role.
            contactRepository.findByLeadIdAndContactType(lead.getId(), type)
                    .filter(other -> !other.getId().equals(contact.getId()))
                    .ifPresent(other -> {
                        throw new DuplicateResourceException(
                                "This lead already has a " + type.toLowerCase() + " contact.");
                    });
        }
        contact.setName(trim(request.name()));
        contact.setDesignation(trim(request.designation()));
        contact.setPhone(trim(request.phone()));
        contact.setEmail(trim(request.email()));
        contact.setContactType(type);
        contact.setBusinessName(trim(request.businessName()));
        contact.setLead(lead);
        contact.setClient(client);
        // A record edited in the module keeps the status the user chose, unless
        // it was sitting in the trash (an edited record belongs back in the list).
        if (request.status() != null && !request.status().isBlank()) {
            contact.setStatus(normalizeStatus(request.status(), contact.getStatus()));
        } else if (Contact.STATUS_DELETED.equals(contact.getStatus())) {
            contact.setStatus(Contact.STATUS_ACTIVE);
        }
        if (contact.getSource() == null) {
            contact.setSource(lead != null ? "Lead" : "Manual");
        }
        return toResponse(contactRepository.save(contact));
    }

    /** Trash (soft delete) — the row stays and can be restored, like every CRM list. */
    @Transactional
    public void delete(Long id) {
        Contact contact = find(id);
        contact.setStatus(Contact.STATUS_DELETED);
        contactRepository.save(contact);
    }

    @Transactional
    public void archive(Long id) {
        setStatus(id, Contact.STATUS_ARCHIVED);
    }

    @Transactional
    public void restore(Long id) {
        setStatus(id, Contact.STATUS_ACTIVE);
    }

    @Transactional
    public void permanentDelete(Long id) {
        contactRepository.delete(find(id));
    }

    @Transactional
    public void setStatus(Long id, String status) {
        Contact contact = find(id);
        contact.setStatus(normalizeStatus(status, Contact.STATUS_ACTIVE));
        contactRepository.save(contact);
    }

    @Transactional
    public List<Long> bulkStatus(List<Long> ids, String status) {
        if (ids == null || ids.isEmpty()) {
            throw new BadRequestException("No contacts selected.");
        }
        List<Long> changed = new ArrayList<>();
        for (Long id : ids) {
            setStatus(id, status);
            changed.add(id);
        }
        return changed;
    }

    @Transactional
    public List<Long> bulkPermanentDelete(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new BadRequestException("No contacts selected.");
        }
        List<Long> changed = new ArrayList<>();
        for (Long id : ids) {
            permanentDelete(id);
            changed.add(id);
        }
        return changed;
    }

    // ====================== Lead ↔ client integration ======================

    /**
     * Mirror a lead's captured contacts (primary + secondary) into the module.
     *
     * Idempotent by design: each role is matched through
     * {@code (lead_id, contact_type)}, so saving a lead any number of times
     * updates the same two rows instead of appending duplicates. A role the lead
     * does not carry produces NO row (no fabricated contacts), and a mirrored row
     * is only removed when the lead side was cleared and the contact never became
     * a client contact.
     *
     * @return the number of contacts created or updated
     */
    @Transactional
    public int syncFromLead(Lead lead) {
        if (lead == null || lead.getId() == null) {
            return 0;
        }
        int changed = 0;
        changed += syncRole(lead, Contact.TYPE_PRIMARY, lead.getName(), lead.getTitle(), lead.getPhone(), lead.getEmail());
        changed += syncRole(lead, Contact.TYPE_SECONDARY, lead.getSecondaryName(), null,
                lead.getSecondaryPhone(), lead.getSecondaryEmail());
        return changed;
    }

    private int syncRole(Lead lead, String type, String name, String designation, String phone, String email) {
        String cleanName = trim(name);
        Optional<Contact> existing = contactRepository.findByLeadIdAndContactType(lead.getId(), type);
        if (cleanName == null || cleanName.isEmpty()) {
            // The lead no longer carries this person. Remove the mirror only when
            // it is still lead-only: a contact that already belongs to a client
            // is real client data and must survive the lead being edited.
            if (existing.isPresent() && existing.get().getClient() == null) {
                contactRepository.delete(existing.get());
                return 1;
            }
            return 0;
        }
        Contact contact = existing.orElseGet(Contact::new);
        boolean created = contact.getId() == null;
        if (created) {
            contact.setLead(lead);
            contact.setContactType(type);
            contact.setSource("Lead");
            contact.setStatus(Contact.STATUS_ACTIVE);
        }
        // The lead is the source of truth for the fields it captures; the
        // business name is refreshed from the lead as well so the list grouping
        // stays correct after the lead is renamed.
        contact.setName(cleanName);
        contact.setDesignation(trim(designation));
        contact.setPhone(trim(phone));
        contact.setEmail(trim(email));
        contact.setBusinessName(firstNonBlank(lead.getBusinessName(), lead.getCompany()));
        contactRepository.save(contact);
        return 1;
    }

    /**
     * Attach a lead's contacts to the client the lead converted into. The SAME
     * rows are linked (client reference added), so conversion never duplicates a
     * contact and the person keeps both its lead and client references.
     *
     * @return the number of contacts linked
     */
    @Transactional
    public int linkLeadContactsToClient(Long leadId, Long clientId) {
        if (leadId == null || clientId == null) {
            return 0;
        }
        Customer client = resolveClient(clientId);
        if (client == null) {
            return 0;
        }
        int linked = 0;
        for (Contact contact : contactRepository.findByLeadIdOrderByIdAsc(leadId)) {
            if (contact.getClient() == null || !clientId.equals(contact.getClient().getId())) {
                contact.setClient(client);
                if (Contact.STATUS_DELETED.equals(contact.getStatus())) {
                    contact.setStatus(Contact.STATUS_ACTIVE);
                }
                contactRepository.save(contact);
                linked++;
            }
        }
        return linked;
    }

    /**
     * Attach contacts the operator picked in the client form to that client.
     * Only contacts that are not already linked to this client are written.
     *
     * @return the number of contacts linked
     */
    @Transactional
    public int linkContactsToClient(List<Long> contactIds, Long clientId) {
        if (contactIds == null || contactIds.isEmpty() || clientId == null) {
            return 0;
        }
        Customer client = resolveClient(clientId);
        if (client == null) {
            throw new ResourceNotFoundException("Client not found with id: " + clientId);
        }
        int linked = 0;
        for (Long contactId : contactIds) {
            if (contactId == null) continue;
            Contact contact = contactRepository.findById(contactId)
                    .orElseThrow(() -> new ResourceNotFoundException("Contact not found with id: " + contactId));
            if (contact.getClient() != null && clientId.equals(contact.getClient().getId())) {
                continue;
            }
            contact.setClient(client);
            if (Contact.STATUS_DELETED.equals(contact.getStatus())) {
                contact.setStatus(Contact.STATUS_ACTIVE);
            }
            contactRepository.save(contact);
            linked++;
        }
        return linked;
    }

    /**
     * Detach every contact of a client that is being removed, so no row keeps a
     * dangling client reference. Contacts themselves (and their leads) survive.
     *
     * @return the number of contacts detached
     */
    @Transactional
    public int unlinkClient(Long clientId) {
        if (clientId == null) {
            return 0;
        }
        int unlinked = 0;
        for (Contact contact : contactRepository.findByClientIdOrderByIdAsc(clientId)) {
            contact.setClient(null);
            contactRepository.save(contact);
            unlinked++;
        }
        return unlinked;
    }

    /**
     * Create the missing contact mirrors for leads that already exist.
     *
     * Idempotent and additive: it walks the real lead rows and runs the same
     * upsert the lead save path uses, so a second run changes nothing. No lead,
     * client or contact row is ever deleted by this pass, and a lead without
     * contact details produces no contact at all.
     *
     * @return the number of contact rows created or updated
     */
    @Transactional
    public int backfillFromLeads() {
        int changed = 0;
        int page = 0;
        int size = 200;
        Page<Lead> batch;
        do {
            batch = leadRepository.findAll(PageRequest.of(page, size, Sort.by("id")));
            for (Lead lead : batch.getContent()) {
                changed += syncFromLead(lead);
            }
            page++;
        } while (batch.hasNext());
        return changed;
    }

    // ============================== Internals ==============================

    private Contact find(Long id) {
        return contactRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Contact not found with id: " + id));
    }

    private Lead resolveLead(Long leadId) {
        if (leadId == null) {
            return null;
        }
        return leadRepository.findById(leadId)
                .orElseThrow(() -> new ResourceNotFoundException("Lead not found with id: " + leadId));
    }

    private Customer resolveClient(Long clientId) {
        if (clientId == null) {
            return null;
        }
        return customerRepository.findById(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client not found with id: " + clientId));
    }

    private Specification<Contact> buildSpecification(String search, String contactType, String status,
                                                      Long leadId, Long clientId, String association) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();

            // Trash stays out of the default list: Deleted contacts are reachable
            // through the Deleted tab (which passes status=Deleted explicitly).
            String normalizedStatus = trim(status);
            if (normalizedStatus != null && !normalizedStatus.isEmpty()) {
                predicates.add(cb.equal(cb.lower(root.get("status")), normalizedStatus.toLowerCase()));
            } else {
                predicates.add(cb.notEqual(cb.lower(root.get("status")), Contact.STATUS_DELETED.toLowerCase()));
            }

            String type = trim(contactType);
            if (type != null && !type.isEmpty()) {
                predicates.add(cb.equal(cb.lower(root.get("contactType")), type.toLowerCase()));
            }
            if (leadId != null) {
                predicates.add(cb.equal(root.get("lead").get("id"), leadId));
            }
            if (clientId != null) {
                predicates.add(cb.equal(root.get("client").get("id"), clientId));
            }
            // association: lead / client / standalone — the real relationship
            // state, which is exactly what this module exists to show.
            String assoc = trim(association);
            if (assoc != null && !assoc.isEmpty()) {
                switch (assoc.toLowerCase()) {
                    case "lead" -> predicates.add(cb.isNotNull(root.get("lead")));
                    case "client" -> predicates.add(cb.isNotNull(root.get("client")));
                    case "standalone" -> predicates.add(cb.and(
                            cb.isNull(root.get("lead")), cb.isNull(root.get("client"))));
                    default -> { /* unknown value: no extra restriction */ }
                }
            }

            String term = trim(search);
            if (term != null && !term.isEmpty()) {
                String like = "%" + term.toLowerCase() + "%";
                List<Predicate> matches = new ArrayList<>();
                for (String field : new String[]{"name", "businessName", "phone", "email", "designation"}) {
                    matches.add(cb.like(cb.lower(cb.coalesce(root.get(field), "")), like));
                }
                // Associated lead / client fields — the same columns the list shows.
                matches.add(cb.like(cb.lower(cb.coalesce(root.join("lead", JoinType.LEFT).get("name"), "")), like));
                matches.add(cb.like(cb.lower(cb.coalesce(root.join("lead", JoinType.LEFT).get("businessName"), "")), like));
                matches.add(cb.like(cb.lower(cb.coalesce(root.join("lead", JoinType.LEFT).get("company"), "")), like));
                matches.add(cb.like(cb.lower(cb.coalesce(root.join("client", JoinType.LEFT).get("businessName"), "")), like));
                matches.add(cb.like(cb.lower(cb.coalesce(root.join("client", JoinType.LEFT).get("clientCode"), "")), like));
                matches.add(cb.like(cb.lower(cb.coalesce(root.join("client", JoinType.LEFT).get("contactPerson"), "")), like));

                // "LEAD-000123" / "CL-0001" are what the user actually sees in
                // the table, so those references must be searchable even though
                // the stored values are the numeric ids / codes.
                Matcher leadRef = LEAD_REF.matcher(term);
                if (leadRef.matches()) {
                    matches.add(cb.equal(root.get("lead").get("id"), Long.valueOf(leadRef.group(1))));
                }
                Matcher clientRef = CLIENT_REF.matcher(term);
                if (clientRef.matches()) {
                    matches.add(cb.like(cb.lower(cb.coalesce(root.join("client", JoinType.LEFT).get("clientCode"), "")),
                            "%" + clientRef.group(1) + "%"));
                }
                predicates.add(cb.or(matches.toArray(new Predicate[0])));
            }

            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Sort buildSort(String sort) {
        if (sort == null || sort.isBlank()) {
            return Sort.by(Sort.Direction.DESC, "createdAt");
        }
        String[] parts = sort.split(",");
        // The list also sorts by the associated records the table shows, which
        // are nested properties on the contact — Spring Data/Hibernate resolve
        // the join for us, so "Associated Lead/Client" sort on the real names.
        String mapped = switch (parts[0]) {
            case "name", "businessName", "designation", "phone", "email", "status", "contactType" -> parts[0];
            case "leadName" -> "lead.name";
            case "leadBusinessName" -> "lead.businessName";
            case "clientName" -> "client.businessName";
            case "clientCode" -> "client.clientCode";
            case "date", "createdAt" -> "createdAt";
            case "updatedAt" -> "updatedAt";
            default -> "createdAt";
        };
        boolean asc = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]);
        return Sort.by(asc ? Sort.Direction.ASC : Sort.Direction.DESC, mapped);
    }

    private String normalizeType(String value) {
        String type = trim(value);
        if (type == null || type.isEmpty()) {
            return Contact.TYPE_PRIMARY;
        }
        for (String candidate : TYPES) {
            if (candidate.equalsIgnoreCase(type)) {
                return candidate;
            }
        }
        throw new BadRequestException("Invalid contact type: " + value);
    }

    private String normalizeStatus(String value, String fallback) {
        String status = trim(value);
        if (status == null || status.isEmpty()) {
            return fallback;
        }
        for (String candidate : STATUSES) {
            if (candidate.equalsIgnoreCase(status)) {
                return candidate;
            }
        }
        throw new BadRequestException("Invalid contact status: " + value);
    }

    private static String trim(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            String trimmed = trim(value);
            if (trimmed != null) return trimmed;
        }
        return null;
    }

    ContactResponse toResponse(Contact contact) {
        Lead lead = contact.getLead();
        Customer client = contact.getClient();
        return new ContactResponse(
                contact.getId(),
                contact.getName(),
                contact.getDesignation(),
                contact.getPhone(),
                contact.getEmail(),
                contact.getContactType(),
                contact.getBusinessName(),
                lead == null ? null : lead.getId(),
                lead == null ? null : lead.getName(),
                lead == null ? null : firstNonBlank(lead.getBusinessName(), lead.getCompany()),
                lead == null || lead.getStage() == null ? null : label(lead.getStage().name()),
                client == null ? null : client.getId(),
                client == null ? null : client.getClientCode(),
                client == null ? null : client.getBusinessName(),
                contact.getStatus(),
                contact.getSource(),
                contact.getCreatedAt() == null ? null : contact.getCreatedAt().toString(),
                contact.getUpdatedAt() == null ? null : contact.getUpdatedAt().toString()
        );
    }

    /** Enum labels are shown capitalized ("Won", "Proposal Sent") exactly as the CRM does. */
    private static String label(String enumName) {
        if (enumName == null) return null;
        String lower = enumName.toLowerCase().replace('_', ' ');
        StringBuilder out = new StringBuilder();
        for (String word : lower.split(" ")) {
            if (word.isEmpty()) continue;
            if (!out.isEmpty()) out.append(' ');
            out.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return out.toString();
    }
}
