package com.vishatech.erp.dto.production;

/**
 * Work center master row (Production → Settings → Work Centers).
 *
 * <p>{@code id} is the user-entered work center code (e.g. {@code WC-001});
 * {@code backendId} is the internal numeric primary key.
 */
public record ProductionWorkCenterDTO(
        String id,
        Long backendId,
        String name,
        String department,
        String location,
        String supervisor,
        String status,
        String description
) {
}
