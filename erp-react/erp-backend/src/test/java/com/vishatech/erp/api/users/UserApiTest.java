package com.vishatech.erp.api.users;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

class UserApiTest extends BaseApiTest {

    @Test
    void usersRequiresAuthentication() {
        noAuth().when().get("/users").then().statusCode(401);
    }

    @Test
    void usersCanBeReadThroughTheRealApi() {
        auth().when().get("/users").then().statusCode(200);
    }

    @Test
    void unknownUserReturnsNotFoundOrTheApiSpecificError() {
        auth().when().get("/users/999999999").then().statusCode(404);
    }
}
