package com.vishatech.erp.api.marketing;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

class MarketingApiTest extends BaseApiTest {

    @Test
    void leadsCanBeReadThroughTheRealApi() {
        auth().when().get("/leads").then().statusCode(200);
    }

    @Test
    void unknownLeadReturnsNotFound() {
        auth().when().get("/leads/999999999").then().statusCode(404);
    }
}
