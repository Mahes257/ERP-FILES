package com.vishatech.erp.api.purchase;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

class PurchaseApiTest extends BaseApiTest {

    @Test
    void purchaseRequisitionsCanBeReadThroughTheRealApi() {
        auth().when().get("/api/purchase/requisitions").then().statusCode(200);
    }

    @Test
    void purchaseDashboardCanBeReadThroughTheRealApi() {
        auth().when().get("/api/purchase/dashboard/stats").then().statusCode(200);
    }

    @Test
    void unknownPurchaseRequisitionReturnsNotFound() {
        auth().when().get("/api/purchase/requisitions/999999999").then().statusCode(404);
    }
}
