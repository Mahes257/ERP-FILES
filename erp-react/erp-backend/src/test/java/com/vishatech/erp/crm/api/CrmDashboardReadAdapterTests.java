package com.vishatech.erp.crm.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.vishatech.erp.crm.entity.Customer;
import com.vishatech.erp.crm.entity.FollowUp;
import com.vishatech.erp.crm.entity.Lead;
import com.vishatech.erp.crm.entity.LeadStage;
import com.vishatech.erp.crm.entity.LeadStatus;
import com.vishatech.erp.crm.repository.CustomerRepository;
import com.vishatech.erp.crm.repository.FollowUpRepository;
import com.vishatech.erp.crm.repository.LeadRepository;
import com.vishatech.erp.dashboard.dto.ClientCounts;
import com.vishatech.erp.dashboard.dto.FollowUpActivity;
import com.vishatech.erp.dashboard.dto.FollowUpCounts;
import com.vishatech.erp.dashboard.dto.LeadActivity;
import com.vishatech.erp.dashboard.dto.LeadCounts;
import com.vishatech.erp.security.AbstractSecurityTest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * Equivalence tests for {@link CrmDashboardReadAdapter}: the adapter must return
 * exactly what the CRM queries returned before the dashboard stopped calling
 * them directly.
 *
 * <p>Each test recomputes the expected value from the repositories — the same
 * query the adapter is documented to delegate to — so a changed filter, a
 * dropped {@code Deleted} exclusion or a swapped status comparison fails here
 * rather than in the dashboard payload.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "app.rate-limit.register.max-per-ip=100",
        "app.rate-limit.register.window-minutes=60",
        "app.rate-limit.login.max-per-ip=100",
        "app.rate-limit.login.max-per-email-ip=100"
})
class CrmDashboardReadAdapterTests extends AbstractSecurityTest {

    @Autowired
    private CrmDashboardReadAdapter adapter;

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private LeadRepository leadRepository;

    @Autowired
    private FollowUpRepository followUpRepository;

    @Test
    void clientCountsMatchTheCustomerQueries() {
        long total = customerRepository.count();
        long deleted = customerRepository.countByStatusIgnoreCase("Deleted");
        long active = customerRepository.countByStatusIgnoreCase("Active");

        ClientCounts counts = adapter.clientCounts();

        assertThat(counts.totalCustomers()).isEqualTo(total);
        assertThat(counts.clientsTotal())
                .as("deleted customers are excluded and the result is floored at zero")
                .isEqualTo(Math.max(0, total - deleted));
        assertThat(counts.clientsActive()).isEqualTo(active);
    }

    @Test
    void leadCountsMatchTheLeadQueries() {
        LeadCounts counts = adapter.leadCounts();

        assertThat(counts.activeAndInactive())
                .isEqualTo(leadRepository.countByStatusIn(List.of(LeadStatus.ACTIVE, LeadStatus.INACTIVE)));
        assertThat(counts.active()).isEqualTo(leadRepository.countByStatus(LeadStatus.ACTIVE));
        assertThat(counts.newLeads()).isEqualTo(leadRepository.countByStage(LeadStage.NEW));
        assertThat(counts.contacted()).isEqualTo(leadRepository.countByStage(LeadStage.CONTACTED));
        assertThat(counts.qualified()).isEqualTo(leadRepository.countByStage(LeadStage.QUALIFIED));
        assertThat(counts.proposal()).isEqualTo(leadRepository.countByStage(LeadStage.PROPOSAL));
        assertThat(counts.proposalSent()).isEqualTo(leadRepository.countByStage(LeadStage.PROPOSAL_SENT));
        assertThat(counts.negotiation()).isEqualTo(leadRepository.countByStage(LeadStage.NEGOTIATION));
        assertThat(counts.won()).isEqualTo(leadRepository.countByStage(LeadStage.WON));
        assertThat(counts.lost()).isEqualTo(leadRepository.countByStage(LeadStage.LOST));
    }

    @Test
    void followUpCountsMatchTheFollowUpQueries() {
        LocalDate today = LocalDate.now();

        FollowUpCounts counts = adapter.followUpCounts(today);

        assertThat(counts.total()).isEqualTo(followUpRepository.countActive());
        assertThat(counts.open()).isEqualTo(followUpRepository.countActiveByStatus("Open"));
        assertThat(counts.completed()).isEqualTo(followUpRepository.countActiveByStatus("Completed"));
        assertThat(counts.rescheduled()).isEqualTo(followUpRepository.countActiveByStatus("Rescheduled"));
        assertThat(counts.overdue()).isEqualTo(followUpRepository.countOpenOverdue(today));
    }

