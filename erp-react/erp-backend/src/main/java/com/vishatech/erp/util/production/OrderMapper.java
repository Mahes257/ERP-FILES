package com.vishatech.erp.util.production;

import com.vishatech.erp.dto.production.*;
import com.vishatech.erp.dto.ApiResponse;
import com.vishatech.erp.entity.production.*;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Mapper utility to convert between entities and DTOs.
 */
public class OrderMapper {

    private static final DateTimeFormatter ISO_FORMATTER =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    /**
     * Convert a ProductionOrder entity to a DTO for the frontend.
     */
    public static ProductionOrderDTO toDTO(ProductionOrder order) {
        if (order == null) return null;

        ProductionOrderDTO dto = ProductionOrderDTO.builder()
            .id(order.getWorkOrder()) // Frontend uses workOrder as id
            .backendId(order.getId())
            .workOrder(order.getWorkOrder())
            .salesOrderId(order.getSalesOrderId())
            .salesOrderNumber(order.getSalesOrderNumber())
            .customer(order.getCustomer())
            .customerCode(order.getCustomerCode())
            .startDate(order.getStartDate())
            .dueDate(order.getDueDate())
            .priority(order.getPriority() != null ? order.getPriority().getDisplayName() : "Medium")
            .status(order.getStatus() != null ? order.getStatus().getDisplayName() : "Draft")
            .productionType(order.getProductionType() != null ? order.getProductionType().getDisplayName() : null)
            .currentStage(order.getCurrentStage())
            .progress(order.getProgress() != null ? order.getProgress() : 0)
            .remarks(order.getRemarks())
            .product(order.getProduct())
            .productCode(order.getProductCode())
            .quantity(order.getQuantity())
            .department(order.getDepartment())
            .patternNumber(order.getPatternNumber())
            .drawingNumber(order.getDrawingNumber())
            .drawingRevision(order.getDrawingRevision())
            .batchNumber(order.getBatchNumber())
            .productionApprovedBy(order.getProductionApprovedBy())
            .productionApprovedAt(order.getProductionApprovedAt() != null ? ISO_FORMATTER.format(order.getProductionApprovedAt()) : null)
            .adminApprovedBy(order.getAdminApprovedBy())
            .adminApprovedAt(order.getAdminApprovedAt() != null ? ISO_FORMATTER.format(order.getAdminApprovedAt()) : null)
            .createdBy(order.getCreatedBy())
            .updatedBy(order.getUpdatedBy())
            .createdAt(order.getCreatedAt() != null ? ISO_FORMATTER.format(order.getCreatedAt()) : null)
            .updatedAt(order.getUpdatedAt() != null ? ISO_FORMATTER.format(order.getUpdatedAt()) : null)
            .build();

        // Map items
        if (order.getItems() != null) {
            dto.setItems(order.getItems().stream()
                .map(OrderMapper::toItemDTO)
                .collect(Collectors.toList()));
        }

        return dto;
    }

    /**
     * Convert a ProductionOrderItem entity to a DTO.
     */
    public static ProductionOrderItemDTO toItemDTO(ProductionOrderItem item) {
        if (item == null) return null;
        return ProductionOrderItemDTO.builder()
            .id(item.getId())
            .itemNameId(item.getProductName() != null ? item.getProductName().toLowerCase().replaceAll("[^a-z0-9]", "-") : null)
            .productName(item.getProductName())
            .productCode(item.getProductCode())
            .quantity(item.getQuantity())
            .dueDate(item.getDueDate())
            .producedQty(item.getProducedQuantity())
            .rejectedQty(item.getRejectedQuantity())
            .productionType(item.getProductionType() != null ? item.getProductionType().getDisplayName() : null)
            .department(item.getDepartment())
            .currentStage(item.getCurrentStage())
            .status(item.getStatus() != null ? item.getStatus().getDisplayName() : "Pending")
            .batchNumber(item.getBatchNumber())
            .patternNumber(item.getPatternNumber())
            .drawingNumber(item.getDrawingNumber())
            .drawingRevision(item.getDrawingRevision())
            .unit(item.getUnit())
            .build();
    }

