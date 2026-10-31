package com.vishatech.erp.entity.production;

import com.vishatech.erp.production.api.ModelConversionProjectionPort;
import com.vishatech.erp.production.api.ModelConversionProjectionPort.ConversionOutcome;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Model entity — represents a 3D CAD model linked to a Work Order Item.
 * Stores metadata about the model file; actual file data is stored separately.
 * Supported formats: SLDPRT, SLDASM, STEP, STP, IGES, IGS
 *
 * <p>Implements {@link ModelConversionProjectionPort}: the conversion columns are
 * Production's, so the meaning of each conversion outcome is decided here rather
 * than by the shared CAD engine that reports it.
 */
@Entity
@Table(name = "models")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Model extends BaseEntity implements ModelConversionProjectionPort {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ========================
    // Model Number (backend-generated, unique)
    // ========================
    @Column(name = "model_number", nullable = false, unique = true, length = 50)
    private String modelNumber;

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
    // Model Metadata
    // ========================
    @Column(name = "model_revision", length = 50)
    @Builder.Default
    private String modelRevision = "Rev A";

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
    // 3D Conversion
    // ========================
    @Column(name = "conversion_status", length = 30)
    @Builder.Default
    private String conversionStatus = "NOT_REQUIRED";

    @Column(name = "converted_file_path", length = 500)
    private String convertedFilePath;

    @Column(name = "conversion_error", columnDefinition = "TEXT")
    private String conversionError;

    @Column(name = "conversion_started_at")
    private Instant conversionStartedAt;

    @Column(name = "conversion_completed_at")
    private Instant conversionCompletedAt;

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
    private ModelStatus verificationStatus = ModelStatus.PENDING;

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
    @OneToMany(mappedBy = "model", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("performedAt DESC")
    @Builder.Default
    private List<ModelHistory> history = new ArrayList<>();

    public void addHistory(ModelHistory h) {
        history.add(h);
        h.setModel(this);
    }

    /**
     * Longest failure reason written to {@code conversion_error}. The column is
     * TEXT, so this is a defensive bound on what a client is shown, not a column
     * limit; it is applied here because the projection owns the column.
     */
    private static final int MAX_CONVERSION_ERROR_LENGTH = 490;

    /**
     * Applies a conversion outcome reported by the CAD pipeline to this model's
     * projection columns — the single place that knows which status value, which
     * timestamps and which error text an outcome produces.
     *
     * <p>Called by the ERP-side conversion service and by the isolated CAD worker
     * through {@link ModelConversionProjectionPort}; both already hold this
     * entity inside their own transaction, and no persistence call is made here,
     * so the caller's transaction and dirty-checking semantics are unchanged.
     */
    @Override
    public void recordConversionOutcome(ConversionOutcome outcome) {
        switch (outcome.stage()) {
            case QUEUED -> {
                this.conversionStatus = ModelConversionStatus.QUEUED;
                this.conversionError = null;
                this.conversionStartedAt = outcome.at();
                this.conversionCompletedAt = null;
                this.convertedFilePath = null;
            }
            case PROCESSING -> {
                this.conversionStatus = ModelConversionStatus.PROCESSING;
                this.conversionError = null;
                this.conversionStartedAt = outcome.at();
            }
            case READY -> {
                this.conversionStatus = ModelConversionStatus.READY;
                this.conversionError = null;
                this.conversionCompletedAt = outcome.at();
                // A null path keeps the existing preview reference rather than
                // dropping a file the viewer may still be pointing at.
                if (outcome.convertedFilePath() != null) {
                    this.convertedFilePath = outcome.convertedFilePath();
                }
            }
            case FAILED -> {
                this.conversionStatus = ModelConversionStatus.FAILED;
                this.conversionError = truncate(outcome.reason());
                this.conversionCompletedAt = outcome.at();
                this.convertedFilePath = null;
            }
            case CANCELLED -> {
                // A cancelled job leaves the model as "not converted" — the
                // original file is still there and can be submitted again.
                this.conversionStatus = ModelConversionStatus.NOT_CONVERTED;
                this.conversionError = truncate(outcome.reason());
                this.conversionCompletedAt = outcome.at();
                this.convertedFilePath = null;
            }
            case UNSUPPORTED -> {
                this.conversionStatus = ModelConversionStatus.UNSUPPORTED;
                this.conversionError = truncate(outcome.reason());
                this.conversionCompletedAt = outcome.at();
                this.convertedFilePath = null;
            }
        }
    }

    private static String truncate(String reason) {
        if (reason == null) {
            return null;
        }
        return reason.length() > MAX_CONVERSION_ERROR_LENGTH
                ? reason.substring(0, MAX_CONVERSION_ERROR_LENGTH)
                : reason;
    }
}
