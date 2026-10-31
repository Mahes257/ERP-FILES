package com.vishatech.erp.cpr.api;

import com.vishatech.erp.dashboard.dto.CprActivity;
import com.vishatech.erp.dashboard.dto.CprCounts;
import com.vishatech.erp.dashboard.dto.CprVerificationCounts;
import com.vishatech.erp.dashboard.port.CprDashboardPort;
import com.vishatech.erp.repository.CprRepository;
import com.vishatech.erp.repository.CprTechnicalVerificationRepository;
import com.vishatech.erp.service.CprService;
import com.vishatech.erp.service.CprTechnicalVerificationService;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

/**
 * CPR-owned implementation of {@link CprDashboardPort}.
 *
 * <p>Delegates to the CPR module's existing stats documents and repository
 * counts — no new query, no changed filter, no transaction of its own. The
 * typed records are read out of the very same documents the Sales Dashboard
 * already passes through, so both dashboards keep reporting identical numbers.
 *
 * <p>{@link #technicalVerificationTotal()} is a plain row count rather than the
 * full verification stats document: the Sales Dashboard only needs the total
 * there, and calling the per-status method for it would run ten counting
 * queries where one has always been enough.
 */
@Service
public class CprDashboardReadAdapter implements CprDashboardPort {

    private final CprService cprService;
    private final CprTechnicalVerificationService cprTechnicalVerificationService;
    private final CprRepository cprRepository;
    private final CprTechnicalVerificationRepository cprTechnicalVerificationRepository;

    public CprDashboardReadAdapter(CprService cprService,
                                   CprTechnicalVerificationService cprTechnicalVerificationService,
                                   CprRepository cprRepository,
                                   CprTechnicalVerificationRepository cprTechnicalVerificationRepository) {
        this.cprService = cprService;
        this.cprTechnicalVerificationService = cprTechnicalVerificationService;
        this.cprRepository = cprRepository;
        this.cprTechnicalVerificationRepository = cprTechnicalVerificationRepository;
    }

    @Override
    public Map<String, Object> cprStats() {
        return cprService.stats();
    }

    @Override
    public CprCounts cprCounts() {
        Map<String, Object> stats = cprService.stats();
        return new CprCounts(
                num(stats, "total"),
                num(stats, "pendingapproval"),
                num(stats, "draft"),
                num(stats, "approved"),
                num(stats, "rejected"),
                num(stats, "converted"));
    }

    @Override
    public CprVerificationCounts technicalVerificationCounts() {
        Map<String, Object> stats = cprTechnicalVerificationService.stats(null);
        return new CprVerificationCounts(
                num(stats, "total"),
                num(stats, "draft"),
                num(stats, "underVerification"),
                num(stats, "verified"),
                num(stats, "rejected"));
    }

    @Override
    public long technicalVerificationTotal() {
        return cprTechnicalVerificationRepository.count();
    }

    @Override
    public List<CprActivity> recentCprActivity(int limit) {
        PageRequest newestFirst = PageRequest.of(0, limit,
                Sort.by(Sort.Direction.DESC, "createdAt"));
        return cprRepository.findAll(newestFirst).getContent().stream()
                .map(cpr -> new CprActivity(
                        cpr.getId(),
                        cpr.getPrNo(),
                        cpr.getClientName(),
                        cpr.getCompany(),
                        cpr.getStatus() != null ? cpr.getStatus().name() : "",
                        cpr.getCreatedAt()))
                .toList();
    }

    /** Safe long extraction from a stats document (missing or odd keys are zero). */
    private static long num(Map<String, Object> stats, String key) {
        Object value = stats.get(key);
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }
}
