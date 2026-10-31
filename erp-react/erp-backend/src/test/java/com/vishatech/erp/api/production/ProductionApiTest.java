package com.vishatech.erp.api.production;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

class ProductionApiTest extends BaseApiTest {

    @Test
    void productionOrdersCanBeReadThroughTheRealApi() {
        auth().when().get("/production-orders").then().statusCode(200);
    }

    @Test
    void unknownProductionOrderReturnsNotFound() {
        auth().when().get("/production-orders/999999999").then().statusCode(404);
    }
}
