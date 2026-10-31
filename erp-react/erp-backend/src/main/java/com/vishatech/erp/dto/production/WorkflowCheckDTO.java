package com.vishatech.erp.dto.production;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

import java.util.List;

/**
 * Result of a workflow prerequisite check.
 * Indicates whether a downstream operation is ready to proceed.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class WorkflowCheckDTO {
    private boolean ready;
    private List<String> blockers;
    private List<String> warnings;
    private String currentStatus;
    private String checkedAt;
}
