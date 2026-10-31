package com.vishatech.erp.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Full Questionnaire Form response — returned by GET endpoints.  Contains the
 * form header, all section data, and related child records.
 */
public record QuestionnaireFormResponse(
        Long id,
        String formNo,
        Long visitId,
        String visitNo,
        String marketer,
        String status,

        // Optional reference to a related Marketing Travel Planner
        Long travelPlanId,
        String travelPlanNo,

        // Section 2: Basic Plant Information
        LocalDate dateOfVisit,
        String plantName,
        String plantLocation,
        Integer activeLines,
        String shutdownPeriod,
        String productionPerDay,
        String approximatePrDate,
        String basicRemarks,

        // Section 3: Plant OEM Details
        List<OemDetailDto> plantOemDetails,

        // Section 4: VRM OEM Details
        List<OemDetailDto> vrmOemDetails,

        // Section 5: Cement Mill / Ball Mill OEM
        List<OemDetailDto> cementMillOemDetails,

        // Section 6: Clinker Crusher
        List<OemDetailDto> clinkerCrusherDetails,

        // Section 7: Limestone Crusher
        String limestoneCrusherDetails,

        // Section 8: Packing Plant OEM
        List<OemDetailDto> packingPlantOemDetails,

        // Section 9: Plant Contacts
        List<PlantContactDto> plantContacts,

        // Section 11: Boss Command
        String bossCommand,

        // Signatures (base64 encoded for the frontend)
        String marketingLeadSignatureBase64,
        String authoritySignatureBase64,

        // Attachments
        List<AttachmentDto> attachments,

        // Audit
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime submittedAt,

        // Visit context (pre-populated from the parent visit)
        String companyName,
        String customerName,
        String contactPerson,
        String location
) {
    /** One OEM detail row. */
    public record OemDetailDto(
            Long id,
            String section,
            String machine,
            String ikn,
            String flSmith,
            String polysius,
            String khd,
            String claudiusPeters,
            String sinoma,
            String loesche,
            String gebrPfeiffer,
            String pfeiffer,
            String pfeifferPartNumber,
            String atox,
            String christianPfeiffer,
            String vega,
            String megatoux,
            String rollerIkn,
            String rollerFlSmith,
            String hammerImpact,
            String vendomatic,
            String buemer,
            String haverBooker,
            String china,
            String packingOemOther,
            Integer sortOrder
    ) {}

    /** One Part List row. */
    public record PartListDto(
            Long id,
            Integer sno,
            String machine,
            String ga,
            String dimensionalDrawing,
            String availabilityOfSample
    ) {}

    /** One Plant Contact row. */
    public record PlantContactDto(
            Long id,
            String department,
            String personInCharge,
            String mobile,
            String mailId,
            Integer sortOrder
    ) {}

    /** One attachment. */
    public record AttachmentDto(
            Long id,
            String name,
            String storedName,
            String contentType,
            long size,
            String label,
            LocalDateTime uploadedAt
    ) {}
}
