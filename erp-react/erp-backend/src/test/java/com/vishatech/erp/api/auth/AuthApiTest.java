package com.vishatech.erp.api.auth;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.notNullValue;

class AuthApiTest extends BaseApiTest {

    @Test
    void loginReturnsTheRealAccessToken() {
        org.junit.jupiter.api.Assertions.assertNotNull(accessToken);
    }

    @Test
    void protectedMeRejectsUnauthenticatedRequests() {
        noAuth().when().get("/auth/me").then().statusCode(401);
    }

    @Test
    void protectedMeAcceptsTheTokenIssuedByLogin() {
        auth().when().get("/auth/me").then().statusCode(200)
                .body("data.email", notNullValue());
    }
}
