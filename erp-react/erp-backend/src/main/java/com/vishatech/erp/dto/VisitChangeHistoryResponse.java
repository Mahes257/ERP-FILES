package com.vishatech.erp.dto;

import com.vishatech.erp.entity.VisitChangeHistory;
import java.time.LocalDateTime;

/**
 * Read model for a single marketing-visit change-history entry.
 *
 * <p>Introduced so {@code MarketingController} returns a DTO instead of the
 * {@link VisitChangeHistory} JPA entity — matching the Purchase/Production
 * convention of never serialising entities out of a controller. The field names
 * mirror the entity's getters exactly, so the JSON contract is unchanged.
 */
public record VisitChangeHistoryResponse(
        Long id,
        Long visitId,
        String fieldName,
        String fieldKey,
        String oldValue,
        String newValue,
        String changeType,
        String changedBy,
        LocalDateTime changedAt
) {

    public static VisitChangeHistoryResponse from(VisitChangeHistory h) {
        return new VisitChangeHistoryResponse(
                h.getId(),
                h.getVisitId(),
                h.getFieldName(),
                h.getFieldKey(),
                h.getOldValue(),
                h.getNewValue(),
                h.getChangeType(),
                h.getChangedBy(),
                h.getChangedAt()
        );
    }
}
