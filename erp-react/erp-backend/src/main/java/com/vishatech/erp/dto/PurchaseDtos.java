package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Shared request/response records for the Purchase module.
 *
 * Field names mirror the frontend contract exactly (camelCase), so the
 * existing Purchase frontend works unmodified once it is switched to
 * VITE_PURCHASE_DATA_MODE=api.
 */
public final class PurchaseDtos {

    private PurchaseDtos() {
    }

    // ------------------------------------------------------------------
    // Requests
    // ------------------------------------------------------------------

    public record PurchaseItemRequest(
            String itemCode,
            @NotBlank(message = "Item description is required") String product,
            String category,
            String hsn,
            String uom,
            @Positive(message = "Quantity must be positive") BigDecimal qty,
            @PositiveOrZero(message = "Rate cannot be negative") BigDecimal rate,
            BigDecimal discount,
            BigDecimal gstRate,
            String remarks,
            String specification,
            String requiredDate) {
    }

    public record PurchaseActionRequest(String remarks, String note) {
    }

    public record PurchaseCommentRequest(@NotBlank(message = "Comment text is required") String text) {
    }

    public record PurchaseAttachmentPayload(
            Long id,
            String name,
            long size,
            String type,
            String downloadUrl,
            String fileUrl,
            String dataUrl,
            String uploadedAt,
            String uploadedBy) {
    }

    public record PurchaseIdsRequest(List<Long> ids) {
    }

    public record PurchaseRfqNoRequest(String rfqNo) {
    }

    public record PurchaseStatusRequest(String status) {
    }

    public record TechnicalReviewRequest(
            String specification,
            String drawing,
            String materialGrade,
            String dimensions,
            String comments,
            String reviewStatus) {
    }

    public record PurchasePaymentRequest(
            String method,
            Boolean full,
            BigDecimal amount,
            String transactionReference,
            String paymentNo,
            String paymentDate,
            String bank,
            String currency,
            BigDecimal exchangeRate,
            BigDecimal charges,
            BigDecimal tds,
            String notes) {
    }

    public record PurchaseReversePaymentRequest(String reason) {
    }

    // ------------------------------------------------------------------
    // Responses
    // ------------------------------------------------------------------

    /** Purchase Requisition response — mirrors the PR record the UI renders. */
    public record PurchaseRequisitionResponse(
            Long id,
            String prNo,
            String title,
            String prType,
            String department,
            String project,
            String requester,
            String buyer,
            String vendor,
            String currency,
            String priority,
            String gstType,
            String incoterm,
            String transportMode,
            String warehouse,
            String costCenter,
            String location,
            String deliveryAddress,
            String company,
            String branch,
            String date,
            String expectedDate,
            BigDecimal discount,
            BigDecimal charges,
            String notes,
            String internalNotes,
            String status,
            String approvalStatus,
            String recordState,
            String approvedBy,
            String approvalDate,
            String approvalNote,
            String rejectedBy,
            String rfqNo,
            String poNo,
            BigDecimal amount,
            Map<String, Object> totals,
            Map<String, Object> technicalReview,
            List<Map<String, Object>> items,
            List<Map<String, Object>> attachments,
            List<Map<String, Object>> comments,
            String createdAt) {
    }

    public record PurchaseNextNumberResponse(String nextNumber, long nextNumberRaw) {
    }

    /** Vendor response — mirrors the frontend vendor master record. */
    public record PurchaseVendorResponse(
            Long id,
            String id2,
            String name,
            String registrationDate,
            String category,
            String city,
            String state,
            String email,
            String phone,
            String website,
            String gstin,
            String address,
            String notes,
            Double latitude,
            Double longitude,
            String formattedAddress,
            String googleMapsUrl,
            String status,
            BigDecimal rating,
            String paymentTerms,
            String currency,
            Integer leadTimeDays,
            BigDecimal onTimeDelivery,
            long orders,
            BigDecimal spend,
            String recordState,
            Map<String, Object> creditLimit,
            List<Map<String, Object>> addresses,
            List<Map<String, Object>> contacts,
            List<String> categories,
            List<Map<String, Object>> attachments) {
    }

