package com.vishatech.erp.api;

/**
 * Database-target safety check for the LIVE REST Assured suites.
 *
 * <p>These suites talk to a *running* backend, so they cannot control which
 * database that instance was started against. Several of them are
 * write-capable in nature: the destructive Sales routes are exercised with a
 * well-formed payload (an id that must not exist) and {@code
 * ERP_API_TEST_ALLOW_REGISTER=true} writes a throwaway {@code USER} row. Pointed
 * at the shared development database, that is data the team did not agree to.
 *
 * <p>Therefore every write-capable suite must declare the disposable database
 * the system under test is using:
 *
 * <pre>
 *   ERP_API_TEST_TARGET_DB=erp_ci_live      # the database the running backend uses
 * </pre>
 *
 * <p>The check is deliberately fail-closed: a missing value, or a value that
 * names the shared development database, aborts the suite instead of quietly
 * running against it. It is pure (no environment access) so it can be unit
 * tested without a live backend; {@link WriteCapableLiveApiTest} is the
 * adapter that feeds it {@code System.getenv}.
 */
public final class LiveDatabaseTarget {

    /** The shared development database these suites must never write to. */
    public static final String SHARED_DEVELOPMENT_DATABASE = "erp_db";

    /** Environment variable that names the database the running backend uses. */
    public static final String TARGET_ENV_VAR = "ERP_API_TEST_TARGET_DB";

    /** Substrings that mark a target as a production database, never a test one. */
    private static final String[] PRODUCTION_MARKERS = {"prod", "production", "live_master"};

    private LiveDatabaseTarget() {
    }

    /**
     * Validates the configured target database.
     *
     * @param configured raw {@code ERP_API_TEST_TARGET_DB} value (may be null)
     * @return the normalised database name when it is a safe target
     * @throws IllegalStateException when the target is missing, is the shared
     *         development database, or is not recognisably disposable
     */
    public static String requireIsolated(String configured) {
        String name = normalize(configured);
        if (name.isEmpty()) {
            throw new IllegalStateException(
                    "Refusing to run write-capable live API tests: " + TARGET_ENV_VAR
                            + " is not set. Set it to the DISPOSABLE database the running backend "
                            + "was started against (e.g. " + TARGET_ENV_VAR + "=erp_ci_live).");
        }
        if (SHARED_DEVELOPMENT_DATABASE.equals(name)) {
            throw new IllegalStateException(
                    "Refusing to run write-capable live API tests against the shared development "
                            + "database '" + SHARED_DEVELOPMENT_DATABASE + "'. Start a dedicated "
                            + "backend against a disposable database and set " + TARGET_ENV_VAR
                            + " to that database's name.");
        }
        for (String marker : PRODUCTION_MARKERS) {
            if (name.contains(marker)) {
                throw new IllegalStateException(
                        "Refusing to run write-capable live API tests against '" + name
                                + "': a production-looking target. Point " + TARGET_ENV_VAR
                                + " at a disposable verification database instead.");
            }
        }
        // Anything else is accepted: the operator named it explicitly, and the
        // two checks above are the ones that matter (never the shared dev
        // database, never production). The resolved name is printed by
        // WriteCapableLiveApiTest so the run records what it targeted.
        return name;
    }

    /**
     * Accepts a bare database name or a JDBC URL / connection string and returns
     * the lower-cased database name it points at.
     */
    public static String normalize(String configured) {
        if (configured == null) {
            return "";
        }
        String value = configured.trim();
        if (value.isEmpty()) {
            return "";
        }
        int query = value.indexOf('?');
        if (query >= 0) {
            value = value.substring(0, query);
        }
        // jdbc:mysql://host:port/<db>  |  host:port/<db>  |  <db>
        int slash = value.lastIndexOf('/');
        if (slash >= 0) {
            value = value.substring(slash + 1);
        }
        return value.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
