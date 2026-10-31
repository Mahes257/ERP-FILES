package com.vishatech.erp.service;

import com.vishatech.erp.entity.Notification;
import com.vishatech.erp.entity.PurchaseAttachment;
import com.vishatech.erp.entity.PurchaseTimeline;
import com.vishatech.erp.entity.User;
import com.vishatech.erp.repository.PurchaseAttachmentRepository;
import com.vishatech.erp.repository.PurchaseTimelineRepository;
import com.vishatech.erp.util.AuditContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Shared Purchase support service — the one place that:
 *
 *  - appends audit/timeline entries for every Purchase document type
 *    (stamped with the authenticated user via the existing AuditContext),
 *  - reads a document's activity feed in the frontend's contract shape
 *    ({id, date, user, action, oldValue, newValue, ip, device, remarks}),
 *  - builds attachment response payloads for the frontend's attachment
 *    contract ({id, name, size, type, downloadUrl, uploadedAt, uploadedBy}),
 *  - pushes WebSocket notifications over the EXISTING STOMP
 *    infrastructure (/ws → /user/queue/purchase).
 *
 * REUSE: AuditContext, SimpMessagingTemplate, ObjectMapper — nothing new
 * is invented for identity, websockets, or JSON.
 *
 * <p>The mirror of every timeline entry into the shared {@code audit_logs}
 * table is delegated to {@link PurchaseCentralAuditWriter}, which owns that
 * write's transaction boundary (P1). This class only decides <em>when</em> the
 * mirror runs — after the business transaction has committed — and applies the
 * best-effort policy.
 */
@Service
public class PurchaseSupportService {

    private static final Logger LOG = Logger.getLogger(PurchaseSupportService.class.getName());

    public static final String DOC_PR = "PR";
    public static final String DOC_RFQ = "RFQ";
    public static final String DOC_VENDOR = "VENDOR";
    public static final String DOC_PO = "PO";
    public static final String DOC_INVOICE = "INVOICE";

    public record PurchaseActivityEntry(
            Long id,
            String date,
            String user,
            String action,
            String oldValue,
            String newValue,
            String ip,
            String device,
            String remarks) {
    }

    public record PurchaseAttachmentPayload(
            Long id,
            String name,
            long size,
            String type,
            String downloadUrl,
            String fileUrl,
            String dataUrl,
            String uploadedAt,
            String uploadedBy) {
    }

    private final PurchaseTimelineRepository timelineRepository;
    private final PurchaseAttachmentRepository attachmentRepository;
    private final AuditContext auditContext;
    private final SimpMessagingTemplate messagingTemplate;
    private final PurchaseCentralAuditWriter centralAuditWriter;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PurchaseSupportService(PurchaseTimelineRepository timelineRepository,
                                  PurchaseAttachmentRepository attachmentRepository,
                                  AuditContext auditContext,
                                  SimpMessagingTemplate messagingTemplate,
                                  PurchaseCentralAuditWriter centralAuditWriter) {
        this.timelineRepository = timelineRepository;
        this.attachmentRepository = attachmentRepository;
        this.auditContext = auditContext;
        this.messagingTemplate = messagingTemplate;
        this.centralAuditWriter = centralAuditWriter;
    }

    // ------------------------------------------------------------------
    // Timeline
    // ------------------------------------------------------------------

