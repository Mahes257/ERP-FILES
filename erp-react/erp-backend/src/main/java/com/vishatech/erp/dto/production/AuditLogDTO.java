package com.vishatech.erp.dto.production;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

/**
 * DTO for audit log responses.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AuditLogDTO {
    private Long id;
    private String userId;
    private String username;
    private String module;
    private String entityType;
    private String entityId;
    private String entityDisplayId;
    private String action;
    private String oldValue;
    private String newValue;
    private String description;
    private String ipAddress;
    private String requestId;
    private String createdAt;
}
