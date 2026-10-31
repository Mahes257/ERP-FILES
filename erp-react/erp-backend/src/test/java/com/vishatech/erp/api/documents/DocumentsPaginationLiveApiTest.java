package com.vishatech.erp.api.documents;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.lessThanOrEqualTo;
import static org.hamcrest.Matchers.notNullValue;

/**
 * LIVE verification of the documents listing pagination contract through the
 * running application: the page envelope is unchanged and the request bounds
 * are normalised (negative page → first page, size below 1 → 1 row, oversized
 * size → the 200-row maximum).
 *
 * <p>Every call is a read; the suite only targets an isolated environment
 * ({@code ERP_API_TEST_ENABLED=true}).
 */
class DocumentsPaginationLiveApiTest extends BaseApiTest {

    @Test
    void thePageEnvelopeIsUnchanged() {
        auth().when().get("/documents?page=0&size=5")
                .then().statusCode(200)
                .body("content", notNullValue())
                .body("number", equalTo(0))
                .body("size", notNullValue())
                .body("totalElements", notNullValue())
                .body("totalPages", notNullValue());
    }

    @Test
    void negativePageIsNormalisedToTheFirstPage() {
        auth().when().get("/documents?page=-3&size=5")
                .then().statusCode(200).body("number", equalTo(0));
    }

    @Test
    void zeroAndNegativeSizesFallBackToOneRow() {
        auth().when().get("/documents?page=0&size=0")
                .then().statusCode(200).body("size", equalTo(1));
        auth().when().get("/documents?page=0&size=-50")
                .then().statusCode(200).body("size", equalTo(1));
    }

    @Test
    void oversizedPageRequestsAreClampedToTwoHundred() {
        auth().when().get("/documents?page=0&size=100000")
                .then().statusCode(200)
                .body("size", equalTo(200))
                .body("content.size()", lessThanOrEqualTo(200));
    }

    @Test
    void unknownDocumentReturnsNotFound() {
        auth().when().get("/documents/999999999")
                .then().statusCode(404)
                .body("success", equalTo(false))
                .body("message", notNullValue());
    }
}
