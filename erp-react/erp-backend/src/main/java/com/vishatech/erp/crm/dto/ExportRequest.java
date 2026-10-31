package com.vishatech.erp.crm.dto;

import java.util.List;

public record ExportRequest(
        List<Long> ids,
        String format,
        String stage,
        String status,
        String search
) {
}
