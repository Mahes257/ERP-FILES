package com.vishatech.erp.entity.production;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Drawing Revision entity — represents a specific revision of a Drawing.
 * Each Drawing can have multiple revisions (Rev A, Rev B, Rev C, etc.).
 * Revisions are immutable once released/approved.
 */
@Entity
@Table(name = "drawing_revisions",
       uniqueConstraints = @UniqueConstraint(
           columnNames = {"drawing_id", "revision"}
       ))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DrawingRevision extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ========================
    // Drawing Reference
    // ========================
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "drawing_id", nullable = false)
    private Drawing drawing;

    // ========================
    // Revision Info
    // ========================
    @Column(name = "revision", nullable = false, length = 50)
    private String revision;

    @Column(name = "revision_number")
    private Integer revisionNumber;

    // ========================
    // File Metadata
    // ========================
    @Column(name = "file_name", length = 255)
    private String fileName;

    @Column(name = "original_file_name", length = 255)
    private String originalFileName;

    @Column(name = "file_type", length = 20)
    private String fileType;

    @Column(name = "mime_type", length = 100)
    private String mimeType;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "file_path", length = 500)
    private String filePath;

    @Column(name = "file_checksum", length = 100)
    private String fileChecksum;

    // ========================
    // Revision Metadata
    // ========================
    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "change_description", columnDefinition = "TEXT")
    private String changeDescription;

    // ========================
    // Status
    // ========================
    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 30)
    @Builder.Default
    private DrawingRevisionStatus status = DrawingRevisionStatus.DRAFT;

    // ========================
    // Audit
    // ========================
    @Column(name = "created_by", length = 255)
    private String createdBy;

    @Column(name = "approved_by", length = 255)
    private String approvedBy;

    @Column(name = "approved_at")
    private Instant approvedAt;

    @Column(name = "released_by", length = 255)
    private String releasedBy;

    @Column(name = "released_at")
    private Instant releasedAt;
}