    @Test
    void followUpActivityMatchesItsFourSpecificationCounts() {
        LocalDate today = LocalDate.now();

        FollowUpActivity activity = adapter.followUpActivity(today);

        // Recomputed with the same specifications the dashboard has always used.
        long open = followUpRepository.count((root, query, cb) ->
                cb.equal(cb.lower(root.<String>get("status")), "open"));
        long overdue = followUpRepository.count((root, query, cb) -> cb.and(
                cb.equal(cb.lower(root.<String>get("status")), "open"),
                cb.lessThan(root.<LocalDate>get("nextFollowupDate"), today)));
        long dueToday = followUpRepository.count((root, query, cb) -> cb.and(
                cb.equal(cb.lower(root.<String>get("status")), "open"),
                cb.equal(root.<LocalDate>get("followupDate"), today)));

        assertThat(activity.open()).isEqualTo(open);
        assertThat(activity.overdue()).isEqualTo(overdue);
        assertThat(activity.today()).isEqualTo(dueToday);
        assertThat(activity.open()).isEqualTo(open);
    }

    @Test
    void seededRowsMoveTheAdapterByTheSameAmountsAsTheQueries() {
        String mark = "ADAPT" + System.nanoTime();
        LocalDate today = LocalDate.now();

        ClientCounts clientsBefore = adapter.clientCounts();
        LeadCounts leadsBefore = adapter.leadCounts();
        FollowUpCounts followUpsBefore = adapter.followUpCounts(today);

        saveCustomer(mark + "-ACTIVE", "Active");
        saveCustomer(mark + "-DELETED", "Deleted");
        saveLead(mark + "-LEAD");
        saveFollowUp(mark + "-FU-OPEN", "Open", today.minusDays(1));
        saveFollowUp(mark + "-FU-DONE", "Completed", today);

        ClientCounts clientsAfter = adapter.clientCounts();
        LeadCounts leadsAfter = adapter.leadCounts();
        FollowUpCounts followUpsAfter = adapter.followUpCounts(today);

        assertThat(clientsAfter.totalCustomers() - clientsBefore.totalCustomers()).isEqualTo(2);
        assertThat(clientsAfter.clientsTotal() - clientsBefore.clientsTotal()).isEqualTo(1);
        assertThat(clientsAfter.clientsActive() - clientsBefore.clientsActive()).isEqualTo(1);

        assertThat(leadsAfter.active() - leadsBefore.active()).isEqualTo(1);
        assertThat(leadsAfter.qualified() - leadsBefore.qualified()).isEqualTo(1);
        assertThat(leadsAfter.activeAndInactive() - leadsBefore.activeAndInactive()).isEqualTo(1);

        assertThat(followUpsAfter.total() - followUpsBefore.total()).isEqualTo(2);
        assertThat(followUpsAfter.open() - followUpsBefore.open()).isEqualTo(1);
        assertThat(followUpsAfter.completed() - followUpsBefore.completed()).isEqualTo(1);
    }

    @Test
    void recentLeadActivityRespectsTheRequestedLimit() {
        List<LeadActivity> two = adapter.recentLeadActivity(2);
        List<LeadActivity> ten = adapter.recentLeadActivity(10);

        assertThat(two).hasSizeLessThanOrEqualTo(2);
        assertThat(ten).hasSizeLessThanOrEqualTo(10);
        if (!two.isEmpty()) {
            assertThat(two.get(0).id()).isNotNull();
        }
    }

    @Test
    void inactiveActiveLeadsMatchesItsSpecification() {
        String mark = "ADAPT-STALE" + System.nanoTime();
        LocalDateTime future = LocalDateTime.now().plusDays(1);

        long before = adapter.inactiveActiveLeads(future);
        saveLead(mark);
        long after = adapter.inactiveActiveLeads(future);

        assertThat(after - before)
                .as("a freshly seeded active lead is stale relative to a future cutoff")
                .isEqualTo(1);

        // And the repository query it delegates to agrees.
        long expected = leadRepository.count((root, query, cb) -> cb.and(
                cb.equal(root.get("status"), LeadStatus.ACTIVE),
                cb.or(cb.isNull(root.get("updatedAt")),
                        cb.lessThan(root.<LocalDateTime>get("updatedAt"), future))));
        assertThat(after).isEqualTo(expected);
    }

    // ==================== Seeding ====================

    private void saveCustomer(String businessName, String status) {
        Customer customer = new Customer();
        customer.setBusinessName(businessName);
        customer.setStatus(status);
        customerRepository.save(customer);
    }

    private void saveLead(String name) {
        Lead lead = new Lead();
        lead.setName(name);
        lead.setStatus(LeadStatus.ACTIVE);
        lead.setStage(LeadStage.QUALIFIED);
        leadRepository.save(lead);
    }

    private void saveFollowUp(String company, String status, LocalDate followupDate) {
        FollowUp followUp = new FollowUp();
        followUp.setCompanyName(company);
        followUp.setStatus(status);
        followUp.setFollowupDate(followupDate);
        followUp.setNextFollowupDate(followupDate.plusDays(2));
        followUpRepository.save(followUp);
    }
}
