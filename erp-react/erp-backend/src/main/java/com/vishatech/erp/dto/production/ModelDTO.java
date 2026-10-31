package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * DTO for Model records.
 * Contains all fields used by the frontend for 3D CAD models.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ModelDTO {
    private Long id;
    private String modelNumber;
    private String workOrderId;
    private String workOrderItemId;
    private String itemName;
    private String modelRevision;

    // File metadata
    private String fileName;
    private String fileType;
    private String filePath;
    private Long fileSize;

    // 3D Conversion
    private String conversionStatus;
    private String convertedFilePath;
    private String conversionError;
    private String conversionStartedAt;
    private String conversionCompletedAt;

    // Upload info
    private String uploadedBy;
    private String uploadedDate;

    // Verification
    private String verificationStatus;
    private String verifiedBy;
    private String verificationDateTime;
    private String verificationRemarks;

    // Audit
    private String createdBy;
    private String updatedBy;
    private String createdAt;
    private String updatedAt;
}
