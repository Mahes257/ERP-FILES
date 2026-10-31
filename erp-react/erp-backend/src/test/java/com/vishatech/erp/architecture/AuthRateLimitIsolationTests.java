package com.vishatech.erp.architecture;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Keeps the authentication rate limits honest across the test suite.
 *
 * <p>{@code AuthRateLimitFilter} is a real Spring bean, so it also runs inside
 * {@code MockMvc}: every test class in the same Spring context shares one
 * {@code RateLimiter}, and every MockMvc call arrives from the same client IP.
 * The limiter is therefore keyed per <em>suite</em>, not per test class, unless
 * a class pins its own budget with {@code @TestPropertySource}. That is how a
 * class can silently consume the production-sized budget (5 registrations per
 * IP per hour, for example) and leave a later class — or the same class on a
 * re-run — receiving an order-dependent {@code 429} instead of its real
 * assertion.
 *
 * <p>This guard freezes the convention the suite already follows:
 *
 * <ol>
 *   <li>every test source that POSTs to an authentication endpoint declares
 *       its own {@code app.rate-limit.*} budget, so no test depends on what ran
 *       before it;</li>
 *   <li>{@code AbstractSecurityTest} additionally CLEARS the auth windows
 *       before each test method. A budget alone is not isolation: two classes
 *       with the same {@code @TestPropertySource} are served by the same cached
 *       context – and therefore by the same limiter and the same per-IP
 *       counter – so a class could still receive 429 for what ran before it.
 *       The reset makes each method start from its own budget while leaving the
 *       throttling itself provable (rule 2 below);</li>
 *   <li>{@code RateLimitTests} still proves the throttling itself, with low
 *       limits and an explicit {@code 429};</li>
 *   <li>the production limits in {@code src/main/resources} keep their
 *       documented values — a passing test may never be bought by loosening
 *       production policy;</li>
 *   <li>the shared test profile does not override the rate limits globally, so
 *       a class that forgets its budget is caught here rather than quietly
 *       inheriting a larger one.</li>
 * </ol>
 *
 * <p>Source-level, in the spirit of {@link SourceHygieneTests}: the first rule
 * can only be checked by reading the test sources.
 */
class AuthRateLimitIsolationTests {

    /** Relative to the module basedir (Surefire's working directory). */
    private static final Path TEST_SOURCE_ROOT = Paths.get("src", "test", "java");
    private static final Path PRODUCTION_PROPERTIES =
            Paths.get("src", "main", "resources", "application.properties");
    private static final Path TEST_PROPERTIES =
            Paths.get("src", "test", "resources", "application.properties");

    /** A MockMvc/Spring-context call to one of the rate-limited endpoints. */
    private static final String AUTH_POST = "post(\"/auth/";

    /** The property prefix every such class must pin for itself. */
    private static final String RATE_LIMIT_PREFIX = "app.rate-limit";

    /**
     * The live REST Assured base is gated on {@code ERP_API_TEST_ENABLED} and
     * targets a real running server over HTTP; it is not a Spring test context,
     * so it cannot (and must not) pin a MockMvc budget. Its rate limiting is the
     * deployed instance's own policy and is exercised by RateLimitTests.
     */
    private static final Set<String> EXEMPT =
            Set.of("com/vishatech/erp/api/BaseApiTest.java");

    /**
     * Sanity floor for the detector: if the scan stops finding the suite's auth
     * calls, the first rule would pass vacuously. The suite has had at least
     * twenty such classes since the rate limiter was introduced.
     */
    private static final int MINIMUM_AUTH_TEST_SOURCES = 20;

    /** The production policy — may only be changed deliberately, never for tests. */
    private static final List<String> PRODUCTION_LIMITS = List.of(
            "app.rate-limit.login.max-per-ip=${ERP_RATE_LIMIT_LOGIN_IP:20}",
            "app.rate-limit.login.max-per-email-ip=${ERP_RATE_LIMIT_LOGIN_EMAIL_IP:10}",
            "app.rate-limit.login.window-minutes=${ERP_RATE_LIMIT_LOGIN_WINDOW:15}",
            "app.rate-limit.register.max-per-ip=${ERP_RATE_LIMIT_REGISTER_IP:5}",
            "app.rate-limit.register.window-minutes=${ERP_RATE_LIMIT_REGISTER_WINDOW:60}",
            "app.rate-limit.refresh.max-per-ip=${ERP_RATE_LIMIT_REFRESH_IP:60}",
            "app.rate-limit.refresh.window-minutes=${ERP_RATE_LIMIT_REFRESH_WINDOW:15}");