    /**
     * Convert a ProductionEntry entity to a DTO.
     */
    public static ProductionEntryDTO toEntryDTO(ProductionEntry entry) {
        if (entry == null) return null;
        return ProductionEntryDTO.builder()
            .id(entry.getId())
            .workOrderId(entry.getProductionOrder() != null ? entry.getProductionOrder().getWorkOrder() : null)
            .workOrderItemId(entry.getWorkOrderItemId())
            .productionType(entry.getProductionType())
            .stage(entry.getStage())
            .inputQuantity(entry.getInputQuantity())
            .outputQuantity(entry.getOutputQuantity())
            .rejectedQuantity(entry.getRejectedQuantity())
            .operator(entry.getOperator())
            .machineCode(entry.getMachineCode())
            .entryDate(entry.getEntryDate())
            .status(entry.getStatus() != null ? entry.getStatus().getDisplayName() : null)
            .remarks(entry.getRemarks())
            .pendingQuantity(entry.getPendingQuantity())
            .createdAt(entry.getCreatedAt() != null ? ISO_FORMATTER.format(entry.getCreatedAt()) : null)
            .updatedAt(entry.getUpdatedAt() != null ? ISO_FORMATTER.format(entry.getUpdatedAt()) : null)
            .build();
    }

    /**
     * Convert a list of ProductionOrder entities to DTOs.
     */
    public static List<ProductionOrderDTO> toDTOList(List<ProductionOrder> orders) {
        if (orders == null) return List.of();
        return orders.stream().map(OrderMapper::toDTO).collect(Collectors.toList());
    }

    /**
     * Convert an Acknowledgement entity to a DTO.
     */
    public static AcknowledgementDTO toAcknowledgementDTO(Acknowledgement ack) {
        if (ack == null) return null;
        return AcknowledgementDTO.builder()
            .id(ack.getId())
            .workOrderId(ack.getWorkOrderId())
            .workOrderNumber(ack.getWorkOrderNumber())
            .productionOrderNumber(ack.getProductionOrderNumber())
            .acknowledgedBy(ack.getAcknowledgedBy())
            .acknowledgementDateTime(ack.getAcknowledgementDateTime() != null ? ISO_FORMATTER.format(ack.getAcknowledgementDateTime()) : null)
            .status(ack.getStatus())
            .remarks(ack.getRemarks())
            .createdAt(ack.getCreatedAt() != null ? ISO_FORMATTER.format(ack.getCreatedAt()) : null)
            .updatedAt(ack.getUpdatedAt() != null ? ISO_FORMATTER.format(ack.getUpdatedAt()) : null)
            .build();
    }

    /**
     * Convert a TechnicalVerification entity to a DTO.
     */
    public static TechnicalVerificationDTO toTechnicalVerificationDTO(TechnicalVerification tv) {
        if (tv == null) return null;
        return TechnicalVerificationDTO.builder()
            .id(tv.getId())
            .workOrderId(tv.getWorkOrderId())
            .itemId(tv.getItemId())
            .workOrderNumber(tv.getWorkOrderNumber())
            .productionOrderNumber(tv.getProductionOrderNumber())
            .itemProduct(tv.getItemProduct())
            .itemCode(tv.getItemCode())
            .productionType(tv.getProductionType())
            .requiredQuantity(tv.getRequiredQuantity())
            // Drawing / Pattern
            .drawingNumber(tv.getDrawingNumber())
            .drawingRevision(tv.getDrawingRevision())
            .patternNumber(tv.getPatternNumber())
            .patternRevision(tv.getPatternRevision())
            // Casting-specific
            .materialGrade(tv.getMaterialGrade())
            .specification(tv.getSpecification())
            .castingWeight(tv.getCastingWeight())
            .dimensions(tv.getDimensions())
            .machiningAllowance(tv.getMachiningAllowance())
            // Fabrication-specific
            .materialType(tv.getMaterialType())
            .thickness(tv.getThickness())
            .lengthMm(tv.getLengthMm())
            .width(tv.getWidth())
            .diameter(tv.getDiameter())
            .requiredTolerance(tv.getRequiredTolerance())
            .weldingSpecification(tv.getWeldingSpecification())
            .weldingProcess(tv.getWeldingProcess())
            .weldType(tv.getWeldType())
            .jointType(tv.getJointType())
            .hardFacingRequirement(tv.getHardFacingRequirement())
            .surfaceTreatment(tv.getSurfaceTreatment())
            .heatTreatmentRequirement(tv.getHeatTreatmentRequirement())
            // Common
            .specialInstructions(tv.getSpecialInstructions())
            .technicalInstructions(tv.getTechnicalInstructions())
            // Checklist
            .checklist(tv.getChecklist())
            // Verification
            .verificationStatus(tv.getVerificationStatus() != null ? tv.getVerificationStatus().getDisplayName() : "Pending")
            .verifiedBy(tv.getVerifiedBy())
            .verificationDateTime(tv.getVerificationDateTime() != null ? ISO_FORMATTER.format(tv.getVerificationDateTime()) : null)
            .verificationRemarks(tv.getVerificationRemarks())
            // Audit
            .createdBy(tv.getCreatedBy())
            .updatedBy(tv.getUpdatedBy())
            .createdAt(tv.getCreatedAt() != null ? ISO_FORMATTER.format(tv.getCreatedAt()) : null)
            .updatedAt(tv.getUpdatedAt() != null ? ISO_FORMATTER.format(tv.getUpdatedAt()) : null)
            .build();
    }

