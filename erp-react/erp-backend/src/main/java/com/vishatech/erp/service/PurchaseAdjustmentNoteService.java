package com.vishatech.erp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.PurchaseAdjustmentNote;
import com.vishatech.erp.entity.PurchaseAdjustmentNoteItem;
import com.vishatech.erp.entity.PurchaseInvoice;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.PurchaseAdjustmentNoteRepository;
import com.vishatech.erp.repository.PurchaseInvoiceRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class PurchaseAdjustmentNoteService {

    private final PurchaseAdjustmentNoteRepository noteRepository;
    private final PurchaseInvoiceRepository invoiceRepository;
    private final ObjectMapper objectMapper;

    public PurchaseAdjustmentNoteService(PurchaseAdjustmentNoteRepository noteRepository,
                                         PurchaseInvoiceRepository invoiceRepository,
                                         ObjectMapper objectMapper) {
        this.noteRepository = noteRepository;
        this.invoiceRepository = invoiceRepository;
        this.objectMapper = objectMapper;
    }

    public Page<Map<String, Object>> list(int page, int size, String search, String status, String sort) {
        PageRequest pageRequest = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<PurchaseAdjustmentNote> notes;
        
        if ((search == null || search.isBlank()) && (status == null || status.isBlank())) {
            notes = noteRepository.findAll(pageRequest);
        } else if (status == null || status.isBlank()) {
            notes = noteRepository.search(search, pageRequest);
        } else if (search == null || search.isBlank()) {
            notes = noteRepository.findByStatus(status, pageRequest);
        } else {
            notes = noteRepository.searchWithStatus(search, status, pageRequest);
        }
        
        return notes.map(this::toMap);
    }

    public Map<String, Object> get(Long id) {
        PurchaseAdjustmentNote note = noteRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Adjustment note not found"));
        return toMap(note);
    }

    public Map<String, Object> getByNoteNo(String noteNo) {
        PurchaseAdjustmentNote note = noteRepository.findByNoteNo(noteNo)
            .orElseThrow(() -> new ResourceNotFoundException("Adjustment note not found"));
        return toMap(note);
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> body) {
        String noteType = normalizeNoteType((String) body.get("noteType"));
        if (noteType == null) {
            throw new BadRequestException("Invalid note type: must be Credit or Debit");
        }

        Long invoiceId = toLong(body.get("invoiceId"));
        if (invoiceId == null) {
            throw new BadRequestException("Invoice ID is required");
        }

        PurchaseInvoice invoice = invoiceRepository.findById(invoiceId)
            .orElseThrow(() -> new ResourceNotFoundException("Invoice not found"));

        String reason = (String) body.get("reason");
        if (reason == null || reason.isBlank()) {
            throw new BadRequestException("Reason is required");
        }

        // Calculate totals from items
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        BigDecimal amount = BigDecimal.ZERO;
        BigDecimal gst = BigDecimal.ZERO;
        
        if (items != null && !items.isEmpty()) {
            for (Map<String, Object> item : items) {
                BigDecimal qty = toBigDecimal(item.get("qty"));
                BigDecimal rate = toBigDecimal(item.get("rate"));
                BigDecimal gstRate = toBigDecimal(item.get("gstRate"));
                
                BigDecimal lineAmount = qty.multiply(rate);
                BigDecimal lineGst = lineAmount.multiply(gstRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
                
                amount = amount.add(lineAmount);
                gst = gst.add(lineGst);
            }
        } else {
            amount = toBigDecimal(body.get("amount"));
            gst = toBigDecimal(body.get("gst"));
        }

        BigDecimal discount = toBigDecimal(body.get("discount"));
        BigDecimal charges = toBigDecimal(body.get("charges"));
        BigDecimal freight = toBigDecimal(body.get("freight"));
        BigDecimal total = amount.add(gst).subtract(discount).add(charges).add(freight);

        // Generate note number
        String noteNo = generateNoteNo(noteType);

        // Create note
        PurchaseAdjustmentNote note = new PurchaseAdjustmentNote();
        note.setNoteNo(noteNo);
        note.setNoteType(noteType);  // already normalized to 'Credit' or 'Debit'
        note.setStatus((String) body.getOrDefault("status", "Draft"));
        note.setInvoiceId(invoiceId);
        note.setInvoiceNo(invoice.getInvoiceNo());
        note.setPoNo(invoice.getPoNo());
        note.setVendor(invoice.getVendor());
        note.setVendorEmail(invoice.getVendorEmail());
        note.setCurrency(invoice.getCurrency());
        
        String noteDateStr = (String) body.get("noteDate");
        note.setNoteDate(noteDateStr != null ? LocalDate.parse(noteDateStr) : LocalDate.now());
        
        note.setReason(reason);
        note.setReference((String) body.get("reference"));
        note.setNotes((String) body.get("notes"));
        note.setGstType(invoice.getGstType());
        note.setDiscount(discount);
        note.setCharges(charges);
        note.setFreight(freight);
        note.setAmount(amount);
        note.setGst(gst);
        note.setTotal(total);
        note.setAllowExcess(Boolean.TRUE.equals(body.get("allowExcess")));

        // Add items
        if (items != null && !items.isEmpty()) {
            List<PurchaseAdjustmentNoteItem> noteItems = new ArrayList<>();
            for (Map<String, Object> item : items) {
                PurchaseAdjustmentNoteItem noteItem = new PurchaseAdjustmentNoteItem();
                noteItem.setAdjustmentNote(note);
                noteItem.setProduct((String) item.get("product"));
                noteItem.setHsn((String) item.get("hsn"));
                noteItem.setUom((String) item.get("uom"));
                noteItem.setQty(toBigDecimal(item.get("qty")));
                noteItem.setRate(toBigDecimal(item.get("rate")));
                noteItem.setGstRate(toBigDecimal(item.get("gstRate")));
                noteItem.setDiscount(toBigDecimal(item.get("discount")));
                noteItems.add(noteItem);
            }
            note.setItems(noteItems);
        }

        // Audit history
        List<Map<String, Object>> auditHistory = new ArrayList<>();
        Map<String, Object> auditEntry = new HashMap<>();
        auditEntry.put("action", "created");
        auditEntry.put("actor", "System");
        auditEntry.put("timestamp", new Date().toString());
        auditEntry.put("details", Map.of("noteType", noteType, "value", total));
        auditHistory.add(auditEntry);
        note.setApprovalHistoryJson(toJson(auditHistory));

        PurchaseAdjustmentNote saved = noteRepository.save(note);
        return toMap(saved);
    }

    @Transactional
    public Map<String, Object> update(Long id, Map<String, Object> body) {
        PurchaseAdjustmentNote note = noteRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Adjustment note not found"));

        if (!"Draft".equals(note.getStatus())) {
            throw new BadRequestException("Only Draft notes can be edited");
        }

        if (body.containsKey("reason")) note.setReason((String) body.get("reason"));
        if (body.containsKey("reference")) note.setReference((String) body.get("reference"));
        if (body.containsKey("notes")) note.setNotes((String) body.get("notes"));
        if (body.containsKey("discount")) note.setDiscount(toBigDecimal(body.get("discount")));
        if (body.containsKey("charges")) note.setCharges(toBigDecimal(body.get("charges")));
        if (body.containsKey("freight")) note.setFreight(toBigDecimal(body.get("freight")));

        if (body.containsKey("items")) {
            List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
            note.getItems().clear();
            if (items != null) {
                for (Map<String, Object> item : items) {
                    PurchaseAdjustmentNoteItem noteItem = new PurchaseAdjustmentNoteItem();
                    noteItem.setAdjustmentNote(note);
                    noteItem.setProduct((String) item.get("product"));
                    noteItem.setHsn((String) item.get("hsn"));
                    noteItem.setUom((String) item.get("uom"));
                    noteItem.setQty(toBigDecimal(item.get("qty")));
                    noteItem.setRate(toBigDecimal(item.get("rate")));
                    noteItem.setGstRate(toBigDecimal(item.get("gstRate")));
                    noteItem.setDiscount(toBigDecimal(item.get("discount")));
                    note.getItems().add(noteItem);
                }
            }
            recalculateTotals(note);
        }

        PurchaseAdjustmentNote saved = noteRepository.save(note);
        return toMap(saved);
    }

    @Transactional
    public void delete(Long id) {
        PurchaseAdjustmentNote note = noteRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Adjustment note not found"));
        if (!"Draft".equals(note.getStatus())) {
            throw new BadRequestException("Only Draft notes can be deleted");
        }
        noteRepository.deleteById(id);
    }

    @Transactional
    public Map<String, Object> submit(Long id) {
        PurchaseAdjustmentNote note = noteRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Adjustment note not found"));
        if (!"Draft".equals(note.getStatus())) {
            throw new BadRequestException("Only Draft notes can be submitted");
        }
        note.setStatus("Submitted");
        addAuditEntry(note, "submitted");
        PurchaseAdjustmentNote saved = noteRepository.save(note);
        return toMap(saved);
    }

    @Transactional
    public Map<String, Object> approve(Long id, String comments) {
        PurchaseAdjustmentNote note = noteRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Adjustment note not found"));
        if (!"Submitted".equals(note.getStatus())) {
            throw new BadRequestException("Only Submitted notes can be approved");
        }
        note.setStatus("Approved");
        addAuditEntry(note, "approved", comments);
        PurchaseAdjustmentNote saved = noteRepository.save(note);
        return toMap(saved);
    }

    @Transactional
    public Map<String, Object> reject(Long id, String comments) {
        PurchaseAdjustmentNote note = noteRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Adjustment note not found"));
        if (!"Submitted".equals(note.getStatus())) {
            throw new BadRequestException("Only Submitted notes can be rejected");
        }
        note.setStatus("Rejected");
        addAuditEntry(note, "rejected", comments);
        PurchaseAdjustmentNote saved = noteRepository.save(note);
        return toMap(saved);
    }

    public Map<String, Object> stats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("total", noteRepository.count());
        stats.put("draft", noteRepository.countByStatus("Draft"));
        stats.put("submitted", noteRepository.countByStatus("Submitted"));
        stats.put("approved", noteRepository.countByStatus("Approved"));
        stats.put("rejected", noteRepository.countByStatus("Rejected"));
        return stats;
    }

    public Map<String, Object> nextNumber(String noteType) {
        String prefix = "Credit".equals(noteType) ? "PCN" : "PDN";
        String number = String.format("%s-%d-%04d", prefix, LocalDate.now().getYear(), noteRepository.count() + 1);
        return Map.of("noteNo", number);
    }

    private String generateNoteNo(String noteType) {
        String normalized = normalizeNoteType(noteType);
        String prefix = "Credit".equals(normalized) ? "PCN" : "PDN";
        return String.format("%s-%d-%04d", prefix, LocalDate.now().getYear(), noteRepository.count() + 1);
    }

    /** Accept 'Credit', 'Credit Note', 'Debit', 'Debit Note' and normalize to 'Credit'/'Debit'. */
    private String normalizeNoteType(String raw) {
        if (raw == null) return null;
        String lower = raw.trim().toLowerCase();
        if (lower.startsWith("credit")) return "Credit";
        if (lower.startsWith("debit")) return "Debit";
        return null;
    }

    private void recalculateTotals(PurchaseAdjustmentNote note) {
        BigDecimal amount = BigDecimal.ZERO;
        BigDecimal gst = BigDecimal.ZERO;
        for (PurchaseAdjustmentNoteItem item : note.getItems()) {
            BigDecimal lineAmount = item.getQty().multiply(item.getRate());
            BigDecimal lineGst = lineAmount.multiply(item.getGstRate()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            amount = amount.add(lineAmount);
            gst = gst.add(lineGst);
        }
        note.setAmount(amount);
        note.setGst(gst);
        note.setTotal(amount.add(gst)
            .subtract(note.getDiscount() != null ? note.getDiscount() : BigDecimal.ZERO)
            .add(note.getCharges() != null ? note.getCharges() : BigDecimal.ZERO)
            .add(note.getFreight() != null ? note.getFreight() : BigDecimal.ZERO));
    }

    private void addAuditEntry(PurchaseAdjustmentNote note, String action) {
        addAuditEntry(note, action, "");
    }

    private void addAuditEntry(PurchaseAdjustmentNote note, String action, String comments) {
        List<Map<String, Object>> history = parseJson(note.getApprovalHistoryJson());
        Map<String, Object> entry = new HashMap<>();
        entry.put("action", action);
        entry.put("actor", "System");
        entry.put("timestamp", new Date().toString());
        if (comments != null && !comments.isBlank()) {
            entry.put("comments", comments);
        }
        history.add(entry);
        note.setApprovalHistoryJson(toJson(history));
    }

    private Map<String, Object> toMap(PurchaseAdjustmentNote note) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", note.getId());
        map.put("noteNo", note.getNoteNo());
        map.put("noteType", note.getNoteType());
        map.put("status", note.getStatus());
        map.put("allowExcess", note.getAllowExcess());
        map.put("invoiceId", note.getInvoiceId());
        map.put("invoiceNo", note.getInvoiceNo());
        map.put("poNo", note.getPoNo());
        map.put("vendor", note.getVendor());
        map.put("vendorEmail", note.getVendorEmail());
        map.put("currency", note.getCurrency());
        map.put("noteDate", note.getNoteDate() != null ? note.getNoteDate().toString() : null);
        map.put("reason", note.getReason());
        map.put("reference", note.getReference());
        map.put("notes", note.getNotes());
        map.put("gstType", note.getGstType());
        map.put("discount", note.getDiscount());
        map.put("charges", note.getCharges());
        map.put("freight", note.getFreight());
        map.put("amount", note.getAmount());
        map.put("gst", note.getGst());
        map.put("total", note.getTotal());
        map.put("approvalHistory", parseJson(note.getApprovalHistoryJson()));
        map.put("createdAt", note.getCreatedAt() != null ? note.getCreatedAt().toString() : null);
        map.put("updatedAt", note.getUpdatedAt() != null ? note.getUpdatedAt().toString() : null);
        if (note.getItems() != null) {
            map.put("items", note.getItems().stream().map(item -> {
                Map<String, Object> itemMap = new LinkedHashMap<>();
                itemMap.put("id", item.getId());
                itemMap.put("product", item.getProduct());
                itemMap.put("hsn", item.getHsn());
                itemMap.put("uom", item.getUom());
                itemMap.put("qty", item.getQty());
                itemMap.put("rate", item.getRate());
                itemMap.put("gstRate", item.getGstRate());
                itemMap.put("discount", item.getDiscount());
                return itemMap;
            }).collect(Collectors.toList()));
        }
        return map;
    }

    private Long toLong(Object value) {
        if (value == null) return null;
        if (value instanceof Long) return (Long) value;
        if (value instanceof Number) return ((Number) value).longValue();
        try { return Long.parseLong(value.toString()); } catch (NumberFormatException e) { return null; }
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) return BigDecimal.ZERO;
        if (value instanceof BigDecimal) return (BigDecimal) value;
        if (value instanceof Number) return BigDecimal.valueOf(((Number) value).doubleValue());
        try { return new BigDecimal(value.toString()); } catch (NumberFormatException e) { return BigDecimal.ZERO; }
    }

    private String toJson(Object obj) {
        try { return objectMapper.writeValueAsString(obj); } catch (Exception e) { return "[]"; }
    }

    private List<Map<String, Object>> parseJson(String json) {
        if (json == null || json.isBlank()) return new ArrayList<>();
        try {
            return objectMapper.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }
}
