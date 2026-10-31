package com.vishatech.erp.dto;

/**
 * Result of a Sales Execution conversion — identifies the newly created target
 * document (module key, id and number) so the frontend can navigate to it.
 */
public record ConversionResult(
        String module,
        Long id,
        String number,
        String message
) {
}
