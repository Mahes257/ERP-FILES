package com.vishatech.cadworker;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.metamodel.EntityType;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The CAD worker runs from the same jar with a <b>narrower</b> component scan
 * than the ERP, so it declares its persistence surface explicitly:
 *
 * <pre>
 *   @EntityScan(basePackages = "com.vishatech.erp.entity")
 *   @EnableJpaRepositories(basePackages = "com.vishatech.erp.repository")
 * </pre>
 *
 * <p>Those two literals are a contract: every entity the worker's persistence
 * unit maps must be scanned, <em>including</em> any entity that a scanned
 * entity reaches through a JPA association. Moving an entity out of
 * {@code com.vishatech.erp.entity} without extending the scan therefore breaks
 * worker start-up — and nothing else in the suite would notice, because the
 * ERP process scans from its own package root.
 *
 * <p>This test starts the worker application context and inspects the
 * resulting metamodel, so that contract fails the build instead of failing in
 * production. It needs no CAD engine: mapping is independent of conversion.
 */
@SpringBootTest(
        classes = CadWorkerConfiguration.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE)
class CadWorkerPersistenceUnitTests {

    /**
     * Same in-memory H2 configuration as the security suite: MySQL mode,
     * plus the TEXT/LONGTEXT/MEDIUMBLOB domains the entities reference from
     * {@code @Column(columnDefinition = ...)} before Hibernate DDL runs.
     */
    @DynamicPropertySource
    static void h2DataSource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () ->
                "jdbc:h2:mem:cadworkertest;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE"
                        + ";INIT=CREATE DOMAIN IF NOT EXISTS \"TEXT\" AS CLOB"
                        + "\\;CREATE DOMAIN IF NOT EXISTS \"LONGTEXT\" AS CLOB"
                        + "\\;CREATE DOMAIN IF NOT EXISTS \"MEDIUMBLOB\" AS BLOB");
    }

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Test
    void workerPersistenceUnitMapsEverythingItTouches() {
        Set<String> mapped = entityManagerFactory.getMetamodel().getEntities().stream()
                .map(EntityType::getJavaType)
                .map(Class::getName)
                .collect(Collectors.toSet());

        // The queue, the heartbeat and the model projection: the worker's own
        // coordination surface (heartbeat lives in the cadworker package).
        assertThat(mapped)
                .as("worker persistence unit must map the shared conversion queue")
                .contains("com.vishatech.erp.entity.CadConversionJob")
                .as("worker persistence unit must map the production model projection")
                .contains("com.vishatech.erp.entity.production.Model");

        // Associated entities pulled in through the flat entity package. If any
        // of these ever leaves "com.vishatech.erp.entity", CadWorkerConfiguration
        // must be extended in the same change or the worker will not start.
        assertThat(mapped)
                .as("scanned entities associate to these, so they must be mapped too")
                .contains("com.vishatech.erp.entity.Activity");

        // The CRM module's own entity package: Lead is mapped because the flat
        // Lead children (Activity, Note, ...) declare @ManyToOne associations to
        // it, which is why the worker's @EntityScan lists both packages.
        assertThat(mapped)
                .as("the CRM entity package must be part of the worker's entity scan")
                .contains("com.vishatech.erp.crm.entity.Lead");
    }
}
