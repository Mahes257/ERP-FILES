package com.vishatech.erp.config;

import com.vishatech.erp.entity.CreditNote;
import com.vishatech.erp.entity.Invoice;
import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.PaymentReceipt;
import com.vishatech.erp.entity.Quotation;
import com.vishatech.erp.entity.SalesContract;
import com.vishatech.erp.entity.SalesOrder;
import com.vishatech.erp.repository.CreditNoteRepository;
import com.vishatech.erp.repository.InvoiceRepository;
import com.vishatech.erp.repository.PaymentReceiptRepository;
import com.vishatech.erp.repository.QuotationRepository;
import com.vishatech.erp.repository.SalesContractRepository;
import com.vishatech.erp.repository.SalesOrderRepository;
import com.vishatech.erp.service.SalesNotificationPublisher;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.function.Function;
import java.util.logging.Logger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Sales notification sweep — turns the real Sales state into notifications.
 *
 * <h2>Why a sweep and not a hook in every service</h2>
 *
 * Sales documents reach their workflow state through several write paths:
 * create-with-status, the revision-style update, the status transition endpoint,
 * approval, and conversion. Sprinkling notification calls into those paths would
 * touch Sales business logic in a dozen places and still miss a path. The state
 * itself, however, is unambiguous — "this quotation is submitted", "this
 * contract is under review", "this invoice is past its due date" — so this job
 * detects it and asks {@link SalesNotificationPublisher} to deliver it, which
 * reuses the existing scheduler infrastructure ({@code @EnableScheduling} is
 * declared by {@link NotificationScheduler}) and the existing notification
 * service.
 *
 * <h2>Lifecycle</h2>
 *
 * Detection is state-based, so the lifecycle follows the business automatically:
 * a pending document notifies once (the publisher deduplicates per record, event
 * and recipient), an approved/rejected/cancelled document stops being detected,
 * an expiring quotation stops notifying once it is accepted/rejected/expired, and
 * an overdue invoice stops once it is paid or cancelled. Nothing is deleted, so
 * the inbox history and read state survive.
 *
 * <p>Only documents in a real workflow state are ever notified — there is no
 * invented status, and a preference that is OFF produces nothing because the
 * publisher checks it before any recipient lookup.
 */
@Component
public class SalesNotificationSweepScheduler {

    private static final Logger log =
            Logger.getLogger(SalesNotificationSweepScheduler.class.getName());

    /** Quotation statuses that count as "awaiting approval". */
    private static final Set<String> QUOTATION_PENDING = Set.of("submitted", "pending approval");
    /** Quotation statuses that can still expire (a closed quotation cannot). */
    private static final Set<String> QUOTATION_OPEN = Set.of("sent", "submitted", "pending approval");
    /** Sales Contract statuses the approval queue accepts. */
    private static final Set<String> CONTRACT_PENDING = Set.of("submitted", "under review");
    /** Customer Purchase Order statuses that count as awaiting approval. */
    private static final Set<String> ORDER_PENDING = Set.of("pending review", "pending approval");
    /** Credit Note statuses that count as awaiting approval. */
    private static final Set<String> CREDIT_NOTE_PENDING = Set.of("pending approval", "submitted");
    /** Invoice statuses in which a passed due date is no longer an issue. */
    private static final Set<String> INVOICE_SETTLED =
            Set.of("paid", "cancelled", "deleted", "archived");

    /** How far ahead a quotation counts as "expiring" (days). */
    private static final int EXPIRING_WINDOW_DAYS = 3;

    /**
     * Every quotation status that can still produce a notification. The sweep
     * queries only these (and only CURRENT revisions), instead of loading the
     * whole quotation table and discarding closed rows in Java.
     */
    private static final List<String> QUOTATION_SWEEP_STATUSES =
            List.of("sent", "submitted", "pending approval", "accepted");

    /**
     * Rows handled per query round-trip, and the maximum number of rounds one
     * detector runs per sweep. A backlog larger than batch-size x max-batches
     * drains on subsequent runs instead of holding the scheduler thread and a
     * database connection for an unbounded time.
     */
    private final int batchSize;
    private final int maxBatches;

    private final QuotationRepository quotations;
    private final SalesContractRepository contracts;
    private final SalesOrderRepository orders;
    private final CreditNoteRepository creditNotes;
    private final InvoiceRepository invoices;
    private final PaymentReceiptRepository receipts;
    private final SalesNotificationPublisher publisher;

    public SalesNotificationSweepScheduler(QuotationRepository quotations,
                                           SalesContractRepository contracts,
                                           SalesOrderRepository orders,
                                           CreditNoteRepository creditNotes,
                                           InvoiceRepository invoices,
                                           PaymentReceiptRepository receipts,
                                           SalesNotificationPublisher publisher,
                                           @Value("${app.notification.sweep-batch-size:200}") int batchSize,
                                           @Value("${app.notification.sweep-max-batches:5}") int maxBatches) {
        this.quotations = quotations;
        this.contracts = contracts;
        this.orders = orders;
        this.creditNotes = creditNotes;
        this.invoices = invoices;
        this.receipts = receipts;
        this.publisher = publisher;
        this.batchSize = Math.max(1, batchSize);
        this.maxBatches = Math.max(1, maxBatches);
    }