    /** Appends an activity entry for the given document. */
    @Transactional(propagation = Propagation.REQUIRED)
    public void log(String docType, Long docId, String type, String label, String note) {
        log(docType, docId, type, label, note, null, null);
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void log(String docType, Long docId, String type, String label, String note,
                    String oldValue, String newValue) {
        PurchaseTimeline entry = new PurchaseTimeline();
        entry.setDocType(docType);
        entry.setDocId(docId);
        entry.setType(type);
        entry.setLabel(label);
        entry.setNote(note);
        entry.setOldValue(oldValue);
        entry.setNewValue(newValue);
        User user = auditContext.currentUser();
        entry.setActor(auditContext.currentUserName());
        entry.setTimestamp(LocalDateTime.now());
        entry.setUserId(user == null ? null : user.getId());
        entry.setUserName(auditContext.currentUserName());
        entry.setUserRole(auditContext.currentUserRole());
        entry.setIpAddress(auditContext.ipAddress());
        String device = auditContext.deviceInfo();
        entry.setDeviceInfo(device != null && device.length() > 500 ? device.substring(0, 500) : device);
        timelineRepository.save(entry);
        mirrorToCentralAudit(entry.getDocType(), entry.getDocId(), entry.getType(),
                entry.getLabel(), entry.getOldValue(), entry.getNewValue());
    }

    /**
     * Mirrors a Purchase timeline entry into the shared {@code audit_logs} table
     * <b>after this transaction commits</b>, in a transaction of its own.
     *
     * <p>This is the correction of the previous behaviour, which is why it is
     * written as an explicit two-step policy rather than a bare call:
     *
     * <ol>
     *   <li><b>After commit.</b> A transaction synchronization runs the mirror in
     *       {@code afterCommit}, so the audit row only ever describes a Purchase
     *       action that really persisted. If this transaction rolls back, no
     *       audit row is written at all.</li>
     *   <li><b>Own transaction.</b> {@link PurchaseCentralAuditWriter#write} is
     *       {@code REQUIRES_NEW}, so a persistence failure in the audit insert
     *       rolls back only the audit transaction and can never mark this
     *       business transaction rollback-only. Previously the audit call
     *       participated in this transaction ({@code REQUIRED}) and a failed
     *       insert poisoned the business commit even though the exception was
     *       caught.</li>
     * </ol>
     *
     * <p><b>What is guaranteed, and what is not.</b> Guaranteed: an audit-mirror
     * failure never rolls back, and never silently fails, a Purchase business
     * transaction — it is logged and the operation stands. Not guaranteed: that
     * the mirror always lands. It is a best-effort mirror of
     * {@code purchase_timelines}, which stays the authoritative Purchase trail;
     * if the process dies between commit and mirror, or the mirror fails, the
     * audit row is missing (and logged), not invented.
     */
    private void mirrorToCentralAudit(String docType, Long docId, String type, String label,
                                      String oldValue, String newValue) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            // No transaction to hook (never happens through log(), which is
            // @Transactional, but keeps a direct call correct): mirror straight
            // away — still in the writer's own transaction.
            writeCentralAudit(docType, docId, type, label, oldValue, newValue);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                writeCentralAudit(docType, docId, type, label, oldValue, newValue);
            }
        });
    }

    /** Best-effort wrapper: the mirror may fail, the business operation may not. */
    private void writeCentralAudit(String docType, Long docId, String type, String label,
                                   String oldValue, String newValue) {
        try {
            centralAuditWriter.write(docType, docId, type, label, oldValue, newValue);
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, "Central audit mirror failed for " + docType + "-" + docId
                    + "; the Purchase timeline entry was still written and the business "
                    + "transaction was not affected", e);
        }
    }

    /** Reads the activity feed of a document in the frontend contract shape. */
    @Transactional(readOnly = true)
    public List<PurchaseActivityEntry> activity(String docType, Long docId) {
        return timelineRepository.findByDocTypeAndDocIdOrderByTimestampAscIdAsc(docType, docId).stream()
                .map(entry -> new PurchaseActivityEntry(
                        entry.getId(),
                        entry.getTimestamp() == null ? null : entry.getTimestamp().toString(),
                        entry.getActor() == null ? entry.getUserName() : entry.getActor(),
                        entry.getLabel(),
                        entry.getOldValue() == null ? "" : entry.getOldValue(),
                        entry.getNewValue() == null ? "" : entry.getNewValue(),
                        entry.getIpAddress() == null ? "" : entry.getIpAddress(),
                        entry.getDeviceInfo() == null ? "" : entry.getDeviceInfo(),
                        entry.getNote() == null ? "" : entry.getNote()))
                .toList();
    }

    // ------------------------------------------------------------------
    // Attachments
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<PurchaseAttachmentPayload> attachments(String docType, Long docId) {
        return attachmentRepository.findByDocTypeAndDocIdOrderByIdAsc(docType, docId).stream()
                .map(this::attachmentPayload)
                .toList();
    }

    public PurchaseAttachmentPayload attachmentPayload(PurchaseAttachment attachment) {
        String uploadedAt = attachment.getUploadedAt() == null ? null : attachment.getUploadedAt().toString();
        return new PurchaseAttachmentPayload(
                attachment.getId(),
                attachment.getName(),
                attachment.getSize(),
                attachment.getContentType(),
                attachment.getUrl(),
                attachment.getUrl(),
                attachment.getUrl(),
                uploadedAt,
                attachment.getUploadedBy());
    }

    // ------------------------------------------------------------------
    // Notifications (existing WebSocket + NotificationService infra)
    // ------------------------------------------------------------------

    /**
     * Pushes a Purchase workflow notification to the user over the
     * existing STOMP user queue. Never throws — WebSocket absence is
     * not a business failure (same policy as NotificationService).
     */
    public void pushWorkflowEvent(Long recipientUserId, String title, String message,
                                  String module, Long referenceId, String referenceType) {
        if (recipientUserId == null) {
            return;
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("title", title);
            payload.put("message", message);
            payload.put("module", module);
            payload.put("referenceId", referenceId);
            payload.put("referenceType", referenceType);
            payload.put("priority", Notification.Priority.NORMAL.name());
            payload.put("createdAt", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            messagingTemplate.convertAndSendToUser(
                    String.valueOf(recipientUserId),
                    "/queue/purchase",
                    payload);
        } catch (Exception ignored) {
            // WebSocket may not be connected — REST remains the source of truth.
        }
    }

    /** Parses a stored JSON column; returns null when absent or malformed. */
    public JsonNode parseJson(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    /** Serializes a value to JSON for storage in a JSON text column. */
    public String writeJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    /** Converts a JsonNode array to a List of Maps (for response DTOs). */
    public List<Map<String, Object>> jsonToList(String json) {
        JsonNode node = parseJson(json);
        List<Map<String, Object>> result = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(entry -> result.add(objectMapper.convertValue(entry, Map.class)));
        }
        return result;
    }

    /** Converts a JsonNode object to a Map (for embedded objects). */
    public Map<String, Object> jsonToMap(String json) {
        JsonNode node = parseJson(json);
        return node == null || !node.isObject() ? null : objectMapper.convertValue(node, Map.class);
    }
}
