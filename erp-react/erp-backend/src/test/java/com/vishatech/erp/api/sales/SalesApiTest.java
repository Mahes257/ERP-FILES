package com.vishatech.erp.api.sales;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

class SalesApiTest extends BaseApiTest {

    @Test
    void salesOrdersCanBeReadThroughTheRealApi() {
        auth().when().get("/sales-orders").then().statusCode(200);
    }

    @Test
    void unknownSalesOrderReturnsNotFound() {
        auth().when().get("/sales-orders/999999999").then().statusCode(404);
    }
}
