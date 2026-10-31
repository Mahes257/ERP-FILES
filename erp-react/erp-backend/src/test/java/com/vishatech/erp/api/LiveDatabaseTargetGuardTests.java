package com.vishatech.erp.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * Guard tests for {@link LiveDatabaseTarget} — the safety net that stops the
 * write-capable live REST Assured suites from being pointed at the shared
 * development database.
 *
 * <p>These run in the normal (H2, no live backend) suite: they assert the
 * decision logic and that the live suites are actually wired to it, which is
 * what cannot be checked when a live run is skipped for lack of an environment.
 */
class LiveDatabaseTargetGuardTests {

    @Test
    void missingOrBlankTargetIsRefused() {
        assertThrows(IllegalStateException.class, () -> LiveDatabaseTarget.requireIsolated(null));
        assertThrows(IllegalStateException.class, () -> LiveDatabaseTarget.requireIsolated("   "));
    }

    @Test
    void theSharedDevelopmentDatabaseIsAlwaysRefused() {
        assertThrows(IllegalStateException.class, () -> LiveDatabaseTarget.requireIsolated("erp_db"));
        assertThrows(IllegalStateException.class, () -> LiveDatabaseTarget.requireIsolated("ERP_DB"));
        assertThrows(IllegalStateException.class, () -> LiveDatabaseTarget.requireIsolated(" erp_db "));
        // Also refused when it arrives as the JDBC URL the backend was started with.
        assertThrows(IllegalStateException.class, () -> LiveDatabaseTarget.requireIsolated(
                "jdbc:mysql://localhost:3306/erp_db?useSSL=false&allowPublicKeyRetrieval=true"));
    }

    @Test
    void productionLookingTargetsAreRefused() {
        assertThrows(IllegalStateException.class,
                () -> LiveDatabaseTarget.requireIsolated("production_db"));
        assertThrows(IllegalStateException.class,
                () -> LiveDatabaseTarget.requireIsolated("erp_prod"));
    }

    @Test
    void explicitlyNamedDisposableTargetsAreAccepted() {
        assertEquals("erp_ci_live", LiveDatabaseTarget.requireIsolated("erp_ci_live"));
        assertEquals("erp_test_live", LiveDatabaseTarget.requireIsolated("ERP_TEST_LIVE"));
        assertEquals("erp_verify_x", LiveDatabaseTarget.requireIsolated("erp_verify_x"));
        // The schema the previous verification round left behind, re-usable as a
        // disposable target because it is not the shared development database.
        assertEquals("erp_storage_verify", LiveDatabaseTarget.requireIsolated("erp_storage_verify"));
        assertEquals("erp_ci_live", LiveDatabaseTarget.requireIsolated(
                "jdbc:mysql://127.0.0.1:3306/erp_ci_live?useSSL=false"));
    }

    @Test
    void theSharedDatabaseNameIsDeclaredOnceAndMatchesTheDeploymentDefault() {
        assertEquals("erp_db", LiveDatabaseTarget.SHARED_DEVELOPMENT_DATABASE);
        assertEquals("ERP_API_TEST_TARGET_DB", LiveDatabaseTarget.TARGET_ENV_VAR);
    }

    @Test
    void theDestructiveLiveSuitesExtendTheGuardedBase() throws Exception {
        assertTrue(WriteCapableLiveApiTest.class.getSuperclass() == BaseApiTest.class,
                "WriteCapableLiveApiTest must extend BaseApiTest so it inherits the live client");
        // Reflectively, so the live suite's package-private visibility is unchanged.
        Class<?> destructiveSuite = Class.forName("com.vishatech.erp.api.sales.SalesDeleteAuthorityLiveApiTest");
        assertTrue(WriteCapableLiveApiTest.class.isAssignableFrom(destructiveSuite),
                "the destructive Sales delete suite must extend WriteCapableLiveApiTest");
        assertTrue(hasEnvironmentGate(destructiveSuite),
                "the live suites stay environment-gated (ERP_API_TEST_ENABLED)");
    }

    /** JUnit conditions are inherited, so the gate may sit on any superclass. */
    private static boolean hasEnvironmentGate(Class<?> type) {
        for (Class<?> c = type; c != null; c = c.getSuperclass()) {
            if (c.isAnnotationPresent(
                    org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable.class)) {
                return true;
            }
        }
        return false;
    }
}
