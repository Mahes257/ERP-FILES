package com.vishatech.erp.crm.repository;

import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.crm.entity.LeadStage;
import com.vishatech.erp.crm.entity.LeadStatus;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LeadRepository extends JpaRepository<Lead, Long>, JpaSpecificationExecutor<Lead> {
    long countByStatus(LeadStatus status);

    /**
     * Same read as {@link #findById(Object)}, but takes a PESSIMISTIC_WRITE row
     * lock on the lead for the caller's transaction.
     *
     * <p>Used by {@code LeadService.close}: two concurrent close requests
     * serialize on the row, so the second one observes the already-closed lead
     * and returns it unchanged instead of recording the close (and its audit
     * entry) twice.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT l FROM Lead l WHERE l.id = :id")
    Optional<Lead> findByIdForUpdate(@Param("id") Long id);
    long countByStatusIn(java.util.List<LeadStatus> statuses);
    long countByStage(LeadStage stage);
    long countByStageIn(java.util.List<LeadStage> stages);

    // Location-master delete protection: how many leads reference a location.
    long countByCountryIgnoreCase(String country);

    long countByStateIgnoreCase(String state);

    long countByCityIgnoreCase(String city);
}
