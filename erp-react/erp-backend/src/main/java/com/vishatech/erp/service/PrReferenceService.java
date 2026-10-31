package com.vishatech.erp.service;

import com.vishatech.erp.dto.PrReferenceRequest;
import com.vishatech.erp.dto.PrReferenceResponse;
import com.vishatech.erp.entity.Cpr;
import com.vishatech.erp.entity.PrReference;
import com.vishatech.erp.exception.BadRequestException;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.repository.PrReferenceRepository;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reference PR No catalog for Sales.
 *
 * ONE SOURCE OF TRUTH, TWO ORIGINS
 * -------------------------------
 * A Reference PR No can be carried by a CPR ({@code cpr.referencePrNo}) or be
 * registered directly from the Quotation form ({@code pr_references}). CPR-owned
 * numbers are never copied into {@code pr_references} — the dropdown is a merge
 * of both origins, de-duplicated case-insensitively, so the same PR number can
 * never appear twice or be owned twice.
 *
 * This is what lets a user start from Quotations without first being forced to
 * create a CPR, while still linking to a CPR automatically when one exists.
 */
@Service
public class PrReferenceService {

    /** Autocomplete cap — mirrors the existing CPR reference search. */
    public static final int MAX_RESULTS = 20;

    /**
     * Where a Reference PR No lives. Deliberately a plain value object, NOT a
     * JPA entity: a CPR-carried PR No legitimately has NO {@code pr_references}
     * row (the CPR owns it), so there is no row id to hand back — the earlier
     * entity-shaped return value silently produced a null link in that case and
     * every CPR-carried PR No was mis-recorded as a direct reference.
     *
     * @param referencePrNo the canonical PR number
     * @param source        {@link PrReference#SOURCE_CPR} or {@link PrReference#SOURCE_DIRECT}
     * @param cprId         the owning CPR id (null for a direct reference)
     * @param prReferenceId the owning pr_references row id (null for a CPR-carried PR No)
     */
    public record PrReferenceLink(String referencePrNo, String source, Long cprId, Long prReferenceId) {

        public boolean fromCpr() {
            return PrReference.SOURCE_CPR.equals(source);
        }
    }

    private final PrReferenceRepository prReferenceRepository;
    private final CprRepository cprRepository;

    public PrReferenceService(PrReferenceRepository prReferenceRepository, CprRepository cprRepository) {
        this.prReferenceRepository = prReferenceRepository;
        this.cprRepository = cprRepository;
    }

    // ============================== Read ==============================

    /**
     * Merged autocomplete: CPR-carried PR numbers first (the canonical business
     * entry point), then directly-registered PR references, de-duplicated.
     */
    @Transactional(readOnly = true)
    public List<PrReferenceResponse> search(String query) {
        String q = query == null ? "" : query.trim();
        if (q.isEmpty()) {
            return List.of();
        }
        Map<String, PrReferenceResponse> merged = new LinkedHashMap<>();
        for (Cpr cpr : cprRepository.searchByReferencePrNo(q)) {
            putIfAbsent(merged, cprResponse(cpr));
        }
        for (PrReference ref : prReferenceRepository.searchByReferencePrNo(q)) {
            putIfAbsent(merged, response(ref));
        }
        List<PrReferenceResponse> out = new ArrayList<>(merged.values());
        return out.size() > MAX_RESULTS ? new ArrayList<>(out.subList(0, MAX_RESULTS)) : out;
    }

    /** Exact lookup across both origins (used by the form to resolve a typed value). */
    @Transactional(readOnly = true)
    public Optional<PrReferenceResponse> find(String referencePrNo) {
        if (referencePrNo == null || referencePrNo.isBlank()) {
            return Optional.empty();
        }
        String ref = referencePrNo.trim();
        List<Cpr> cprs = cprRepository.findLatestByReferencePrNo(ref);
        if (!cprs.isEmpty()) {
            return Optional.of(cprResponse(cprs.get(0)));
        }
        return prReferenceRepository.findByReferencePrNoIgnoreCase(ref).map(this::response);
    }

    // ============================== Write ==============================

