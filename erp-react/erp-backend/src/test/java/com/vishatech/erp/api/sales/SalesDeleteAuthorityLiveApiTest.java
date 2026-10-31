package com.vishatech.erp.api.sales;

import com.vishatech.erp.api.WriteCapableLiveApiTest;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;

/**
 * LIVE verification of the Sales delete guard through the running application:
 * the three destructive Sales Order routes (single delete, bulk delete, bulk
 * permanent delete) require {@code SALES_DELETE} and the refusal is reported as
 * the module's established 401/403 envelopes.
 *
 * <p>Reads use an id that cannot exist, so the authorised assertions exercise
 * authorization and routing without deleting anything — the suite only ever
 * targets an isolated environment ({@code ERP_API_TEST_ENABLED=true} plus
 * {@code ERP_API_TEST_TARGET_DB}, enforced by {@link WriteCapableLiveApiTest}).
 */
class SalesDeleteAuthorityLiveApiTest extends WriteCapableLiveApiTest {

    /** A well-formed destructive payload for an id that does not exist. */
    private static final String UNKNOWN_ID_BODY = "{\"ids\":[999999999]}";

    @Test
    void destructiveSalesEndpointsRejectAnUnauthenticatedCaller() {
        noAuth().body(UNKNOWN_ID_BODY).when().post("/sales-orders/bulk-delete")
                .then().statusCode(401).body("success", equalTo(false));
        noAuth().when().delete("/sales-orders/999999999")
                .then().statusCode(401).body("success", equalTo(false));
        noAuth().body(UNKNOWN_ID_BODY).when().post("/sales-orders/bulk-permanent-delete")
                .then().statusCode(401).body("success", equalTo(false));
    }

    @Test
    void destructiveSalesEndpointsRejectAnAuthenticatedUserWithoutSalesDelete() {
        // A plain USER holds SALES_CREATE (so it can read and create) but not
        // SALES_DELETE: the destructive routes must refuse it.
        limitedAuth().when().delete("/sales-orders/999999999")
                .then().statusCode(403).body("success", equalTo(false)).body("message", notNullValue());
        limitedAuth().body(UNKNOWN_ID_BODY).when().post("/sales-orders/bulk-delete")
                .then().statusCode(403).body("success", equalTo(false));
        limitedAuth().body(UNKNOWN_ID_BODY).when().post("/sales-orders/bulk-permanent-delete")
                .then().statusCode(403).body("success", equalTo(false));
    }

    @Test
    void destructiveSalesEndpointsAcceptTheSalesDeleteAuthority() {
        // ADMIN holds SALES_DELETE, so authorization passes and the unknown id is
        // reported by the service as the established 404 — the 403 above is the
        // authority check, not a routing or payload artefact.
        auth().body(UNKNOWN_ID_BODY).when().post("/sales-orders/bulk-delete")
                .then().statusCode(404).body("success", equalTo(false));
        auth().body(UNKNOWN_ID_BODY).when().post("/sales-orders/bulk-permanent-delete")
                .then().statusCode(404).body("success", equalTo(false));
    }

    @Test
    void salesReadsAndTheNotFoundEnvelopeAreUnchanged() {
        auth().when().get("/sales-orders").then().statusCode(200).body("content", notNullValue());
        auth().when().get("/sales-orders/999999999").then().statusCode(404)
                .body("success", equalTo(false))
                .body("message", notNullValue());
    }
}