    /**
     * Convert a TVHistory entity to a DTO.
     */
    public static TVHistoryDTO toTVHistoryDTO(TVHistory h) {
        if (h == null) return null;
        return TVHistoryDTO.builder()
            .id(h.getId())
            .technicalVerificationId(h.getTechnicalVerification() != null ? h.getTechnicalVerification().getId() : null)
            .action(h.getAction())
            .fromStatus(h.getFromStatus() != null ? h.getFromStatus().getDisplayName() : null)
            .toStatus(h.getToStatus() != null ? h.getToStatus().getDisplayName() : null)
            .performedBy(h.getPerformedBy())
            .performedAt(h.getPerformedAt() != null ? ISO_FORMATTER.format(h.getPerformedAt()) : null)
            .remarks(h.getRemarks())
            .build();
    }

    /**
     * Convert a Drawing entity to a DTO.
     */
    public static DrawingDTO toDrawingDTO(Drawing d) {
        if (d == null) return null;
        return DrawingDTO.builder()
            .id(d.getId())
            .drawingNumber(d.getDrawingNumber())
            .workOrderId(d.getWorkOrderId())
            .workOrderItemId(d.getWorkOrderItemId())
            .itemName(d.getItemName())
            .drawingRevision(d.getDrawingRevision())
            .fileName(d.getFileName())
            .fileType(d.getFileType())
            .filePath(d.getFilePath())
            .fileSize(d.getFileSize())
            .uploadedBy(d.getUploadedBy())
            .uploadedDate(d.getUploadedDate() != null ? ISO_FORMATTER.format(d.getUploadedDate()) : null)
            .verificationStatus(d.getVerificationStatus() != null ? d.getVerificationStatus().getDisplayName() : "Pending")
            .verifiedBy(d.getVerifiedBy())
            .verificationDateTime(d.getVerificationDateTime() != null ? ISO_FORMATTER.format(d.getVerificationDateTime()) : null)
            .verificationRemarks(d.getVerificationRemarks())
            .createdBy(d.getCreatedBy())
            .updatedBy(d.getUpdatedBy())
            .createdAt(d.getCreatedAt() != null ? ISO_FORMATTER.format(d.getCreatedAt()) : null)
            .updatedAt(d.getUpdatedAt() != null ? ISO_FORMATTER.format(d.getUpdatedAt()) : null)
            .build();
    }

    /**
     * Convert a DrawingHistory entity to a DTO.
     */
    public static DrawingHistoryDTO toDrawingHistoryDTO(DrawingHistory h) {
        if (h == null) return null;
        return DrawingHistoryDTO.builder()
            .id(h.getId())
            .drawingId(h.getDrawing() != null ? h.getDrawing().getId() : null)
            .action(h.getAction())
            .fromStatus(h.getFromStatus() != null ? h.getFromStatus().getDisplayName() : null)
            .toStatus(h.getToStatus() != null ? h.getToStatus().getDisplayName() : null)
            .performedBy(h.getPerformedBy())
            .performedAt(h.getPerformedAt() != null ? ISO_FORMATTER.format(h.getPerformedAt()) : null)
            .remarks(h.getRemarks())
            .build();
    }

    /**
     * Convert a DrawingRevision entity to a DTO.
     */
    public static DrawingRevisionDTO toDrawingRevisionDTO(DrawingRevision r) {
        if (r == null) return null;
        return DrawingRevisionDTO.builder()
            .id(r.getId())
            .drawingId(r.getDrawing() != null ? r.getDrawing().getId() : null)
            .drawingNumber(r.getDrawing() != null ? r.getDrawing().getDrawingNumber() : null)
            .revision(r.getRevision())
            .revisionNumber(r.getRevisionNumber())
            .fileName(r.getFileName())
            .originalFileName(r.getOriginalFileName())
            .fileType(r.getFileType())
            .mimeType(r.getMimeType())
            .fileSize(r.getFileSize())
            .filePath(r.getFilePath())
            .description(r.getDescription())
            .changeDescription(r.getChangeDescription())
            .status(r.getStatus() != null ? r.getStatus().getDisplayName() : "Draft")
            .createdBy(r.getCreatedBy())
            .approvedBy(r.getApprovedBy())
            .approvedAt(r.getApprovedAt() != null ? ISO_FORMATTER.format(r.getApprovedAt()) : null)
            .releasedBy(r.getReleasedBy())
            .releasedAt(r.getReleasedAt() != null ? ISO_FORMATTER.format(r.getReleasedAt()) : null)
            .createdAt(r.getCreatedAt() != null ? ISO_FORMATTER.format(r.getCreatedAt()) : null)
            .updatedAt(r.getUpdatedAt() != null ? ISO_FORMATTER.format(r.getUpdatedAt()) : null)
            .build();
    }