    /**
     * Register a PR No straight from the Quotation form ("+ Add New Reference
     * PR No."). Fails when the PR number already exists anywhere in the ERP
     * (CPR or an earlier direct registration) so duplicates cannot accumulate.
     */
    @Transactional
    public PrReferenceResponse create(PrReferenceRequest request) {
        String ref = normalize(request == null ? null : request.referencePrNo());
        if (ref == null) {
            throw new BadRequestException("Reference PR No is required");
        }
        Optional<PrReferenceResponse> existing = find(ref);
        if (existing.isPresent()) {
            PrReferenceResponse hit = existing.get();
            throw new BadRequestException("Reference PR No already exists: " + hit.referencePrNo()
                    + " (" + hit.sourceLabel() + ")");
        }
        return response(register(request, ref, null, null));
    }

    /**
     * The PR number a CPR has been floated to (null when it has not been floated).
     *
     * The link lives in {@code pr_references.cprId}, so it is queryable in both
     * directions: CPR → PR and PR → CPR.
     */
    @Transactional(readOnly = true)
    public String findForCpr(Long cprId) {
        if (cprId == null) {
            return null;
        }
        return prReferenceRepository.findByCprId(cprId).stream()
                .map(PrReference::getReferencePrNo)
                .filter(ref -> ref != null && !ref.isBlank())
                .findFirst()
                .orElse(null);
    }

    /**
     * Register (or adopt) the Purchase Requisition this CPR is floated to.
     *
     * A verified, Admin-approved CPR floated to PR becomes a real requisition:
     * the PR number is recorded in the shared catalog and linked to the CPR, so
     * Purchasing and the Quotation dropdown both see the same PR. The number is
     * the CPR's own Reference PR No when it carries one; otherwise a free number
     * is generated once in the {@code PR-<year>-NNNNNN} series. Idempotent: a CPR
     * that already owns a PR row returns that number instead of creating a second
     * one, and the {@code pr_references.referencePrNo} UNIQUE constraint is the
     * final guard against duplicates.
     */
    @Transactional
    public String registerForCpr(Cpr cpr, String remarks) {
        if (cpr == null || cpr.getId() == null) {
            throw new BadRequestException("CPR is required to raise a Purchase Requisition");
        }
        // Already floated — return the existing PR number (no duplicate row).
        String existingForCpr = findForCpr(cpr.getId());
        if (existingForCpr != null) {
            return existingForCpr;
        }
        String ref = normalize(cpr.getReferencePrNo());
        if (ref == null) {
            ref = nextFreePrNo();
        }
        PrReference owned = prReferenceRepository.findByReferencePrNoIgnoreCase(ref).orElse(null);
        if (owned != null) {
            // A direct/CPR row already holds this number — hand ownership to the
            // CPR instead of inserting a duplicate PR number.
            adoptCpr(owned, cpr);
            if (remarks != null && !remarks.isBlank()) {
                String note = "Floated from " + (cpr.getPrNo() == null ? "CPR" : cpr.getPrNo()) + ": " + remarks.trim();
                owned.setRemarks(owned.getRemarks() == null || owned.getRemarks().isBlank()
                        ? note
                        : owned.getRemarks() + "\n" + note);
                prReferenceRepository.save(owned);
            }
            return owned.getReferencePrNo();
        }
        PrReference entity = new PrReference();
        entity.setReferencePrNo(ref);
        entity.setSource(PrReference.SOURCE_CPR);
        entity.setCprId(cpr.getId());
        entity.setCprNo(cpr.getPrNo());
        entity.setClientId(cpr.getClientId());
        entity.setClientName(blankToNull(cpr.getClientName()));
        entity.setProject(blankToNull(cpr.getProject()));
        entity.setDescription(blankToNull(cpr.getDescription()));
        entity.setRequestedBy(blankToNull(cpr.getRequestedBy()));
        entity.setPrDate(LocalDate.now());
        entity.setRemarks(blankToNull(remarks));
        entity.setCreatedBy(currentUserName());
        return prReferenceRepository.save(entity).getReferencePrNo();
    }

