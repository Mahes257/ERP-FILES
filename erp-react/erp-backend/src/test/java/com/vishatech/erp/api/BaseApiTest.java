package com.vishatech.erp.api;

import io.restassured.RestAssured;
import io.restassured.builder.RequestSpecBuilder;
import io.restassured.http.ContentType;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static io.restassured.RestAssured.given;

/**
 * Base for live REST Assured tests. Set ERP_API_TEST_ENABLED=true only when
 * the existing backend is running and the configured test database is
 * available. Credentials are supplied by environment variables so tests
 * never contain a JWT or require a new authentication path.
 *
 * <p>Endpoint verification that needs an account WITHOUT a delete authority
 * (e.g. the 403 side of the Sales delete guard) uses {@link #limitedAuth()}.
 * That spec is built from an optional second credential so the default
 * single-credential run stays exactly as it was:
 *
 * <ul>
 *   <li>{@code ERP_API_TEST_USER_EMAIL} + {@code ERP_API_TEST_USER_PASSWORD} —
 *       an existing account that does not hold {@code SALES_DELETE}; or</li>
 *   <li>{@code ERP_API_TEST_ALLOW_REGISTER=true} — register a throwaway
 *       account for the run. {@code /auth/register} always assigns the plain
 *       {@code USER} role (AuthService refuses a client-supplied role), so the
 *       account cannot hold a delete authority. Only use this when the target
 *       backend is a disposable/isolated environment: registration is rate
 *       limited per IP and it writes one user row.</li>
 * </ul>
 *
 * <p>When neither is provided, {@link #limitedAuth()} skips its test rather
 * than asserting an authority it cannot prove.
 *
 * <p>Suites that can write must extend {@link WriteCapableLiveApiTest} instead:
 * it fails closed unless {@code ERP_API_TEST_TARGET_DB} names the disposable
 * database the running backend was started against, so a destructive route can
 * never be exercised against the shared development database by accident.
 */
@EnabledIfEnvironmentVariable(named = "ERP_API_TEST_ENABLED", matches = "true")
public abstract class BaseApiTest {
    protected static String accessToken;
    protected static RequestSpecification unauthenticated;
    protected static RequestSpecification authenticated;
    /** An account that does NOT hold SALES_DELETE, or {@code null} when none is configured. */
    protected static RequestSpecification withoutSalesDelete;

    @BeforeAll
    static void initializeLiveApiClient() {
        Assumptions.assumeTrue("true".equalsIgnoreCase(System.getenv("ERP_API_TEST_ENABLED")),
                "Live REST Assured tests require ERP_API_TEST_ENABLED=true");
        RestAssured.baseURI = env("ERP_API_TEST_BASE_URI", "http://localhost:8080");
        RestAssured.basePath = env("ERP_API_TEST_BASE_PATH", "/v1");
        // Diagnostics without secrets: the resolved target and, on a validation
        // failure, the request URI. Never the Authorization header.
        System.out.println("[live-api] target = " + RestAssured.baseURI + RestAssured.basePath);
        // Deliberately NOT RestAssured.enableLoggingOfRequestAndResponseIfValidationFails():
        // its only overload logs the whole request/response, which would put the
        // live Authorization header (a real token) into the CI log. Surefire's
        // expected/actual status plus the resolved target above are enough.
        unauthenticated = new RequestSpecBuilder()
                .setContentType(ContentType.JSON)
                .setAccept(ContentType.JSON)
                .build();
        if (accessToken == null) {
            String email = required("ERP_API_TEST_EMAIL", "admin@vishaktech.com");
            String password = required("ERP_API_TEST_PASSWORD", "Admin@123");
            accessToken = login(email, password);
            authenticated = new RequestSpecBuilder()
                    .addRequestSpecification(unauthenticated)
                    .addHeader("Authorization", "Bearer " + accessToken)
                    .build();
        }
        if (withoutSalesDelete == null) {
            withoutSalesDelete = limitedCaller();
        }
    }

    protected static RequestSpecification auth() {
        return given().spec(authenticated);
    }

    protected static RequestSpecification noAuth() {
        return given().spec(unauthenticated);
    }

    /**
     * The live caller used to prove that an authenticated account WITHOUT the
     * delete authority is refused (403). Skips the calling test when no such
     * account is configured.
     */
    protected static RequestSpecification limitedAuth() {
        Assumptions.assumeTrue(withoutSalesDelete != null,
                "Needs an account without SALES_DELETE: set ERP_API_TEST_USER_EMAIL + "
                        + "ERP_API_TEST_USER_PASSWORD, or ERP_API_TEST_ALLOW_REGISTER=true");
        return given().spec(withoutSalesDelete);
    }

    private static RequestSpecification limitedCaller() {
        String email = System.getenv("ERP_API_TEST_USER_EMAIL");
        String password = System.getenv("ERP_API_TEST_USER_PASSWORD");
        String token = null;
        if (email != null && !email.isBlank() && password != null && !password.isBlank()) {
            token = login(email, password);
        } else if ("true".equalsIgnoreCase(System.getenv("ERP_API_TEST_ALLOW_REGISTER"))) {
            token = registerThrowawayUser();
        }
        return token == null ? null : new RequestSpecBuilder()
                .addRequestSpecification(unauthenticated)
                .addHeader("Authorization", "Bearer " + token)
                .build();
    }

    /** Registers a one-run account; the server assigns it the plain USER role. */
    private static String registerThrowawayUser() {
        String unique = java.util.UUID.randomUUID().toString().replace("-", "");
        String email = "live-verify-" + unique.substring(0, 10) + "@vishaktech.com";
        String password = "Verify-" + unique.substring(10, 24) + "!A1";
        return given()
                .spec(unauthenticated)
                .body("{\"fullName\":\"Live Verify\",\"email\":\"" + jsonEscape(email)
                        + "\",\"password\":\"" + jsonEscape(password) + "\"}")
                .when()
                .post("/auth/register")
                .then()
                .statusCode(201)
                .extract()
                .path("data.token");
    }

    private static String login(String email, String password) {
        return given()
                .spec(unauthenticated)
                .body("{\"email\":\"" + jsonEscape(email) + "\",\"password\":\""
                        + jsonEscape(password) + "\"}")
                .when()
                .post("/auth/login")
                .then()
                .statusCode(200)
                .extract()
                .path("data.token");
    }

    private static String required(String name, String defaultValue) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? defaultValue : value;
    }

    private static String env(String name, String defaultValue) {
        return required(name, defaultValue);
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
