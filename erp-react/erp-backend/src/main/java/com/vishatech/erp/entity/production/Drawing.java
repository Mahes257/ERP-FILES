package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Drawing entity — represents a 2D engineering drawing linked to a Work Order Item.
 * Stores metadata about the drawing file; actual file data is stored separately.
 */
@Entity
@Table(name = "drawings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Drawing extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ========================
    // Drawing Number (backend-generated, unique)
    // ========================
    @Column(name = "drawing_number", nullable = false, unique = true, length = 50)
    private String drawingNumber;

    // ========================
    // Work Order Reference
    // ========================
    @Column(name = "work_order_id", nullable = false, length = 20)
    private String workOrderId;

    @Column(name = "work_order_item_id", length = 100)
    private String workOrderItemId;

    @Column(name = "item_name", length = 255)
    private String itemName;

    // ========================
    // Drawing Metadata
    // ========================
    @Column(name = "drawing_revision", length = 50)
    @Builder.Default
    private String drawingRevision = "Rev A";

    // ========================
    // Current Revision Relationship
    // ========================
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_revision_id")
    private DrawingRevision currentRevision;

    // ========================
    // Revisions Collection
    // ========================
    @OneToMany(mappedBy = "drawing", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @OrderBy("revisionNumber ASC")
    @Builder.Default
    private List<DrawingRevision> revisions = new ArrayList<>();

    // ========================
    // File Metadata (actual file stored in filesystem)
    // ========================
    @Column(name = "file_name", length = 255)
    private String fileName;

    @Column(name = "file_type", length = 20)
    private String fileType;

    @Column(name = "file_path", length = 500)
    private String filePath;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "file_checksum", length = 100)
    private String fileChecksum;

    // ========================
    // Upload Info
    // ========================
    @Column(name = "uploaded_by", length = 255)
    private String uploadedBy;

    @Column(name = "uploaded_date")
    private Instant uploadedDate;

    // ========================
    // Verification Status
    // ========================
    @Enumerated(EnumType.STRING)
    @Column(name = "verification_status", length = 30)
    @Builder.Default
    private DrawingStatus verificationStatus = DrawingStatus.PENDING;

    @Column(name = "verified_by", length = 255)
    private String verifiedBy;

    @Column(name = "verification_datetime")
    private Instant verificationDateTime;

    @Column(name = "verification_remarks", columnDefinition = "TEXT")
    private String verificationRemarks;

    // ========================
    // Audit
    // ========================
    @Column(name = "created_by", length = 255)
    private String createdBy;

    @Column(name = "updated_by", length = 255)
    private String updatedBy;

    // ========================
    // History
    // ========================
    @OneToMany(mappedBy = "drawing", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("performedAt DESC")
    @Builder.Default
    private List<DrawingHistory> history = new ArrayList<>();

    public void addHistory(DrawingHistory h) {
        history.add(h);
        h.setDrawing(this);
    }

    public void addRevision(DrawingRevision r) {
        revisions.add(r);
        r.setDrawing(this);
    }

    public void removeRevision(DrawingRevision r) {
        revisions.remove(r);
        r.setDrawing(null);
    }
}