    /** Every 5 minutes by default; each detector is independent. */
    @Scheduled(fixedDelayString = "${app.sales.notification-sweep-interval-ms:300000}")
    public void sweep() {
        runQuietly("quotations", this::sweepQuotations);
        runQuietly("sales contracts", this::sweepContracts);
        runQuietly("customer purchase orders", this::sweepOrders);
        runQuietly("credit notes", this::sweepCreditNotes);
        runQuietly("invoices", this::sweepInvoices);
        runQuietly("payment receipts", this::sweepReceipts);
    }

    // ── Quotations: pending approval, expiring, accepted ──────────────────

    private void sweepQuotations() {
        LocalDate today = LocalDate.now();
        LocalDate soon = today.plusDays(EXPIRING_WINDOW_DAYS);
        forEachCandidate(
                page -> quotations.findSweepCandidates(QUOTATION_SWEEP_STATUSES, page),
                quotation -> {
                    if (!isCurrent(quotation)) {
                        return;
                    }
                    String status = lower(quotation.getStatus());
                    if (QUOTATION_PENDING.contains(status)) {
                        publisher.publish(SalesNotificationPublisher.EVENT_QUOTATION_PENDING,
                                "Quotation " + quotation.getQuotationNo() + " awaiting approval",
                                "Quotation " + quotation.getQuotationNo()
                                        + clientSuffix(quotation.getClientName())
                                        + " is awaiting the approval decision.",
                                quotation.getId(), "Quotation");
                    }
                    if ("accepted".equals(status)) {
                        publisher.publish(SalesNotificationPublisher.EVENT_QUOTATION_ACCEPTED,
                                "Quotation " + quotation.getQuotationNo() + " accepted",
                                "Quotation " + quotation.getQuotationNo()
                                        + clientSuffix(quotation.getClientName())
                                        + " was accepted by the customer.",
                                quotation.getId(), "Quotation");
                    }
                    if (QUOTATION_OPEN.contains(status) && quotation.getValidUntil() != null) {
                        LocalDate validUntil = quotation.getValidUntil().toLocalDate();
                        if (!validUntil.isBefore(today) && !validUntil.isAfter(soon)) {
                            publisher.publish(SalesNotificationPublisher.EVENT_QUOTATION_EXPIRING,
                                    "Quotation " + quotation.getQuotationNo() + " expiring",
                                    "Quotation " + quotation.getQuotationNo()
                                            + clientSuffix(quotation.getClientName())
                                            + " is valid until " + validUntil + ".",
                                    quotation.getId(), "Quotation",
                                    Notification.Priority.HIGH);
                        }
                    }
                });
    }

    // ── Sales contracts ──────────────────────────────────────────────────

    private void sweepContracts() {
        forEachCandidate(
                page -> contracts.findSweepCandidates(CONTRACT_PENDING, page),
                contract -> {
                    if (!isCurrent(contract)) {
                        return;
                    }
                    if (!CONTRACT_PENDING.contains(lower(contract.getStatus()))) {
                        return;
                    }
                    publisher.publish(SalesNotificationPublisher.EVENT_CONTRACT_PENDING,
                            "Sales contract " + contract.getScNo() + " awaiting approval",
                            "Sales contract " + contract.getScNo()
                                    + clientSuffix(contract.getClientName())
                                    + " is awaiting the approval decision.",
                            contract.getId(), "SalesContract");
                });
    }

    // ── Customer purchase orders (Sales Orders) ──────────────────────────

    private void sweepOrders() {
        forEachCandidate(
                page -> orders.findSweepCandidates(ORDER_PENDING, page),
                order -> {
                    if (!isCurrent(order)) {
                        return;
                    }
                    if (!ORDER_PENDING.contains(lower(order.getStatus()))) {
                        return;
                    }
                    publisher.publish(SalesNotificationPublisher.EVENT_ORDER_PENDING,
                            "Customer PO " + order.getSoNo() + " awaiting approval",
                            "Customer purchase order " + order.getSoNo()
                                    + clientSuffix(order.getClientName())
                                    + " is awaiting the approval decision.",
                            order.getId(), "SalesOrder");
                });
    }

    // ── Credit notes ─────────────────────────────────────────────────────

    private void sweepCreditNotes() {
        forEachCandidate(
                page -> creditNotes.findSweepCandidates(CREDIT_NOTE_PENDING, page),
                note -> {
                    if (!isCurrent(note)) {
                        return;
                    }
                    if (!CREDIT_NOTE_PENDING.contains(lower(note.getStatus()))) {
                        return;
                    }
                    publisher.publish(SalesNotificationPublisher.EVENT_CREDIT_NOTE_PENDING,
                            "Credit note " + note.getCnNo() + " awaiting approval",
                            "Credit note " + note.getCnNo()
                                    + clientSuffix(note.getClientName())
                                    + " is awaiting the approval decision.",
                            note.getId(), "CreditNote");
                });
    }

    // ── Invoices ─────────────────────────────────────────────────────────

