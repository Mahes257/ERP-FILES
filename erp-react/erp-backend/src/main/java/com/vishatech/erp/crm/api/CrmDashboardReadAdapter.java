package com.vishatech.erp.crm.api;

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
import com.vishatech.erp.dashboard.port.CrmDashboardPort;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

/**
 * CRM-owned implementation of {@link CrmDashboardPort}.
 *
 * <p>It lives inside the CRM module, so the CRM repositories stay behind the
 * port: nothing outside CRM reads a CRM entity or repository for the
 * dashboards. Every method delegates to exactly the query the dashboard used
 * before the port existed (same COUNT statement, same Specification, same
 * ordering and page size), and this class declares no transaction of its own —
 * it joins whatever the caller opened, as the previous code did.
 */
@Service
public class CrmDashboardReadAdapter implements CrmDashboardPort {

    /** Status values the dashboard has always compared case-insensitively. */
    private static final String DELETED_STATUS = "Deleted";
    private static final String ACTIVE_STATUS = "Active";

    /** Statuses the dashboard counts by exact value. */
    private static final String OPEN = "Open";
    private static final String COMPLETED = "Completed";
    private static final String RESCHEDULED = "Rescheduled";

    /** Lower-cased open status used by the follow-up activity buckets. */
    private static final String OPEN_LOWER = "open";

    private final LeadRepository leadRepository;
    private final CustomerRepository customerRepository;
    private final FollowUpRepository followUpRepository;

    public CrmDashboardReadAdapter(LeadRepository leadRepository,
                                   CustomerRepository customerRepository,
                                   FollowUpRepository followUpRepository) {
        this.leadRepository = leadRepository;
        this.customerRepository = customerRepository;
        this.followUpRepository = followUpRepository;
    }

    @Override
    public ClientCounts clientCounts() {
        long total = customerRepository.count();
        long deleted = customerRepository.countByStatusIgnoreCase(DELETED_STATUS);
        long active = customerRepository.countByStatusIgnoreCase(ACTIVE_STATUS);
        return new ClientCounts(total, Math.max(0, total - deleted), active);
    }

    @Override
    public LeadCounts leadCounts() {
        return new LeadCounts(
                leadRepository.countByStatusIn(List.of(LeadStatus.ACTIVE, LeadStatus.INACTIVE)),
                leadRepository.countByStatus(LeadStatus.ACTIVE),
                leadRepository.countByStage(LeadStage.NEW),
                leadRepository.countByStage(LeadStage.CONTACTED),
                leadRepository.countByStage(LeadStage.QUALIFIED),
                leadRepository.countByStage(LeadStage.PROPOSAL),
                leadRepository.countByStage(LeadStage.PROPOSAL_SENT),
                leadRepository.countByStage(LeadStage.NEGOTIATION),
                leadRepository.countByStage(LeadStage.WON),
                leadRepository.countByStage(LeadStage.LOST));
    }

    @Override
    public FollowUpCounts followUpCounts(LocalDate today) {
        return new FollowUpCounts(
                followUpRepository.countActive(),
                followUpRepository.countActiveByStatus(OPEN),
                followUpRepository.countActiveByStatus(COMPLETED),
                followUpRepository.countActiveByStatus(RESCHEDULED),
                followUpRepository.countOpenOverdue(today));
    }

    @Override
    public FollowUpActivity followUpActivity(LocalDate today) {
        long open = followUpRepository.count(openFollowUps());
        long overdue = followUpRepository.count(openFollowUps()
                .and((root, query, cb) ->
                        cb.lessThan(root.<LocalDate>get("nextFollowupDate"), today)));
        long dueToday = followUpRepository.count(openFollowUps()
                .and((root, query, cb) ->
                        cb.equal(root.<LocalDate>get("followupDate"), today)));
        long dueThisWeek = followUpRepository.count(openFollowUps()
                .and((root, query, cb) -> cb.and(
                        cb.greaterThanOrEqualTo(root.<LocalDate>get("nextFollowupDate"), today),
                        cb.lessThan(root.<LocalDate>get("nextFollowupDate"), today.plusDays(7)))));
        return new FollowUpActivity(open, overdue, dueToday, dueThisWeek);
    }

    @Override
    public List<LeadActivity> recentLeadActivity(int limit) {
        PageRequest newestFirst = PageRequest.of(0, limit,
                Sort.by(Sort.Direction.DESC, "createdAt"));
        return leadRepository.findAll(leadActivityFilter(), newestFirst).getContent().stream()
                .map(lead -> new LeadActivity(
                        lead.getId(),
                        lead.getCompany(),
                        lead.getName(),
                        lead.getStage() != null ? lead.getStage().name() : "",
                        lead.getCreatedAt()))
                .toList();
    }

    @Override
    public long inactiveActiveLeads(LocalDateTime cutoff) {
        return leadRepository.count((root, query, cb) -> cb.and(
                cb.equal(root.get("status"), LeadStatus.ACTIVE),
                cb.or(cb.isNull(root.get("updatedAt")),
                        cb.lessThan(root.<LocalDateTime>get("updatedAt"), cutoff))));
    }

    /** Open follow-ups — the status comparison is case-insensitive, as before. */
    private static Specification<FollowUp> openFollowUps() {
        return (root, query, cb) -> cb.equal(cb.lower(root.<String>get("status")), OPEN_LOWER);
    }

    /** Leads that are neither archived nor deleted. */
    private static Specification<Lead> leadActivityFilter() {
        return (root, query, cb) -> cb.or(
                cb.isNull(root.get("status")),
                cb.and(cb.notEqual(root.get("status"), LeadStatus.ARCHIVED),
                        cb.notEqual(root.get("status"), LeadStatus.DELETED)));
    }
}
