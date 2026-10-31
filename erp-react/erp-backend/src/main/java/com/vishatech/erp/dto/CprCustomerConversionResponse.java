package com.vishatech.erp.dto;

/**
 * Result of the CPR → Customer conversion.
 *
 * <p>The conversion is a linkage: it returns the client the CPR is now linked
 * to, whether that client already existed ({@code created = false}) or was just
 * created through the Client module ({@code created = true}), and whether the
 * CPR was already linked before the call ({@code alreadyLinked}, i.e. the
 * idempotent no-op path).
 */
public record CprCustomerConversionResponse(
        Long cprId,
        String prNo,
        Long customerId,
        String clientCode,
        String businessName,
        boolean created,
        boolean alreadyLinked
) {
}
