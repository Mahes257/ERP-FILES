package com.vishatech.erp.config;

import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.PurchaseInvoice;
import com.vishatech.erp.repository.PurchaseInvoiceRepository;
import com.vishatech.erp.service.PurchaseNotificationPublisher;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.logging.Logger;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Daily payment reminder scheduler for the Purchase module.
 *
 * Reuses the EXISTING scheduler infrastructure ({@code @EnableScheduling}
 * is already active via NotificationScheduler) and the EXISTING
 * NotificationService — this component only scans the payments-due set
 * once a day and publishes PAYMENT_DUE / PAYMENT_OVERDUE events through
 * PurchaseNotificationPublisher.
 *
 * Deduplication is handled by the publisher (one notification per
 * module/reference/type/recipient), so an invoice is announced once per
 * lifecycle stage even though the scheduler runs every day:
 *   - a due invoice gets PAYMENT_DUE once,
 *   - when its due date passes it additionally gets PAYMENT_OVERDUE once.
 */
@Component
public class PurchasePaymentReminderScheduler {

    private static final Logger log = Logger.getLogger(PurchasePaymentReminderScheduler.class.getName());

    private final PurchaseInvoiceRepository invoices;
    private final PurchaseNotificationPublisher notifications;

    public PurchasePaymentReminderScheduler(PurchaseInvoiceRepository invoices,
                                            PurchaseNotificationPublisher notifications) {
        this.invoices = invoices;
        this.notifications = notifications;
    }

    /** Daily at 08:00 server time. */
    @Scheduled(cron = "${app.purchase.payment-reminder-cron:0 0 8 * * *}")
    public void publishPaymentReminders() {
        try {
            String today = LocalDate.now().toString();
            List<PurchaseInvoice> due = invoices.findPaymentsDue();
            for (PurchaseInvoice invoice : due) {
                boolean overdue = invoice.getDueDate() != null && !invoice.getDueDate().isBlank()
                        && invoice.getDueDate().compareTo(today) < 0;
                if (overdue) {
                    notifications.publish(PurchaseNotificationPublisher.EVENT_PAYMENT_OVERDUE,
                            "Payment overdue: " + invoice.getInvoiceNo(),
                            "Invoice " + invoice.getInvoiceNo() + " from " + invoice.getVendor()
                                    + " was due on " + invoice.getDueDate()
                                    + " — outstanding " + outstanding(invoice) + " " + currency(invoice) + ".",
                            invoice.getId(), "PurchaseInvoice", Notification.Priority.URGENT);
                } else {
                    notifications.publish(PurchaseNotificationPublisher.EVENT_PAYMENT_DUE,
                            "Payment due: " + invoice.getInvoiceNo(),
                            "Invoice " + invoice.getInvoiceNo() + " from " + invoice.getVendor()
                                    + " is due on " + invoice.getDueDate()
                                    + " — outstanding " + outstanding(invoice) + " " + currency(invoice) + ".",
                            invoice.getId(), "PurchaseInvoice");
                }
            }
        } catch (Exception e) {
            // A reminder scan failure must never break the application.
            log.warning("Purchase payment reminder scan failed: " + e.getMessage());
        }
    }

    private BigDecimal outstanding(PurchaseInvoice invoice) {
        BigDecimal paid = invoice.getPaidAmount() == null ? BigDecimal.ZERO : invoice.getPaidAmount();
        BigDecimal total = invoice.getTotal() == null ? BigDecimal.ZERO : invoice.getTotal();
        return total.subtract(paid).max(BigDecimal.ZERO);
    }

    private String currency(PurchaseInvoice invoice) {
        return invoice.getCurrency() == null || invoice.getCurrency().isBlank()
                ? "INR" : invoice.getCurrency();
    }
}
