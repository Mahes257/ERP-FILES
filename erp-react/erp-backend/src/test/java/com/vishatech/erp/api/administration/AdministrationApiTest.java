package com.vishatech.erp.api.administration;

import com.vishatech.erp.api.BaseApiTest;
import org.junit.jupiter.api.Test;

class AdministrationApiTest extends BaseApiTest {

    @Test
    void dashboardStatsAreAvailableToAnAuthenticatedUser() {
        auth().when().get("/dashboard/stats").then().statusCode(200);
    }

    @Test
    void notificationsAreAvailableToAnAuthenticatedUser() {
        auth().when().get("/notifications").then().statusCode(200);
    }

    @Test
    void approvalSummaryIsAvailableToAnAuthenticatedUser() {
        auth().when().get("/approvals/summary").then().statusCode(200);
    }

    /**
     * The shared Pending Approvals badge reads this payload: every approval
     * module (Sales families + Production) must be present, and the global total
     * must be exactly the sum of those module counts — i.e. no record is counted
     * twice and Production is actually included.
     */
    @Test
    void approvalSummaryIncludesProductionWithoutDoubleCounting() {
        java.util.Map<String, Object> data = auth().when()
                .get("/approvals/summary")
                .then()
                .statusCode(200)
                .extract()
                .jsonPath()
                .getMap("data");

        long cpr = number(data, "cpr");
        long cprTv = number(data, "cprTv");
        long costWorkout = number(data, "costWorkout");
        long profitWorkout = number(data, "profitWorkout");
        long quotations = number(data, "quotations");
        long salesContracts = number(data, "salesContracts");
        long salesOrders = number(data, "salesOrders");
        long creditNotes = number(data, "creditNotes");
        long productionOrders = number(data, "productionOrders");
        long production = number(data, "production");
        long global = number(data, "global");
        long salesModules = cpr + cprTv + costWorkout + profitWorkout
                + quotations + salesContracts + salesOrders + creditNotes;

        // The Production parent aggregates its approval queue and the sidebar sums
        // it with the Sales parents; the global total covers both exactly once.
        org.assertj.core.api.Assertions.assertThat(production).isEqualTo(productionOrders);
        org.assertj.core.api.Assertions.assertThat(number(data, "customerPurchaseRequest") + number(data, "salesExecution"))
                .isEqualTo(salesModules);
        org.assertj.core.api.Assertions.assertThat(global).isEqualTo(salesModules + productionOrders);
    }

    private static long number(java.util.Map<String, Object> data, String key) {
        Object value = data.get(key);
        return value instanceof Number n ? n.longValue() : 0L;
    }
}
