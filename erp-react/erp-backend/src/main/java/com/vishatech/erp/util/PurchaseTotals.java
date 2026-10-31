package com.vishatech.erp.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Document totals for Purchase requisitions and orders.
 *
 * This is a faithful port of the frontend's calcDocumentTotals
 * (src/purchase/utils/purchase.js) so a PR saved from the UI shows the
 * SAME amounts everywhere:
 *
 *   - GST is applied per line at that line's own gstRate
 *   - gstType drives the split: Inter-State → IGST only;
 *     Nil Rated / Exempt / Composite → no tax; otherwise CGST/SGST 50/50
 *   - document-level discount is applied proportionally across lines
 *   - per-line discount reduces that line's taxable value first
 *   - charges are NON-TAXABLE and added after GST
 */
public final class PurchaseTotals {

    private PurchaseTotals() {
    }

    public record LineTotals(
            BigDecimal amount,
            BigDecimal taxable,
            BigDecimal cgst,
            BigDecimal sgst,
            BigDecimal igst,
            BigDecimal total) {
    }

    public record DocumentTotals(
            BigDecimal subtotal,
            BigDecimal discountAmount,
            BigDecimal taxable,
            BigDecimal cgst,
            BigDecimal sgst,
            BigDecimal igst,
            BigDecimal gstTotal,
            BigDecimal charges,
            BigDecimal total) {
    }

    public enum TaxMode { INTER, INTRA, NONE }

    public static TaxMode taxMode(String gstType) {
        String type = gstType == null ? "" : gstType;
        if (type.contains("Inter-State")) {
            return TaxMode.INTER;
        }
        if (type.contains("Nil Rated") || type.contains("Exempt") || type.contains("Composite")) {
            return TaxMode.NONE;
        }
        return TaxMode.INTRA;
    }

    /**
     * @param lineAmounts  pre-tax amount (qty × rate) for each line
     * @param lineDiscounts per-line discount percentage (nullable entries)
     * @param lineGstRates  per-line GST percentage
     * @param discountPct   document-level discount percentage
     * @param chargesTotal  non-taxable charges added to the grand total
     * @param gstType       GST treatment label
     */
    public static DocumentTotals compute(List<BigDecimal> lineAmounts,
                                         List<BigDecimal> lineDiscounts,
                                         List<BigDecimal> lineGstRates,
                                         BigDecimal discountPct,
                                         BigDecimal chargesTotal,
                                         String gstType) {
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal lineDiscountAmount = BigDecimal.ZERO;
        int n = lineAmounts.size();
        BigDecimal[] bases = new BigDecimal[n];
        BigDecimal[] rates = new BigDecimal[n];

        for (int i = 0; i < n; i++) {
            BigDecimal amount = lineAmounts.get(i) == null ? BigDecimal.ZERO : lineAmounts.get(i);
            BigDecimal lineDiscountRate = lineDiscounts.get(i) == null ? BigDecimal.ZERO : lineDiscounts.get(i);
            BigDecimal discounted = amount.multiply(
                    BigDecimal.ONE.subtract(lineDiscountRate.min(BigDecimal.valueOf(100))
                            .divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)));
            bases[i] = discounted;
            rates[i] = lineGstRates.get(i) == null ? BigDecimal.ZERO : lineGstRates.get(i);
            subtotal = subtotal.add(amount);
            lineDiscountAmount = lineDiscountAmount.add(amount.subtract(discounted));
        }
        subtotal = round2(subtotal);
        lineDiscountAmount = round2(lineDiscountAmount);

        BigDecimal discountedSubtotal = round2(subtotal.subtract(lineDiscountAmount));
        BigDecimal pct = discountPct == null ? BigDecimal.ZERO : discountPct;
        BigDecimal discountAmount = round2(discountedSubtotal.multiply(pct)
                .divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal factor = discountedSubtotal.signum() > 0
                ? BigDecimal.ONE.subtract(pct.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP))
                : BigDecimal.ONE;

        TaxMode mode = taxMode(gstType);
        BigDecimal cgst = BigDecimal.ZERO;
        BigDecimal sgst = BigDecimal.ZERO;
        BigDecimal igst = BigDecimal.ZERO;
        BigDecimal taxableTotal = BigDecimal.ZERO;

        for (int i = 0; i < n; i++) {
            BigDecimal taxable = round2(bases[i].multiply(factor));
            BigDecimal rate = rates[i];
            if (mode == TaxMode.INTER) {
                igst = igst.add(taxable.multiply(rate).divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
            } else if (mode == TaxMode.INTRA) {
                cgst = cgst.add(taxable.multiply(rate).divide(BigDecimal.valueOf(200), 6, RoundingMode.HALF_UP));
                sgst = sgst.add(taxable.multiply(rate).divide(BigDecimal.valueOf(200), 6, RoundingMode.HALF_UP));
            }
            taxableTotal = taxableTotal.add(taxable);
        }
        cgst = round2(cgst);
        sgst = round2(sgst);
        igst = round2(igst);
        taxableTotal = round2(taxableTotal).subtract(discountAmount);

        BigDecimal gstTotal = round2(cgst.add(sgst).add(igst));
        BigDecimal charges = chargesTotal == null ? BigDecimal.ZERO : chargesTotal;
        BigDecimal total = round2(taxableTotal.add(gstTotal).add(charges));

        return new DocumentTotals(subtotal, discountAmount, taxableTotal, cgst, sgst, igst, gstTotal, charges, total);
    }

    private static BigDecimal round2(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }
}
