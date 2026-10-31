package com.vishatech.erp.api;

import org.junit.jupiter.api.BeforeAll;

/**
 * Base class for live REST Assured suites that can write.
 *
 * <p>It applies {@link LiveDatabaseTarget}'s fail-closed check BEFORE the
 * inherited {@link BaseApiTest} client is built (and therefore before any
 * request is sent): if the run is not explicitly pointed at a disposable
 * database, the whole suite fails immediately instead of exercising destructive
 * routes against whatever instance happens to answer on the base URI.
 *
 * <p>Read-only live suites may extend {@link BaseApiTest} directly.
 */
public abstract class WriteCapableLiveApiTest extends BaseApiTest {

    @BeforeAll
    static void requireDisposableDatabaseTarget() {
        String target = LiveDatabaseTarget.requireIsolated(
                System.getenv(LiveDatabaseTarget.TARGET_ENV_VAR));
        System.out.println("[live-api] write-capable suite target database = " + target);
    }
}
