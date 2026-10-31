package com.vishatech.erp.api.inventory;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

class InventoryApiTest extends BaseApiTest {

    @Test
    void productsCanBeReadThroughTheRealApi() {
        auth().when().get("/products").then().statusCode(200);
    }

    @Test
    void unknownProductReturnsNotFound() {
        auth().when().get("/products/999999999").then().statusCode(404);
    }
}
