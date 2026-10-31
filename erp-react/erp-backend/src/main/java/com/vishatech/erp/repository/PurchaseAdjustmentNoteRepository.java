package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseAdjustmentNote;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PurchaseAdjustmentNoteRepository extends JpaRepository<PurchaseAdjustmentNote, Long> {
    Optional<PurchaseAdjustmentNote> findByNoteNo(String noteNo);

    @Query("SELECT n FROM PurchaseAdjustmentNote n WHERE " +
           "LOWER(n.noteNo) LIKE LOWER(CONCAT('%',:q,'%')) OR " +
           "LOWER(n.invoiceNo) LIKE LOWER(CONCAT('%',:q,'%')) OR " +
           "LOWER(n.vendor) LIKE LOWER(CONCAT('%',:q,'%')) OR " +
           "LOWER(n.reason) LIKE LOWER(CONCAT('%',:q,'%')) OR " +
           "LOWER(n.reference) LIKE LOWER(CONCAT('%',:q,'%'))")
    Page<PurchaseAdjustmentNote> search(@Param("q") String q, Pageable p);

    Page<PurchaseAdjustmentNote> findByStatus(String status, Pageable p);

    @Query("SELECT n FROM PurchaseAdjustmentNote n WHERE n.status = :status AND (" +
           "LOWER(n.noteNo) LIKE LOWER(CONCAT('%',:q,'%')) OR " +
           "LOWER(n.invoiceNo) LIKE LOWER(CONCAT('%',:q,'%')) OR " +
           "LOWER(n.vendor) LIKE LOWER(CONCAT('%',:q,'%')) OR " +
           "LOWER(n.reason) LIKE LOWER(CONCAT('%',:q,'%')))")
    Page<PurchaseAdjustmentNote> searchWithStatus(@Param("q") String q, @Param("status") String status, Pageable p);

    long countByStatus(String status);
}
