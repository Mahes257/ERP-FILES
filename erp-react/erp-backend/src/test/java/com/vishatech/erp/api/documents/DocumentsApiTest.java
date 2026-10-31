package com.vishatech.erp.api.documents;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

class DocumentsApiTest extends BaseApiTest {

    @Test
    void documentStatsAreAvailableToAnAuthenticatedUser() {
        auth().when().get("/documents/stats").then().statusCode(200);
    }

    @Test
    void unknownDocumentReturnsNotFound() {
        auth().when().get("/documents/999999999").then().statusCode(404);
    }
}
