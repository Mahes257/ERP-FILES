package com.vishatech.erp.dto.production;

/**
 * Status master row (Production → Settings → Status Masters).
 *
 * <p>{@code key} reproduces the composite identity the screen has always used
 * ({@code category-name}, slugged) so existing row-keying keeps working, while
 * {@code id} is the numeric primary key used by the update/delete endpoints —
 * a status name may legitimately change, so the name is never used as the key.
 */
public record ProductionStatusMasterDTO(
        Long id,
        String key,
        String name,
        String category,
        String description,
        Boolean active,
        Integer displayOrder
) {
}
