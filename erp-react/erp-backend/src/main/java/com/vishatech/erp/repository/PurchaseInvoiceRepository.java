package com.vishatech.erp.repository;

import com.vishatech.erp.entity.PurchaseInvoice;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PurchaseInvoiceRepository
        extends JpaRepository<PurchaseInvoice, Long>, JpaSpecificationExecutor<PurchaseInvoice> {

    Optional<PurchaseInvoice> findByInvoiceNo(String invoiceNo);

    boolean existsByInvoiceNo(String invoiceNo);

    List<PurchaseInvoice> findByVendorAndVendorInvoiceNo(String vendor, String vendorInvoiceNo);

    List<PurchaseInvoice> findByPoNo(String poNo);

    // ------------------------------------------------------------------
    // Work queue / dashboard — counted directly in the database.
    // ------------------------------------------------------------------

    /** Invoices in one lifecycle status (Submitted = awaiting approval). */
    long countByStatus(String status);

    /** Invoices in one lifecycle status, newest first. */
    List<PurchaseInvoice> findByStatusOrderByIdDesc(String status);

    /** Bounded newest-first invoices for work-queue item payloads. */
    List<PurchaseInvoice> findByStatusOrderByIdDesc(String status, Pageable pageable);

    /** Invoices in one match status (Pending Match / Mismatch = matching queue). */
    long countByMatchStatus(String matchStatus);

    /** Invoices in one match status, newest first. */
    List<PurchaseInvoice> findByMatchStatusOrderByIdDesc(String matchStatus);

    /** Invoices carrying one payment-advice status (Issued / Sent). */
    long countByAdviceStatus(String adviceStatus);

    /** Invoices in any of the given match statuses, newest first. */
    List<PurchaseInvoice> findByMatchStatusInOrderByIdDesc(List<String> matchStatuses);

    /** Bounded newest-first invoices for work-queue item payloads. */
    List<PurchaseInvoice> findByMatchStatusInOrderByIdDesc(List<String> matchStatuses, Pageable pageable);

    /** Invoices in any of the given match statuses. */
    long countByMatchStatusIn(List<String> matchStatuses);

    /**
     * Payments-due queue — invoices whose three-way match passed but that
     * still carry an outstanding balance (not fully paid). Mirrors the
     * frontend's isPaymentPending gate at the database level.
     */
    @Query("""
            SELECT i FROM PurchaseInvoice i
            WHERE i.matchStatus = 'Matched'
              AND (i.paidAmount IS NULL OR i.paidAmount <= 0)
              AND i.status IN ('Approved', 'Partially Paid', 'Overdue')
            ORDER BY i.id DESC
            """)
    List<PurchaseInvoice> findPaymentsDue();

    /** Bounded payments-due rows for work-queue item payloads. */
    @Query("""
            SELECT i FROM PurchaseInvoice i
            WHERE i.matchStatus = 'Matched'
              AND (i.paidAmount IS NULL OR i.paidAmount <= 0)
              AND i.status IN ('Approved', 'Partially Paid', 'Overdue')
            ORDER BY i.id DESC
            """)
    List<PurchaseInvoice> findPaymentsDue(Pageable pageable);

    @Query("""
            SELECT COUNT(i) FROM PurchaseInvoice i
            WHERE i.matchStatus = 'Matched'
              AND (i.paidAmount IS NULL OR i.paidAmount <= 0)
              AND i.status IN ('Approved', 'Partially Paid', 'Overdue')
            """)
    long countPaymentsDue();

    /**
     * Overdue payments — payments-due invoices whose due date has passed.
     */
    @Query("""
            SELECT i FROM PurchaseInvoice i
            WHERE i.matchStatus = 'Matched'
              AND (i.paidAmount IS NULL OR i.paidAmount <= 0)
              AND i.status IN ('Approved', 'Partially Paid', 'Overdue')
              AND i.dueDate IS NOT NULL
              AND i.dueDate <> ''
              AND i.dueDate < :today
            ORDER BY i.id DESC
            """)
    List<PurchaseInvoice> findPaymentsOverdue(@Param("today") String today);

    @Query("""
            SELECT COUNT(i) FROM PurchaseInvoice i
            WHERE i.matchStatus = 'Matched'
              AND (i.paidAmount IS NULL OR i.paidAmount <= 0)
              AND i.status IN ('Approved', 'Partially Paid', 'Overdue')
              AND i.dueDate IS NOT NULL
              AND i.dueDate <> ''
              AND i.dueDate < :today
            """)
    long countPaymentsOverdue(@Param("today") String today);

    /**
     * Overdue invoices carrying a balance — the invoice module's own overdue
     * figure (any status, due date passed, outstanding > 0). This is the number
     * the Vendor Payment "Overdue" tab shows, so the dashboard card uses the
     * same rule instead of the rarely-set lifecycle status.
     */
    @Query("""
            SELECT COUNT(i) FROM PurchaseInvoice i
            WHERE i.dueDate IS NOT NULL
              AND i.dueDate <> ''
              AND i.dueDate < :today
              AND (i.total - COALESCE(i.paidAmount, 0)) > 0
            """)
    long countOverdueInvoicesWithBalance(@Param("today") String today);

    /** Outstanding value of overdue invoices, aggregated by MySQL. */
    @Query("""
            SELECT COALESCE(SUM(i.total - COALESCE(i.paidAmount, 0)), 0)
            FROM PurchaseInvoice i
            WHERE i.matchStatus = 'Matched'
              AND (i.paidAmount IS NULL OR i.paidAmount <= 0)
              AND i.status IN ('Approved', 'Partially Paid', 'Overdue')
              AND i.dueDate IS NOT NULL
              AND i.dueDate <> ''
              AND i.dueDate < :today
            """)
    java.math.BigDecimal sumPaymentsOverdue(@Param("today") String today);

    /** Total invoice count. */
    long countBy();
}
