package com.vishatech.erp.api.finance;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

class FinanceApiTest extends BaseApiTest {

    @Test
    void invoicesCanBeReadThroughTheRealApi() {
        auth().when().get("/invoices").then().statusCode(200);
    }

    @Test
    void paymentReceiptsCanBeReadThroughTheRealApi() {
        auth().when().get("/payment-receipts").then().statusCode(200);
    }

    @Test
    void unknownInvoiceReturnsNotFound() {
        auth().when().get("/invoices/999999999").then().statusCode(404);
    }
}
