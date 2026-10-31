package com.vishatech.cadworker;

import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Spring configuration of the ISOLATED CAD conversion worker process.
 *
 * <p>Deliberate properties of this context:
 *
 * <ul>
 *   <li><b>No web layer.</b> Started with {@link WebApplicationType#NONE}, so
 *       the worker binds no port and can never be reached directly — the only
 *       way in is the shared database queue.</li>
 *   <li><b>Narrow component scan.</b> It picks up exactly
 *       {@code com.vishatech.erp.cad} (the engine abstraction + shared config)
 *       and {@code com.vishatech.cadworker} (store, worker, scheduler). The
 *       ERP's services, controllers, security filters and schedulers are NOT
 *       loaded, so the worker and the ERP cannot interfere with each other.</li>
 *   <li><b>Same database, same entities.</b> JPA repositories are shared with
 *       the ERP so the queue (cad_conversion_jobs), the heartbeat row and the
 *       model projection columns are the single coordination surface.</li>
 * </ul>
 *
 * <p>It is started by {@link CadWorkerApplication} via
 * {@code --erp.cad.worker.mode=true} (or {@code ERP_CAD_WORKER_MODE=true}).
 */
@SpringBootApplication(
        scanBasePackages = {"com.vishatech.erp.cad", "com.vishatech.cadworker"})
// Entities and repositories live in the ERP packages (the worker shares the
// same schema): both must be declared explicitly, because a narrowed
// component scan moves Boot's auto-configuration package root to
// com.vishatech.cadworker.
//
// This list is a contract, not a convenience: Hibernate fails to start the
// worker when a mapped entity references an entity that is not scanned. The
// CRM module's entities are declared separately because they live in
// com.vishatech.erp.crm.entity (their own module package) while the Lead
// children they hang off (Activity, Attachment, Note, TimelineEntry,
// HistoryEntry) still live in com.vishatech.erp.entity. CadWorkerPersistenceUnitTests
// boots this context and asserts the mapping, so a future entity move cannot
// break worker start-up silently.
@EntityScan(basePackages = {"com.vishatech.erp.entity", "com.vishatech.erp.crm.entity"})
@EnableJpaRepositories(basePackages = "com.vishatech.erp.repository")
@EnableScheduling
// The shared entities (Model, ModelHistory, ...) carry @CreatedDate audit
// fields with nullable=false — without auditing enabled the worker's writes
// would violate the not-null constraint, exactly as in the ERP process.
@EnableJpaAuditing
public class CadWorkerConfiguration {

    public static void main(String[] args) {
        new SpringApplicationBuilder(CadWorkerConfiguration.class)
                .web(WebApplicationType.NONE)
                .run(args);
    }
}
