package com.vishatech.erp.crm.repository;

import com.vishatech.erp.crm.entity.FollowUp;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FollowUpRepository extends JpaRepository<FollowUp, Long>, JpaSpecificationExecutor<FollowUp> {

    @Query("SELECT f FROM FollowUp f WHERE f.leadId = :leadId")
    List<FollowUp> findByLeadId(@Param("leadId") Long leadId);

    // History for one lead, newest follow-up date first (id desc breaks ties).
    @Query("SELECT f FROM FollowUp f WHERE f.leadId = :leadId AND f.status <> 'Deleted' "
            + "ORDER BY f.followupDate DESC, f.id DESC")
    List<FollowUp> findByLeadIdOrderByFollowupDateDesc(@Param("leadId") Long leadId);

    // History for one client, newest follow-up date first (id desc breaks ties).
    @Query("SELECT f FROM FollowUp f WHERE f.clientId = :clientId AND f.status <> 'Deleted' "
            + "ORDER BY f.followupDate DESC, f.id DESC")
    List<FollowUp> findByClientIdOrderByFollowupDateDesc(@Param("clientId") Long clientId);

    // Active follow-ups for the given leads/clients — used to compute the latest
    // follow-up date+time per group (evaluated together, not just the date).
    @Query("SELECT f FROM FollowUp f WHERE f.status <> 'Deleted' AND f.leadId IN :leadIds")
    List<FollowUp> findActiveByLeadIdIn(@Param("leadIds") java.util.Collection<Long> leadIds);

    @Query("SELECT f FROM FollowUp f WHERE f.status <> 'Deleted' AND f.clientId IN :clientIds")
    List<FollowUp> findActiveByClientIdIn(@Param("clientIds") java.util.Collection<Long> clientIds);

    // Quotation-scoped follow-ups for a whole page of quotations, newest first.
    // Used to show the real Follow-up Status in the Quotation list with ONE
    // query per page instead of one query per row.
    @Query("SELECT f FROM FollowUp f WHERE f.status <> 'Deleted' AND f.quotationId IN :quotationIds "
            + "ORDER BY f.followupDate DESC, f.id DESC")
    List<FollowUp> findActiveByQuotationIdIn(@Param("quotationIds") java.util.Collection<Long> quotationIds);

    // ---- Dashboard workflow counts (Deleted rows are excluded everywhere) ----

    @Query("SELECT COUNT(f) FROM FollowUp f WHERE f.status <> 'Deleted'")
    long countActive();

    @Query("SELECT COUNT(f) FROM FollowUp f WHERE f.status = :status AND f.status <> 'Deleted'")
    long countActiveByStatus(@Param("status") String status);

    @Query("SELECT COUNT(f) FROM FollowUp f WHERE f.status = 'Open' "
            + "AND f.nextFollowupDate IS NOT NULL AND f.nextFollowupDate < :today")
    long countOpenOverdue(@Param("today") java.time.LocalDate today);
}