    /**
     * Convert a Model entity to a DTO.
     */
    public static ModelDTO toModelDTO(Model m) {
        if (m == null) return null;
        return ModelDTO.builder()
            .id(m.getId())
            .modelNumber(m.getModelNumber())
            .workOrderId(m.getWorkOrderId())
            .workOrderItemId(m.getWorkOrderItemId())
            .itemName(m.getItemName())
            .modelRevision(m.getModelRevision())
            .fileName(m.getFileName())
            .fileType(m.getFileType())
            // Internal filesystem paths are never exposed to the client. The
            // frontend reconstructs access URLs from the model id (/viewer, /3d).
            .filePath(null)
            .fileSize(m.getFileSize())
            .conversionStatus(m.getConversionStatus())
            .convertedFilePath(null)
            .conversionError(m.getConversionError())
            .conversionStartedAt(m.getConversionStartedAt() != null ? ISO_FORMATTER.format(m.getConversionStartedAt()) : null)
            .conversionCompletedAt(m.getConversionCompletedAt() != null ? ISO_FORMATTER.format(m.getConversionCompletedAt()) : null)
            .uploadedBy(m.getUploadedBy())
            .uploadedDate(m.getUploadedDate() != null ? ISO_FORMATTER.format(m.getUploadedDate()) : null)
            .verificationStatus(m.getVerificationStatus() != null ? m.getVerificationStatus().getDisplayName() : "Pending")
            .verifiedBy(m.getVerifiedBy())
            .verificationDateTime(m.getVerificationDateTime() != null ? ISO_FORMATTER.format(m.getVerificationDateTime()) : null)
            .verificationRemarks(m.getVerificationRemarks())
            .createdBy(m.getCreatedBy())
            .updatedBy(m.getUpdatedBy())
            .createdAt(m.getCreatedAt() != null ? ISO_FORMATTER.format(m.getCreatedAt()) : null)
            .updatedAt(m.getUpdatedAt() != null ? ISO_FORMATTER.format(m.getUpdatedAt()) : null)
            .build();
    }

    /**
     * Convert a ModelHistory entity to a DTO.
     */
    public static ModelHistoryDTO toModelHistoryDTO(ModelHistory h) {
        if (h == null) return null;
        return ModelHistoryDTO.builder()
            .id(h.getId())
            .modelId(h.getModel() != null ? h.getModel().getId() : null)
            .action(h.getAction())
            .fromStatus(h.getFromStatus() != null ? h.getFromStatus().getDisplayName() : null)
            .toStatus(h.getToStatus() != null ? h.getToStatus().getDisplayName() : null)
            .performedBy(h.getPerformedBy())
            .performedAt(h.getPerformedAt() != null ? ISO_FORMATTER.format(h.getPerformedAt()) : null)
            .remarks(h.getRemarks())
            .build();
    }

    /**
     * Convert an AuditLog entity to a DTO.
     */
    public static AuditLogDTO toAuditLogDTO(AuditLog audit) {
        if (audit == null) return null;
        return AuditLogDTO.builder()
            .id(audit.getId())
            .userId(audit.getUserId())
            .username(audit.getUsername())
            .module(audit.getModule() != null ? audit.getModule().getDisplayName() : null)
            .entityType(audit.getEntityType())
            .entityId(audit.getEntityId())
            .entityDisplayId(audit.getEntityDisplayId())
            .action(audit.getAction() != null ? audit.getAction().getDisplayName() : null)
            .oldValue(audit.getOldValue())
            .newValue(audit.getNewValue())
            .description(audit.getDescription())
            .ipAddress(audit.getIpAddress())
            .requestId(audit.getRequestId())
            .createdAt(audit.getCreatedAt() != null ? ISO_FORMATTER.format(audit.getCreatedAt()) : null)
            .build();
    }
}
