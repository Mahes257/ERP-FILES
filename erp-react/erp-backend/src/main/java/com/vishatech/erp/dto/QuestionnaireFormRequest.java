package com.vishatech.erp.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Writable fields for a Questionnaire Form. Every field is optional (patch
 * semantics).  The service applies only non-null values and validates the
 * business rules (visit association, duplicate prevention, status
 * transitions).
 */
public record QuestionnaireFormRequest(
        Long visitId,

        // Optional reference to a related Marketing Travel Planner
        Long travelPlanId,

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

        // Section 10 & 12: Signatures (base64 encoded)
        String marketingLeadSignatureBase64,
        String authoritySignatureBase64
) {
    /** One OEM detail row within the Q Form. */
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
}