    /** RFQ response — mirrors the frontend RFQ record. */
    public record PurchaseRfqResponse(
            Long id,
            String rfqNo,
            String title,
            String reference,
            String category,
            String description,
            String department,
            String project,
            String requester,
            String buyer,
            String priority,
            List<String> vendorNames,
            Integer validity,
            String dueDate,
            String currency,
            String incoterm,
            String deliveryAddress,
            String notes,
            Map<String, Object> commercialTerms,
            String status,
            String approvalStatus,
            BigDecimal estimatedValue,
            String awardedVendor,
            String awardedQuoteId,
            BigDecimal awardedValue,
            String awardedAt,
            String poNo,
            String prNo,
            Integer vendorCount,
            Integer quotationReceived,
            List<Map<String, Object>> items,
            List<Map<String, Object>> attachments,
            String createdAt) {
    }

    /** Supplier quotation response. */
    public record PurchaseQuotationResponse(
            Long id,
            String quotationNo,
            String rfqNo,
            String vendor,
            String submittedOn,
            BigDecimal total,
            String currency,
            Integer delivery,
            String validUntil,
            Integer leadTime,
            String paymentTerms,
            String warranty,
            BigDecimal score,
            String status,
            List<Map<String, Object>> items,
            String notes) {
    }

    /** Purchase Order response — mirrors the frontend PO record. */
    public record PurchaseOrderResponse(
            Long id,
            String poNo,
            String title,
            String vendor,
            String reference,
            String prNo,
            String rfqNo,
            String quotationNo,
            String nfaId,
            String nfaNo,
            BigDecimal awardedValue,
            String orderDate,
            String expectedDate,
            String deliveryDate,
            String currency,
            String terms,
            String gstType,
            String incoterm,
            String transportMode,
            String warehouse,
            String costCenter,
            String location,
            String department,
            String project,
            String deliveryAddress,
            String deliveryInstructions,
            String deliveryTerms,
            String warranty,
            BigDecimal freight,
            BigDecimal insurance,
            Map<String, Object> paymentTerms,
            Boolean paymentTermsRequired,
            String advanceStatus,
            BigDecimal advancePercentage,
            BigDecimal advanceAmount,
            BigDecimal balanceAmount,
            BigDecimal discount,
            BigDecimal charges,
            String notes,
            String internalNotes,
            String vendorNotes,
            String termsAndConditions,
            BigDecimal amount,
            Map<String, Object> totals,
            String status,
            String approvalStatus,
            String approvedBy,
            String approvalDate,
            String rejectedBy,
            String rejectedReason,
            String releasedBy,
            String releasedAt,
            String acknowledgedAt,
            String acknowledgedBy,
            String acknowledgementRef,
            String deliveryStatus,
            String createdBy,
            List<Map<String, Object>> items,
            List<Map<String, Object>> attachments,
            String createdAt) {
    }

    /** Purchase invoice response — mirrors the frontend invoice record. */
    public record PurchaseInvoiceResponse(
            Long id,
            String invoiceNo,
            String vendorInvoiceNo,
            String vendor,
            String vendorEmail,
            String poNo,
            String grnNo,
            String vendorReference,
            String invoiceType,
            String invoiceDate,
            String dueDate,
            BigDecimal amount,
            BigDecimal gst,
            String gstType,
            BigDecimal discount,
            BigDecimal charges,
            BigDecimal tds,
            BigDecimal retention,
            BigDecimal total,
            BigDecimal netPayable,
            BigDecimal paidAmount,
            BigDecimal outstanding,
            String currency,
            String status,
            String matchStatus,
            String paymentStatus,
            String adviceStatus,
            List<Map<String, Object>> payments,
            List<Map<String, Object>> items,
            List<Map<String, Object>> attachments,
            String notes,
            String createdAt) {
    }

    /** Envelope for the PR → RFQ conversion result (partial success allowed). */
    public record ConvertResult(List<Map<String, Object>> created, List<Map<String, Object>> errors) {
    }
}
