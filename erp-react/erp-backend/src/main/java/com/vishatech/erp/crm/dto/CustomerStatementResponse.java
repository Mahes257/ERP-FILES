package com.vishatech.erp.crm.dto;

import java.math.BigDecimal;
import java.util.List;

public record CustomerStatementResponse(
        Long clientId,
        String clientName,
        BigDecimal openingBalance,
        List<Entry> entries,
        BigDecimal closingBalance
) {
    public record Entry(
            String date,
            String type,
            String refNo,
            String description,
            BigDecimal debit,
            BigDecimal credit,
            BigDecimal balance
    ) {
    }
}
