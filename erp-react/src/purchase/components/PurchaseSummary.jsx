/**
 * purchase/components/PurchaseSummary.jsx
 * ------------------------------------------------------------------
 * Enterprise cost summary panel (HTML template .purchase-form-card +
 * .purchase-totals-card): itemised GST breakdown, green grand-total row
 * and amount-in-words footer. Used on the right (sticky) column of
 * every create/edit/view page.
 * ------------------------------------------------------------------
 */
import { Receipt } from 'lucide-react';
import { formatAmount, formatAmountConverted, formatAmountInWords } from '../utils/purchase';

function Row({ label, value, muted = false }) {
  return (
    <div className="purchase-total-row">
      <span className={`total-label ${muted ? 'opacity-70' : ''}`}>{label}</span>
      <span className="total-value">{value}</span>
    </div>
  );
}

export default function PurchaseSummary({ totals, currency = 'INR', className = '', igst = 0, convert = false }) {
  /* `convert` (Purchase Requisition) shows stored INR totals in the
     document currency; otherwise amounts render unchanged. */
  const fmt = (value) => (convert ? formatAmountConverted(value, currency) : formatAmount(value, currency));
  const grandTotal = totals?.roundedTotal ?? totals?.total ?? 0;
  /* When the document currency isn't INR, add a converted amount-in-words
     line below the stored (INR) words — e.g. "… Dollars and … Cents". */
  const showConvertedWords = convert && currency && currency.toUpperCase() !== 'INR';
  return (
    <div className={`purchase-form-card ${className}`}>
      <div className="purchase-form-card-header">
        <h3>
          <Receipt aria-hidden="true" />
          Cost Summary
        </h3>
      </div>
      <div className="purchase-form-card-body">
        <div className="purchase-totals-card">
          <Row label="Subtotal" value={fmt(totals?.subtotal ?? 0)} />
          <Row
            label="Line Discount"
            value={`− ${fmt(totals?.lineDiscountAmount ?? 0)}`}
            muted={!(totals?.lineDiscountAmount > 0)}
          />
          <Row
            label="Discount"
            value={`− ${fmt(totals?.discountAmount ?? 0)}`}
            muted={!(totals?.discountAmount > 0)}
          />
          <Row label="Taxable Value" value={fmt(totals?.taxable ?? 0)} />
          {Number(igst) > 0 ? (
            <Row label="IGST" value={fmt(igst)} />
          ) : (
            <>
              <Row label="CGST" value={fmt(totals?.cgst ?? 0)} />
              <Row label="SGST" value={fmt(totals?.sgst ?? 0)} />
            </>
          )}
          <Row label="Charges" value={fmt(totals?.charges ?? 0)} />
          <Row
            label="Round Off"
            value={`${(totals?.roundOff ?? 0) >= 0 ? '+' : '−'} ${fmt(Math.abs(totals?.roundOff ?? 0))}`}
            muted={!totals?.roundOff}
          />
          <div className="purchase-total-row purchase-total-grand">
            <span className="total-label">Grand Total</span>
            <span className="total-value">
              {fmt(grandTotal)}
            </span>
          </div>
        </div>
        <p className="purchase-total-words">{totals?.inWords || 'Zero Rupees Only'}</p>
        {showConvertedWords && (
          <p className="purchase-total-words purchase-total-words-converted">
            {formatAmountInWords(grandTotal, currency)}
          </p>
        )}
      </div>
    </div>
  );
}
