package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * Request body for status transitions (approval, stage changes, etc.).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StatusTransitionRequest {
    private String remarks;
}
