package com.vishatech.erp.service.production;

import com.vishatech.erp.dto.production.AcknowledgementDTO;
import com.vishatech.erp.entity.production.Acknowledgement;
import com.vishatech.erp.repository.production.AcknowledgementRepository;
import com.vishatech.erp.util.production.OrderMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * Service for managing Work Order acknowledgement records.
 */
@Service
@Transactional
public class AcknowledgementService {

    private final AcknowledgementRepository acknowledgementRepository;

    public AcknowledgementService(AcknowledgementRepository acknowledgementRepository) {
        this.acknowledgementRepository = acknowledgementRepository;
    }

    /**
     * Save (create or update) an acknowledgement record.
     */
    /**
     * Parses an ISO-8601 instant from the request. The frontend sends empty
     * strings for dates that have not been set yet (e.g. a Pending
     * acknowledgement); an empty value must map to null instead of throwing
     * {@link java.time.format.DateTimeParseException}.
     */
    private static Instant parseInstant(String value) {
        return (value != null && !value.isBlank()) ? Instant.parse(value) : null;
    }

    public AcknowledgementDTO saveAcknowledgement(AcknowledgementDTO request) {
        Optional<Acknowledgement> existing = acknowledgementRepository.findByWorkOrderId(request.getWorkOrderId());
        
        Acknowledgement acknowledgement;
        if (existing.isPresent()) {
            acknowledgement = existing.get();
            acknowledgement.setAcknowledgedBy(request.getAcknowledgedBy());
            acknowledgement.setAcknowledgementDateTime(parseInstant(request.getAcknowledgementDateTime()));
            acknowledgement.setStatus(request.getStatus());
            acknowledgement.setRemarks(request.getRemarks());
        } else {
            acknowledgement = Acknowledgement.builder()
                .workOrderId(request.getWorkOrderId())
                .workOrderNumber(request.getWorkOrderNumber())
                .productionOrderNumber(request.getProductionOrderNumber())
                .acknowledgedBy(request.getAcknowledgedBy())
                .acknowledgementDateTime(parseInstant(request.getAcknowledgementDateTime()))
                .status(request.getStatus() != null ? request.getStatus() : "Pending")
                .remarks(request.getRemarks())
                .build();
        }
        
        acknowledgement = acknowledgementRepository.save(acknowledgement);
        return OrderMapper.toAcknowledgementDTO(acknowledgement);
    }

    /**
     * Get acknowledgement for a specific Work Order.
     */
    @Transactional(readOnly = true)
    public AcknowledgementDTO getAcknowledgement(String workOrderId) {
        Optional<Acknowledgement> ack = acknowledgementRepository.findByWorkOrderId(workOrderId);
        return ack.map(OrderMapper::toAcknowledgementDTO).orElse(null);
    }

    /**
     * Delete acknowledgement for a specific Work Order.
     */
    public void deleteAcknowledgementsForOrder(String workOrderId) {
        acknowledgementRepository.deleteByWorkOrderId(workOrderId);
    }
}