    /**
     * Next free number in the {@code PR-<year>-NNNNNN} series, skipping any
     * number already carried by a CPR or registered directly.
     */
    private String nextFreePrNo() {
        String year = String.valueOf(LocalDate.now().getYear());
        long seq = prReferenceRepository.count() + 1;
        for (int attempt = 0; attempt < 500; attempt++) {
            String candidate = String.format("PR-%s-%06d", year, seq + attempt);
            if (find(candidate).isEmpty()) {
                return candidate;
            }
        }
        throw new BadRequestException("Could not allocate a free Purchase Requisition number");
    }

    /**
     * Resolve the Reference PR No of a quotation that is being saved.
     *
     * <ul>
     *   <li>blank → {@code null} (the field is optional; starting a quotation
     *       without any PR reference is a valid workflow),</li>
     *   <li>a live CPR carries it → link to that CPR,</li>
     *   <li>otherwise → register/reuse a DIRECT row so the PR No is immediately
     *       selectable in future dropdowns.</li>
     * </ul>
     *
     * Never throws for an unknown PR No — that was the bug that forced every
     * quotation to start from a CPR.
     */
    @Transactional
    public PrReferenceLink resolveForQuotation(String referencePrNo, Long clientId, String clientName) {
        String ref = normalize(referencePrNo);
        if (ref == null) {
            return null;
        }
        List<Cpr> cprs = cprRepository.findLatestByReferencePrNo(ref);
        if (!cprs.isEmpty()) {
            Cpr cpr = cprs.get(0);
            // A DIRECT row may already exist for this PR No (entered from a
            // quotation before the CPR was raised) — adopt it rather than
            // creating a second record for the same PR number.
            PrReference owned = prReferenceRepository.findByReferencePrNoIgnoreCase(ref).orElse(null);
            if (owned != null) {
                adoptCpr(owned, cpr);
            }
            return new PrReferenceLink(
                    cpr.getReferencePrNo(),
                    PrReference.SOURCE_CPR,
                    cpr.getId(),
                    owned == null ? null : owned.getId());
        }
        PrReference existing = prReferenceRepository.findByReferencePrNoIgnoreCase(ref).orElse(null);
        if (existing != null) {
            return new PrReferenceLink(existing.getReferencePrNo(), existing.getSource(), null, existing.getId());
        }
        PrReference created = register(
                new PrReferenceRequest(ref, clientId, clientName, null, null, null, null, null),
                ref, clientId, clientName);
        return new PrReferenceLink(created.getReferencePrNo(), PrReference.SOURCE_DIRECT, null, created.getId());
    }

    /**
     * Read-shape wrapper around {@link #resolveForQuotation} for the REST layer.
     * Returns {@code null} when the PR No is blank (the field is optional).
     */
    @Transactional
    public PrReferenceResponse resolveResponse(String referencePrNo, Long clientId, String clientName) {
        PrReferenceLink link = resolveForQuotation(referencePrNo, clientId, clientName);
        if (link == null) {
            return null;
        }
        if (link.prReferenceId() != null) {
            return prReferenceRepository.findById(link.prReferenceId()).map(this::response).orElse(null);
        }
        // CPR-carried: the CPR owns the PR No, so describe it from the CPR side.
        Cpr cpr = link.cprId() == null ? null : cprRepository.findById(link.cprId()).orElse(null);
        return new PrReferenceResponse(
                cpr == null ? null : cpr.getId(),
                link.referencePrNo(),
                PrReference.SOURCE_CPR,
                PrReferenceResponse.labelFor(PrReference.SOURCE_CPR),
                link.cprId(),
                cpr == null ? null : cpr.getPrNo(),
                null,
                cpr == null ? null : cpr.getClientName(),
                cpr == null ? null : cpr.getProject(),
                null,
                cpr == null ? null : cpr.getRequestedBy(),
                cpr == null || cpr.getPrDate() == null ? null : cpr.getPrDate().toLocalDate().toString(),
                null,
                cpr == null ? null : cpr.getRequestedBy(),
                cpr == null || cpr.getCreatedAt() == null ? null : cpr.getCreatedAt().toString());
    }

    /**
     * A CPR has been raised for a PR No that previously existed only as a direct
     * reference — hand ownership to the CPR (no new row, no duplicate PR number).
     */
    @Transactional
    public void linkCpr(String referencePrNo, Long cprId, String cprNo) {
        String ref = normalize(referencePrNo);
        if (ref == null || cprId == null) {
            return;
        }
        prReferenceRepository.findByReferencePrNoIgnoreCase(ref)
                .ifPresent(row -> adoptCpr(row, cprId, cprNo));
    }

