package com.vishatech.cadworker;

/**
 * Entry point / mode switch for the isolated CAD conversion worker.
 *
 * <p>One artifact, two processes:
 *
 * <pre>
 *   # normal ERP (no CAD worker beans at all)
 *   java -jar erp-backend.jar
 *
 *   # isolated CAD worker (no port, no web layer)
 *   java -jar erp-backend.jar --erp.cad.worker.mode=true
 *   ERP_CAD_WORKER_MODE=true java -jar erp-backend.jar
 * </pre>
 *
 * <p>The worker is a separate <em>process</em> so a slow, memory-hungry or
 * crashing CAD engine can never block Spring Boot request threads or take the
 * ERP down. It shares only the database queue and the controlled storage
 * directory with the ERP — no HTTP port, no CORS, no public surface.
 */
public final class CadWorkerApplication {

    /** Environment variable used by service managers / containers. */
    public static final String MODE_ENV = "ERP_CAD_WORKER_MODE";

    /** Equivalent JVM/spring property. */
    public static final String MODE_PROPERTY = "erp.cad.worker.mode";

    private CadWorkerApplication() {
    }

    /**
     * True when this JVM launch should start the CAD worker instead of the
     * ERP. Checked via environment variable, system property or command-line
     * argument, so it works with {@code java -jar}, containers and test harnesses.
     */
    public static boolean isWorkerMode(String[] args) {
        String env = System.getenv(MODE_ENV);
        if ("true".equalsIgnoreCase(env) || "1".equals(env)) {
            return true;
        }
        if ("true".equalsIgnoreCase(System.getProperty(MODE_PROPERTY))) {
            return true;
        }
        if (args != null) {
            for (String arg : args) {
                if (arg == null) {
                    continue;
                }
                if (("--" + MODE_PROPERTY + "=true").equalsIgnoreCase(arg)
                        || (MODE_PROPERTY + "=true").equalsIgnoreCase(arg)) {
                    return true;
                }
            }
        }
        return false;
    }

    public static void main(String[] args) {
        CadWorkerConfiguration.main(args);
    }
}
