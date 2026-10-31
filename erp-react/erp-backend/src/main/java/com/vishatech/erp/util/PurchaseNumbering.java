package com.vishatech.erp.util;

import org.springframework.stereotype.Component;

import java.time.Year;
import java.util.List;

/**
 * Document numbering for the Purchase module.
 *
 * Follows the existing ERP convention (see CprService.nextSequence):
 * the next number is derived from the highest numeric suffix of the
 * current-year documents (never from the row count alone), so deleted
 * or imported records can never cause a duplicate number.
 *
 * Formats (matching the frontend defaults):
 *   PR-YYYY-NNNN, RFQ-YYYY-NNNN, PO-YYYY-NNNN, VINV-YYYY-NNNN,
 *   GRN-YYYY-NNNN, MFR-YYYY-NNNN, SHP-YYYY-NNNN, INV-YYYY-NNNN,
 *   QT-YYYY-NNNN, V-NNNN (vendor codes, no year).
 */
@Component
public class PurchaseNumbering {

    public String nextPrNo(long maxExistingSequence) {
        return numbered("PR", maxExistingSequence, 4);
    }

    public String nextRfqNo(long maxExistingSequence) {
        return numbered("RFQ", maxExistingSequence, 4);
    }

    public String nextPoNo(long maxExistingSequence) {
        return numbered("PO", maxExistingSequence, 4);
    }

    public String nextInvoiceNo(long maxExistingSequence) {
        return numbered("VINV", maxExistingSequence, 4);
    }

    public String nextGrnNo(long maxExistingSequence) {
        return numbered("GRN", maxExistingSequence, 4);
    }

    public String nextMfrNo(long maxExistingSequence) {
        return numbered("MFR", maxExistingSequence, 4);
    }

    public String nextShipmentNo(long maxExistingSequence) {
        return numbered("SHP", maxExistingSequence, 4);
    }

    public String nextInventoryNo(long maxExistingSequence) {
        return numbered("INV", maxExistingSequence, 4);
    }

    public String nextQuotationNo(long maxExistingSequence) {
        return numberedPlain("QT", maxExistingSequence, 3);
    }

    public String nextVendorCode(long maxExistingSequence) {
        return "V-" + String.format("%04d", maxExistingSequence + 1);
    }

    /** Highest numeric suffix of docNumbers sharing the current-year prefix. */
    public long maxSequence(List<String> docNumbers, String prefix) {
        String fullPrefix = prefix + "-" + Year.now().getValue() + "-";
        long max = 0;
        if (docNumbers == null) {
            return 0;
        }
        for (String number : docNumbers) {
            if (number != null && number.startsWith(fullPrefix)) {
                try {
                    max = Math.max(max, Long.parseLong(number.substring(fullPrefix.length())));
                } catch (NumberFormatException ignored) {
                    // skip malformed numbers, same as CprService
                }
            }
        }
        return max;
    }

    /** Highest numeric suffix of plain-numbered records (V-0001). */
    public long maxPlainSequence(List<String> docNumbers, String prefix) {
        String fullPrefix = prefix + "-";
        long max = 0;
        if (docNumbers == null) {
            return 0;
        }
        for (String number : docNumbers) {
            if (number != null && number.startsWith(fullPrefix) && !number.startsWith(fullPrefix + "2")) {
                // Vendor codes are "V-0001"; exclude accidental "V-2026-..." matches.
                String suffix = number.substring(fullPrefix.length());
                if (suffix.matches("\\d{1,9}")) {
                    try {
                        max = Math.max(max, Long.parseLong(suffix));
                    } catch (NumberFormatException ignored) {
                        // skip
                    }
                }
            }
        }
        return max;
    }

    private String numbered(String prefix, long nextSequence, int pad) {
        return prefix + "-" + Year.now().getValue() + "-"
                + String.format("%0" + pad + "d", nextSequence + 1);
    }

    /** Plain-numbered format without year: QT-001, QT-002, etc. */
    private String numberedPlain(String prefix, long nextSequence, int pad) {
        return prefix + "-" + String.format("%0" + pad + "d", nextSequence + 1);
    }
}