    // ============================== Helpers ==============================

    private PrReference register(PrReferenceRequest request, String ref, Long clientId, String clientName) {
        PrReference entity = new PrReference();
        entity.setReferencePrNo(ref);
        entity.setSource(PrReference.SOURCE_DIRECT);
        entity.setClientId(clientId != null ? clientId : (request == null ? null : request.clientId()));
        String name = clientName != null && !clientName.isBlank()
                ? clientName
                : (request == null ? null : request.clientName());
        entity.setClientName(blankToNull(name));
        if (request != null) {
            entity.setProject(blankToNull(request.project()));
            entity.setDescription(blankToNull(request.description()));
            entity.setRequestedBy(blankToNull(request.requestedBy()));
            entity.setPrDate(parseDate(request.prDate()));
            entity.setRemarks(blankToNull(request.remarks()));
        }
        entity.setCreatedBy(currentUserName());
        return prReferenceRepository.save(entity);
    }

    private void adoptCpr(PrReference row, Cpr cpr) {
        adoptCpr(row, cpr.getId(), cpr.getPrNo());
    }

    private void adoptCpr(PrReference row, Long cprId, String cprNo) {
        row.setSource(PrReference.SOURCE_CPR);
        row.setCprId(cprId);
        if (cprNo != null && !cprNo.isBlank()) {
            row.setCprNo(cprNo);
        }
        prReferenceRepository.save(row);
    }

    private void putIfAbsent(Map<String, PrReferenceResponse> merged, PrReferenceResponse entry) {
        if (entry == null || entry.referencePrNo() == null) {
            return;
        }
        merged.putIfAbsent(entry.referencePrNo().trim().toLowerCase(java.util.Locale.ROOT), entry);
    }

    private PrReferenceResponse cprResponse(Cpr cpr) {
        return new PrReferenceResponse(
                cpr.getId(),
                cpr.getReferencePrNo(),
                PrReference.SOURCE_CPR,
                PrReferenceResponse.labelFor(PrReference.SOURCE_CPR),
                cpr.getId(),
                cpr.getPrNo(),
                null,
                cpr.getClientName(),
                cpr.getProject(),
                null,
                cpr.getRequestedBy(),
                cpr.getPrDate() == null ? null : cpr.getPrDate().toLocalDate().toString(),
                null,
                cpr.getRequestedBy(),
                cpr.getCreatedAt() == null ? null : cpr.getCreatedAt().toString());
    }

    private PrReferenceResponse response(PrReference ref) {
        return new PrReferenceResponse(
                ref.getId(),
                ref.getReferencePrNo(),
                ref.getSource(),
                PrReferenceResponse.labelFor(ref.getSource()),
                ref.getCprId(),
                ref.getCprNo(),
                ref.getClientId(),
                ref.getClientName(),
                ref.getProject(),
                ref.getDescription(),
                ref.getRequestedBy(),
                ref.getPrDate() == null ? null : ref.getPrDate().toString(),
                ref.getRemarks(),
                ref.getCreatedBy(),
                ref.getCreatedAt() == null ? null : ref.getCreatedAt().toString());
    }

    private static String normalize(String value) {
        String trimmed = value == null ? null : value.trim();
        return trimmed == null || trimmed.isEmpty() ? null : trimmed;
    }

    private static String blankToNull(String value) {
        String trimmed = value == null ? null : value.trim();
        return trimmed == null || trimmed.isEmpty() ? null : trimmed;
    }

    private static LocalDate parseDate(String value) {
        String trimmed = normalize(value);
        if (trimmed == null) {
            return null;
        }
        try {
            // Accept both the date-only form and a full ISO timestamp.
            return LocalDate.parse(trimmed.length() > 10 ? trimmed.substring(0, 10) : trimmed);
        } catch (DateTimeParseException ex) {
            throw new BadRequestException("Invalid PR date: " + value);
        }
    }

    private String currentUserName() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getName() != null && !"anonymousUser".equals(auth.getName())) {
            return auth.getName();
        }
        return "System";
    }
}
