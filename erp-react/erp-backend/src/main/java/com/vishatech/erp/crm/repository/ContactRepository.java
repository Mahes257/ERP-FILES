package com.vishatech.erp.crm.repository;

import com.vishatech.erp.crm.entity.Contact;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * Contacts are queried by their REAL relationships: a lead's own contacts are
 * found through the lead's id, a client's through the client's id, and the
 * lead sync uses the (lead, contact_type) key so re-saving a lead can only ever
 * update the one row that mirrors that contact — never add a second one.
 */
public interface ContactRepository extends JpaRepository<Contact, Long>, JpaSpecificationExecutor<Contact> {

    Optional<Contact> findByLeadIdAndContactType(Long leadId, String contactType);

    List<Contact> findByLeadIdOrderByIdAsc(Long leadId);

    List<Contact> findByClientIdOrderByIdAsc(Long clientId);

    long countByStatus(String status);

    long countByStatusNot(String status);

    long countByContactType(String contactType);

    long countByLeadIsNotNullAndStatusNot(String status);

    long countByClientIsNotNullAndStatusNot(String status);

    long countByLeadIsNotNullAndClientIsNullAndStatusNot(String status);
}