    private void sweepInvoices() {
        LocalDate today = LocalDate.now();
        forEachCandidate(
                page -> invoices.findOverdueSweepCandidates(today.atStartOfDay(), page),
                invoice -> {
                    if (!isCurrent(invoice)) {
                        return;
                    }
                    String status = lower(invoice.getStatus());
                    if (INVOICE_SETTLED.contains(status)) {
                        return;
                    }
                    LocalDateTime dueDate = invoice.getDueDate();
                    if (dueDate == null || !dueDate.toLocalDate().isBefore(today)) {
                        return;
                    }
                    publisher.publish(SalesNotificationPublisher.EVENT_INVOICE_OVERDUE,
                            "Invoice " + invoice.getInvoiceNo() + " overdue",
                            "Invoice " + invoice.getInvoiceNo()
                                    + clientSuffix(invoice.getClientName())
                                    + " was due on " + dueDate.toLocalDate() + " and is still "
                                    + invoice.getStatus() + ".",
                            invoice.getId(), "Invoice", Notification.Priority.HIGH);
                });
    }

    // ── Payment receipts ─────────────────────────────────────────────────

    private void sweepReceipts() {
        forEachCandidate(
                receipts::findReceivedSweepCandidates,
                receipt -> {
                    if (!isCurrent(receipt)) {
                        return;
                    }
                    // A draft receipt is not a received payment.
                    if (!"received".equals(lower(receipt.getStatus()))) {
                        return;
                    }
                    publisher.publish(SalesNotificationPublisher.EVENT_PAYMENT_RECEIVED,
                            "Payment " + receipt.getReceiptNo() + " received",
                            "Payment of " + receipt.getAmount()
                                    + clientSuffix(receipt.getClientName())
                                    + " was recorded against receipt " + receipt.getReceiptNo() + ".",
                            receipt.getId(), "PaymentReceipt");
                });
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /**
     * Runs one detector over at most {@code batchSize x maxBatches} candidate
     * rows, loading each page with a fresh query. The candidate queries are
     * filtered in SQL, so a closed or superseded document is never fetched.
     */
    private <T> void forEachCandidate(Function<Pageable, List<T>> loader,
                                      java.util.function.Consumer<T> action) {
        for (int round = 0; round < maxBatches; round++) {
            List<T> batch = loader.apply(PageRequest.of(round, batchSize));
            for (T row : batch) {
                action.accept(row);
            }
            if (batch.size() < batchSize) {
                return;
            }
        }
    }

    /**
     * Revision-aware documents are notified for their current row only, so an
     * edit that creates revision N+1 does not re-announce the document the
     * approval queue already knows about.
     */
    private static boolean isCurrent(Quotation quotation) {
        return quotation.isLatestRevision() && !"deleted".equals(lower(quotation.getStatus()))
                && !"archived".equals(lower(quotation.getStatus()));
    }

    private static boolean isCurrent(SalesContract contract) {
        return contract.isLatestRevision() && !"deleted".equals(lower(contract.getStatus()))
                && !"archived".equals(lower(contract.getStatus()));
    }

    private static boolean isCurrent(SalesOrder order) {
        return order.isLatestRevision() && !"deleted".equals(lower(order.getStatus()))
                && !"archived".equals(lower(order.getStatus()));
    }

    private static boolean isCurrent(CreditNote note) {
        return note.isLatestRevision() && !"deleted".equals(lower(note.getStatus()))
                && !"archived".equals(lower(note.getStatus()));
    }

    private static boolean isCurrent(Invoice invoice) {
        return invoice.isLatestRevision() && !"deleted".equals(lower(invoice.getStatus()))
                && !"archived".equals(lower(invoice.getStatus()));
    }

    private static boolean isCurrent(PaymentReceipt receipt) {
        return receipt.isLatestRevision() && !"deleted".equals(lower(receipt.getStatus()))
                && !"archived".equals(lower(receipt.getStatus()));
    }

    private static String lower(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private static String clientSuffix(String clientName) {
        return clientName == null || clientName.isBlank() ? "" : " (" + clientName + ")";
    }

    private void runQuietly(String what, Runnable task) {
        try {
            task.run();
        } catch (Exception e) {
            // One broken detector must never stop the others or the app.
            log.warning("Sales notification sweep failed for " + what + ": " + e.getMessage());
        }
    }

    /** Exposed for the sweep's own tests. */
    static List<String> detectedEvents() {
        return List.of(
                SalesNotificationPublisher.EVENT_QUOTATION_PENDING,
                SalesNotificationPublisher.EVENT_QUOTATION_EXPIRING,
                SalesNotificationPublisher.EVENT_QUOTATION_ACCEPTED,
                SalesNotificationPublisher.EVENT_CONTRACT_PENDING,
                SalesNotificationPublisher.EVENT_ORDER_PENDING,
                SalesNotificationPublisher.EVENT_INVOICE_OVERDUE,
                SalesNotificationPublisher.EVENT_PAYMENT_RECEIVED,
                SalesNotificationPublisher.EVENT_CREDIT_NOTE_PENDING);
    }
}
