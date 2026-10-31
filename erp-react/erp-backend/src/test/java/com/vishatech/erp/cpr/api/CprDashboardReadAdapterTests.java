package com.vishatech.erp.cpr.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.dashboard.dto.CprActivity;
import com.vishatech.erp.dashboard.dto.CprCounts;
import com.vishatech.erp.dashboard.dto.CprVerificationCounts;
import com.vishatech.erp.repository.CprTechnicalVerificationRepository;
import com.vishatech.erp.security.AbstractSecurityTest;
import com.vishatech.erp.service.CprService;
import com.vishatech.erp.service.CprTechnicalVerificationService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Equivalence tests for {@link CprDashboardReadAdapter}. The typed counters are
 * read out of the very same CPR stats documents the dashboards consume, so each
 * assertion recomputes the value from the document.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class CprDashboardReadAdapterTests extends AbstractSecurityTest {

    @Autowired
    private CprDashboardReadAdapter adapter;

    @Autowired
    private CprService cprService;

    @Autowired
    private CprTechnicalVerificationService cprTechnicalVerificationService;

    @Autowired
    private CprTechnicalVerificationRepository cprTechnicalVerificationRepository;

    @Test
    void cprStatsIsTheModuleDocument() {
        assertThat(adapter.cprStats()).isEqualTo(cprService.stats());
    }

    @Test
    void cprCountsMatchTheCprStatsDocument() {
        Map<String, Object> stats = cprService.stats();

        CprCounts counts = adapter.cprCounts();

        assertThat(counts.total()).isEqualTo(num(stats, "total"));
        assertThat(counts.pendingApproval()).isEqualTo(num(stats, "pendingapproval"));
        assertThat(counts.draft()).isEqualTo(num(stats, "draft"));
        assertThat(counts.approved()).isEqualTo(num(stats, "approved"));
        assertThat(counts.rejected()).isEqualTo(num(stats, "rejected"));
        assertThat(counts.converted()).isEqualTo(num(stats, "converted"));
    }

    @Test
    void technicalVerificationCountsMatchTheVerificationDocument() {
        Map<String, Object> stats = cprTechnicalVerificationService.stats(null);

        CprVerificationCounts counts = adapter.technicalVerificationCounts();

        assertThat(counts.total()).isEqualTo(num(stats, "total"));
        assertThat(counts.draft()).isEqualTo(num(stats, "draft"));
        assertThat(counts.underVerification()).isEqualTo(num(stats, "underVerification"));
        assertThat(counts.verified()).isEqualTo(num(stats, "verified"));
        assertThat(counts.rejected()).isEqualTo(num(stats, "rejected"));
    }

    @Test
    void technicalVerificationTotalIsTheRowCount() {
        assertThat(adapter.technicalVerificationTotal())
                .isEqualTo(cprTechnicalVerificationRepository.count());
        assertThat(adapter.technicalVerificationTotal())
                .as("the single count agrees with the full document it replaces")
                .isEqualTo(num(cprTechnicalVerificationService.stats(null), "total"));
    }

    @Test
    void recentCprActivityRespectsTheRequestedLimit() {
        List<CprActivity> two = adapter.recentCprActivity(2);
        List<CprActivity> ten = adapter.recentCprActivity(10);

        assertThat(two).hasSizeLessThanOrEqualTo(2);
        assertThat(ten).hasSizeLessThanOrEqualTo(10);
        assertThat(two.size()).isLessThanOrEqualTo(ten.size());
        if (!two.isEmpty()) {
            assertThat(two.get(0).id()).isNotNull();
        }
    }

    private static long num(Map<String, Object> stats, String key) {
        Object value = stats.get(key);
        return value instanceof Number ? ((Number) value).longValue() : 0L;
    }
}
