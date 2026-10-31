package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * DTO for Drawing records.
 * Contains all fields used by the frontend.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DrawingDTO {
    private Long id;
    private String drawingNumber;
    private String workOrderId;
    private String workOrderItemId;
    private String itemName;
    private String drawingRevision;

    // File metadata
    private String fileName;
    private String fileType;
    private String filePath;
    private Long fileSize;

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
