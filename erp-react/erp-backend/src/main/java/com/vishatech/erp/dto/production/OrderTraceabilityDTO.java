package com.vishatech.erp.dto.production;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

import java.util.List;

/**
 * End-to-end traceability for a Production Order through all ERP modules.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OrderTraceabilityDTO {
    private Long orderBackendId;
    private String workOrder;
    private String salesOrderNumber;
    private String customer;
    private String product;
    private Integer quantity;
    private String productionType;
    private String orderStatus;
    private List<ModuleTraceDTO> technicalVerifications;
    private List<ModuleTraceDTO> drawings;
    private List<ModuleTraceDTO> models;
    private List<ModuleTraceDTO> productionEntries;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ModuleTraceDTO {
        private String module;
        private String identifier;
        private String status;
        private String verifiedBy;
        private String verifiedAt;
        private Integer inputQuantity;
        private Integer outputQuantity;
        private Integer rejectedQuantity;
    }
}
