package com.vishatech.erp.api.engineering;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

class EngineeringApiTest extends BaseApiTest {

    @Test
    void drawingsCanBeReadThroughTheRealApi() {
        auth().when().get("/drawings").then().statusCode(200);
    }

    @Test
    void modelsCanBeReadThroughTheRealApi() {
        auth().when().get("/models").then().statusCode(200);
    }
}
