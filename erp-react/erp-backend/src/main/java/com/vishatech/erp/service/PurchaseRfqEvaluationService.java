package com.vishatech.erp.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vishatech.erp.entity.PurchaseRfq;
import com.vishatech.erp.entity.PurchaseRfqEvaluationRecord;
import com.vishatech.erp.entity.PurchaseRfqNegotiation;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.PurchaseRfqEvaluationRecordRepository;
import com.vishatech.erp.repository.PurchaseRfqNegotiationRepository;
import com.vishatech.erp.repository.PurchaseRfqRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persistence for the procurement evaluation workflow.
 *
 * <p>Serves the Technical Evaluation, Final Negotiation, Price
 * Negotiation, Supplier Selection and Selection Approval screens: the
 * complete evaluation document for an RFQ is stored in
 * {@code purchase_rfq_evaluation_records}, and every negotiation round
 * it carries is projected into {@code purchase_rfq_negotiations} so the
 * per-vendor round history is queryable.
 *
 * <p>This replaces browser-local storage as the source of truth — a
 * saved round, score or selection survives a refresh, another browser
 * and another device.
 */
@Service
public class PurchaseRfqEvaluationService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final PurchaseRfqEvaluationRecordRepository recordRepository;
    private final PurchaseRfqNegotiationRepository negotiationRepository;
    private final PurchaseRfqRepository rfqRepository;

    public PurchaseRfqEvaluationService(PurchaseRfqEvaluationRecordRepository recordRepository,
                                        PurchaseRfqNegotiationRepository negotiationRepository,
                                        PurchaseRfqRepository rfqRepository) {
        this.recordRepository = recordRepository;
        this.negotiationRepository = negotiationRepository;
        this.rfqRepository = rfqRepository;
    }

    /** Every persisted evaluation record, newest first — used to
     *  re-hydrate the evaluation pages on load. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> listRecords() {
        return recordRepository.findAllByOrderByUpdatedAtDesc().stream().map(this::toMap).toList();
    }

    /** The stored evaluation document for one RFQ (null when none yet). */
    @Transactional(readOnly = true)
    public Map<String, Object> getRecord(String reference) {
        String rfqNo = resolveRfqNo(reference);
        return recordRepository.findByRfqNo(rfqNo).map(this::toMap).orElse(null);
    }

    /** Upserts the evaluation document and re-projects its rounds. */
    @Transactional
    public Map<String, Object> saveRecord(String reference, Map<String, Object> body) {
        if (body == null) {
            throw new BadRequestException("Evaluation payload is required");
        }
        String rfqNo = resolveRfqNo(reference);
        PurchaseRfqEvaluationRecord entity = recordRepository.findByRfqNo(rfqNo)
                .orElseGet(() -> {
                    PurchaseRfqEvaluationRecord fresh = new PurchaseRfqEvaluationRecord();
                    fresh.setRfqNo(rfqNo);
                    return fresh;
                });
        entity.setRfqRef(text(body.get("rfqRef"), text(body.get("id"), null)));
        entity.setStage(text(body.get("stage"), null));
        entity.setRecordJson(writeJson(body));
        PurchaseRfqEvaluationRecord saved = recordRepository.save(entity);
        syncNegotiations(rfqNo, body);
        return toMap(saved);
    }

    /** Negotiation rounds persisted for one RFQ, round order. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> negotiations(String reference) {
        String rfqNo = resolveRfqNo(reference);
        return negotiationRepository.findByRfqNoOrderByRoundNoAsc(rfqNo).stream()
                .map(this::negotiationMap)
                .toList();
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /** Resolves either the numeric primary key or the RFQ number. */
    private String resolveRfqNo(String reference) {
        if (reference == null || reference.isBlank()) {
            throw new BadRequestException("RFQ reference is required");
        }
        String trimmed = reference.trim();
        if (trimmed.matches("\\d+")) {
            return rfqRepository.findById(Long.valueOf(trimmed))
                    .map(PurchaseRfq::getRfqNo)
                    .orElseThrow(() -> new BadRequestException("RFQ not found"));
        }
        return trimmed;
    }

    /**
     * Projects the rounds carried by the evaluation document into
     * {@code purchase_rfq_negotiations}. The document is authoritative
     * and rounds are append-only, so the projection is rewritten on
     * every save to stay exactly in step with it.
     */
    private void syncNegotiations(String rfqNo, Map<String, Object> body) {
        Object raw = body.get("negotiations");
        List<Map<String, Object>> rounds = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Map<String, Object> round = new LinkedHashMap<>();
                    map.forEach((key, value) -> round.put(String.valueOf(key), value));
                    rounds.add(round);
                }
            }
        }
        negotiationRepository.deleteByRfqNo(rfqNo);
        int index = 0;
        for (Map<String, Object> round : rounds) {
            index += 1;
            PurchaseRfqNegotiation entity = new PurchaseRfqNegotiation();
            entity.setRfqNo(rfqNo);
            entity.setVendor(text(round.get("vendor"), null));
            entity.setQuotationNo(text(round.get("quotationId"), null));
            entity.setVendorRef(text(round.get("vendorId"), null));
            entity.setRoundNo(integer(round.get("round"), index));
            entity.setAmount(decimal(round.get("amount")));
            entity.setStage(text(round.get("stage"), null));
            entity.setNote(text(round.get("note"), null));
            entity.setActor(text(round.get("actor"), null));
            Object itemRates = round.get("itemRates");
            entity.setItemRatesJson(itemRates == null ? null : writeJson(itemRates));
            negotiationRepository.save(entity);
        }
    }

    private Map<String, Object> toMap(PurchaseRfqEvaluationRecord entity) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", entity.getId());
        result.put("rfqNo", entity.getRfqNo());
        result.put("rfqRef", entity.getRfqRef());
        result.put("stage", entity.getStage());
        result.put("updatedAt", entity.getUpdatedAt());
        result.put("record", readJson(entity.getRecordJson()));
        return result;
    }

    private Map<String, Object> negotiationMap(PurchaseRfqNegotiation entity) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", entity.getId());
        result.put("rfqNo", entity.getRfqNo());
        result.put("vendor", entity.getVendor());
        result.put("quotationId", entity.getQuotationNo());
        result.put("vendorId", entity.getVendorRef());
        result.put("round", entity.getRoundNo());
        result.put("amount", entity.getAmount());
        result.put("stage", entity.getStage());
        result.put("note", entity.getNote());
        result.put("actor", entity.getActor());
        result.put("itemRates", readJson(entity.getItemRatesJson()));
        result.put("timestamp", entity.getCreatedAt());
        return result;
    }

    private static String writeJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception error) {
            throw new BadRequestException("Evaluation payload is not serialisable");
        }
    }

    private static Map<String, Object> readJson(String value) {
        if (value == null || value.isBlank()) return new LinkedHashMap<>();
        try {
            Map<String, Object> parsed = JSON.readValue(value, new TypeReference<Map<String, Object>>() {});
            return parsed == null ? new LinkedHashMap<>() : parsed;
        } catch (Exception error) {
            return new LinkedHashMap<>();
        }
    }

    private static String text(Object value, String fallback) {
        if (value == null) return fallback;
        String text = String.valueOf(value);
        return text.isBlank() ? fallback : text;
    }

    private static Integer integer(Object value, int fallback) {
        if (value instanceof Number number) return number.intValue();
        try {
            return value == null ? fallback : Integer.valueOf(String.valueOf(value).trim());
        } catch (NumberFormatException error) {
            return fallback;
        }
    }

    private static BigDecimal decimal(Object value) {
        if (value instanceof BigDecimal decimal) return decimal;
        if (value instanceof Number number) return BigDecimal.valueOf(number.doubleValue());
        if (value == null) return null;
        try {
            return new BigDecimal(String.valueOf(value).trim());
        } catch (NumberFormatException error) {
            return null;
        }
    }
}
