package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * DTO for Drawing Revision records.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DrawingRevisionDTO {
    private Long id;
    private Long drawingId;
    private String drawingNumber;
    private String revision;
    private Integer revisionNumber;

    // File metadata
    private String fileName;
    private String originalFileName;
    private String fileType;
    private String mimeType;
    private Long fileSize;
    private String filePath;

    // Revision metadata
    private String description;
    private String changeDescription;

    // Status
    private String status;

    // Audit
    private String createdBy;
    private String approvedBy;
    private String approvedAt;
    private String releasedBy;
    private String releasedAt;
    private String createdAt;
    private String updatedAt;
}
