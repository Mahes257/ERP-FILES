package com.vishatech.erp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.PurchaseRfq;
import com.vishatech.erp.entity.PurchaseRfqFollowUp;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.exception.ResourceNotFoundException;
import com.vishatech.erp.repository.PurchaseRfqFollowUpRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PurchaseRfqFollowUpService {
    private final PurchaseRfqFollowUpRepository repository;
    private final PurchaseRfqRepository rfqRepository;
    private final ObjectMapper mapper;

    public PurchaseRfqFollowUpService(PurchaseRfqFollowUpRepository repository,
                                      PurchaseRfqRepository rfqRepository,
                                      ObjectMapper mapper) {
        this.repository = repository;
        this.rfqRepository = rfqRepository;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> list() {
        return repository.findAllByOrderByIdDesc().stream().map(this::response).toList();
    }

    @Transactional
    public Map<String, Object> create(Map<String, Object> request) {
        String rfqNo = text(request, "rfqNo");
        PurchaseRfq rfq = rfqRepository.findByRfqNo(rfqNo)
                .orElseThrow(() -> new BadRequestException("Select an existing RFQ for the follow-up"));
        String followUpNo = text(request, "followUpNo");
        if (followUpNo.isBlank()) followUpNo = nextNumber();
        if (repository.existsByFollowUpNo(followUpNo)) {
            throw new BadRequestException("Follow-up number already exists");
        }
        PurchaseRfqFollowUp followUp = new PurchaseRfqFollowUp();
        followUp.setFollowUpNo(followUpNo);
        followUp.setRfqNo(rfqNo);
        apply(followUp, request, rfq);
        return response(repository.save(followUp));
    }

    @Transactional
    public Map<String, Object> update(String id, Map<String, Object> request) {
        PurchaseRfqFollowUp followUp = find(id);
        PurchaseRfq rfq = rfqRepository.findByRfqNo(followUp.getRfqNo())
                .orElseThrow(() -> new ResourceNotFoundException("RFQ not found"));
        apply(followUp, request, rfq);
        return response(repository.save(followUp));
    }

    @Transactional
    public Map<String, Object> setState(String id, String state) {
        PurchaseRfqFollowUp followUp = find(id);
        followUp.setRecordState(state);
        return response(repository.save(followUp));
    }

    @Transactional
    public Map<String, Object> setWorkflowStatus(String id, String status) {
        PurchaseRfqFollowUp followUp = find(id);
        followUp.setWorkflowStatus(status);
        return response(repository.save(followUp));
    }

    private PurchaseRfqFollowUp find(String id) {
        try {
            return repository.findById(Long.valueOf(id)).orElseThrow(() -> new ResourceNotFoundException("Follow-up not found"));
        } catch (NumberFormatException ignored) {
            return repository.findByFollowUpNo(id).orElseThrow(() -> new ResourceNotFoundException("Follow-up not found"));
        }
    }

    private void apply(PurchaseRfqFollowUp followUp, Map<String, Object> request, PurchaseRfq rfq) {
        String vendor = text(request, "vendor");
        followUp.setVendor(vendor.isBlank() ? firstVendor(rfq) : vendor);
        followUp.setType(defaultText(request, "type", "Vendor Response Pending"));
        String date = text(request, "followUpDate");
        if (date.isBlank()) throw new BadRequestException("Follow-up date is required");
        followUp.setFollowUpDate(LocalDate.parse(date));
        followUp.setFollowUpTime(defaultText(request, "followUpTime", "10:00"));
        followUp.setPriority(defaultText(request, "priority", rfq.getPriority() == null ? "Medium" : rfq.getPriority()));
        followUp.setAssignedTo(text(request, "assignedTo"));
        followUp.setNotes(text(request, "notes"));
        followUp.setReminder(Boolean.TRUE.equals(request.get("reminder")));
        if (followUp.getWorkflowStatus() == null) followUp.setWorkflowStatus("Pending");
        if (followUp.getRecordState() == null) followUp.setRecordState("active");
    }

    private Map<String, Object> response(PurchaseRfqFollowUp followUp) {
        PurchaseRfq rfq = rfqRepository.findByRfqNo(followUp.getRfqNo()).orElse(null);
        String status = displayStatus(followUp);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", followUp.getId());
        out.put("followUpNo", followUp.getFollowUpNo());
        out.put("rfqNo", followUp.getRfqNo());
        out.put("rfqId", rfq == null ? null : rfq.getId());
        out.put("rfqTitle", rfq == null ? "" : rfq.getTitle());
        out.put("rfqStatus", rfq == null ? "" : rfq.getStatus());
        out.put("requester", rfq == null ? "" : rfq.getRequester());
        out.put("vendor", followUp.getVendor());
        out.put("type", followUp.getType());
        out.put("workflowStatus", followUp.getWorkflowStatus());
        out.put("status", status);
        out.put("followUpDate", followUp.getFollowUpDate());
        out.put("dueDate", followUp.getFollowUpDate());
        out.put("nextFollowUp", followUp.getFollowUpDate());
        out.put("followUpTime", followUp.getFollowUpTime());
        out.put("priority", followUp.getPriority());
        out.put("assignedTo", followUp.getAssignedTo());
        out.put("notes", followUp.getNotes());
        out.put("reminder", followUp.getReminder());
        out.put("recordState", followUp.getRecordState());
        out.put("lastContact", followUp.getLastContact());
        out.put("createdAt", followUp.getCreatedAt());
        out.put("updatedAt", followUp.getUpdatedAt());
        return out;
    }

    private String displayStatus(PurchaseRfqFollowUp followUp) {
        if ("Completed".equals(followUp.getWorkflowStatus())) return "Completed";
        if ("Cancelled".equals(followUp.getWorkflowStatus())) return "Cancelled";
        if (followUp.getFollowUpDate().isBefore(LocalDate.now())) return "Overdue";
        if (followUp.getFollowUpDate().isEqual(LocalDate.now())) return "Due Today";
        return "Upcoming";
    }

    public Map<String, Object> stats() {
        List<Map<String, Object>> records = list();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", records.size());
        out.put("active", records.stream().filter(r -> "active".equals(r.get("recordState"))).count());
        out.put("archived", records.stream().filter(r -> "archived".equals(r.get("recordState"))).count());
        out.put("deleted", records.stream().filter(r -> "deleted".equals(r.get("recordState"))).count());
        out.put("pending", records.stream().filter(r -> "active".equals(r.get("recordState")) && "Pending".equals(r.get("workflowStatus"))).count());
        out.put("overdue", countStatus(records, "Overdue"));
        out.put("dueToday", countStatus(records, "Due Today"));
        out.put("upcoming", countStatus(records, "Upcoming"));
        out.put("completed", countStatus(records, "Completed"));
        return out;
    }

    private long countStatus(List<Map<String, Object>> records, String status) {
        return records.stream().filter(r -> "active".equals(r.get("recordState")) && status.equals(r.get("status"))).count();
    }

    private String nextNumber() {
        int year = LocalDate.now().getYear();
        int max = repository.findAll().stream()
                .map(PurchaseRfqFollowUp::getFollowUpNo)
                .mapToInt(value -> {
                    try {
                        String prefix = "FU-" + year + "-";
                        return value.startsWith(prefix) ? Integer.parseInt(value.substring(prefix.length())) : 0;
                    } catch (NumberFormatException ignored) { return 0; }
                }).max().orElse(0);
        return String.format("FU-%d-%04d", year, max + 1);
    }

    private String firstVendor(PurchaseRfq rfq) {
        try {
            List<String> vendors = mapper.readValue(rfq.getVendorNamesJson(), new TypeReference<>() {});
            return vendors.isEmpty() ? "" : vendors.get(0);
        } catch (Exception ignored) {
            return "";
        }
    }

    private String text(Map<String, Object> request, String key) {
        Object value = request == null ? null : request.get(key);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String defaultText(Map<String, Object> request, String key, String fallback) {
        String value = text(request, key);
        return value.isBlank() ? fallback : value;
    }
}