    @Test
    void everyAuthCallingTestPinsItsOwnRateLimitBudget() throws IOException {
        assertTrue(Files.isDirectory(TEST_SOURCE_ROOT),
                "Expected to run from the erp-backend module directory, but "
                        + TEST_SOURCE_ROOT.toAbsolutePath() + " is not a directory");

        Set<String> authSources = new LinkedHashSet<>();
        Set<String> withoutBudget = new LinkedHashSet<>();
        try (Stream<Path> files = Files.walk(TEST_SOURCE_ROOT)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                String relative = TEST_SOURCE_ROOT.relativize(file).toString().replace('\\', '/');
                if (EXEMPT.contains(relative)) {
                    continue;
                }
                String source = Files.readString(file);
                if (!source.contains(AUTH_POST)) {
                    continue;
                }
                authSources.add(relative);
                if (!source.contains(RATE_LIMIT_PREFIX)) {
                    withoutBudget.add(relative);
                }
            }
        }

        assertTrue(authSources.size() >= MINIMUM_AUTH_TEST_SOURCES,
                "Only " + authSources.size() + " test sources POST to an auth endpoint; the scan looks "
                        + "broken, which would make this guard pass vacuously. Detected: " + authSources);

        assertTrue(withoutBudget.isEmpty(),
                "These test classes call a rate-limited auth endpoint without pinning their own budget, "
                        + "so they share whatever is left of the production-sized bucket with every other "
                        + "class in the same Spring context and can fail with an order-dependent 429. Add "
                        + "the @TestPropertySource(app.rate-limit.*) block the rest of the security suite "
                        + "uses: " + withoutBudget);
    }

    /**
     * The reset that makes the shared contexts order-independent. Removing it
     * reintroduces the cross-class 429 this suite was fixed for, in a way no
     * per-class budget can prevent.
     */
    @Test
    void theSharedContextsAuthWindowsAreClearedBetweenTests() throws IOException {
        String base = Files.readString(Paths.get(
                "src", "test", "java", "com", "vishatech", "erp", "security", "AbstractSecurityTest.java"));

        assertTrue(base.contains("@BeforeEach") && base.contains("rateLimiter.clear(\"auth:\")"),
                "AbstractSecurityTest must clear the per-IP auth windows before each test method, or "
                        + "classes sharing one cached context spend each other's auth budget and fail "
                        + "with an order-dependent 429");
        assertTrue(base.contains("rateLimiter.clear(\"login:\")"),
                "The per-email+IP login bucket AuthService enforces must be cleared too");

        // Clearing must stay scoped to the auth buckets, never a full wipe:
        // the limiter serves any keyed budget, and a blanket clear would
        // silently drop state this guard says nothing about.
        String limiter = Files.readString(Paths.get(
                "src", "main", "java", "com", "vishatech", "erp", "security", "RateLimiter.java"));
        assertTrue(limiter.contains("public void clear(String prefix)"),
                "RateLimiter must keep a scoped clear(prefix); a clear-all would hide unrelated state");
    }

    @Test
    void throttlingItselfIsStillProvenWithLowLimits() throws IOException {
        String source = Files.readString(Paths.get(
                "src", "test", "java", "com", "vishatech", "erp", "security", "RateLimitTests.java"));

        // The limiter must still be exercised at a deliberately small budget...
        assertTrue(source.contains("app.rate-limit.register.max-per-ip=4"),
                "RateLimitTests must keep pinning a low register budget so the throttle is provable");
        assertTrue(source.contains("app.rate-limit.login.max-per-ip=4"),
                "RateLimitTests must keep pinning a low login budget so the brute-force guard is provable");
        // ...and must still assert the rejection, for both endpoints.
        assertTrue(source.contains("registrationIsThrottledPerIp") && source.contains("is(429)"),
                "RateLimitTests must still assert that exceeding the budget returns 429");
        assertTrue(source.contains("bruteForceLoginAttemptsReturn429") && source.contains("is(429)"),
                "RateLimitTests must still assert that brute-force logins return 429");
    }

    @Test
    void productionRateLimitPolicyIsUnchanged() throws IOException {
        String source = Files.readString(PRODUCTION_PROPERTIES);
        for (String limit : PRODUCTION_LIMITS) {
            assertTrue(source.contains(limit),
                    "Production rate-limit policy changed or was loosened (" + limit + " is missing). "
                            + "Tests must pin their own budget in @TestPropertySource instead of relaxing "
                            + "the limits every deployment inherits.");
        }
    }

    @Test
    void sharedTestProfileDoesNotOverrideRateLimits() throws IOException {
        String source = Files.readString(TEST_PROPERTIES);
        assertFalse(source.contains(RATE_LIMIT_PREFIX),
                "The shared test profile must not grant a blanket rate-limit budget: every auth-calling "
                        + "class pins its own, so a class that forgets is caught by "
                        + "everyAuthCallingTestPinsItsOwnRateLimitBudget instead of silently inheriting "
                        + "a larger budget.");
    }
}
