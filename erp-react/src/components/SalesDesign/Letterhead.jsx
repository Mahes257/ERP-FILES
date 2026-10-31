// ============================================================================
// Letterhead — the single company letterhead used by every sales document
// sheet (Export Invoice, Proforma Invoice, Quotation, Packing List, Delivery
// Challan, Sales Contract, Credit Note, Sales Order...).
//
// Visual source of truth: the supplied, tightly cropped letterhead asset.
// The image is intentionally used as-is so every document gets identical
// proportions, typography, separators, border and spacing.
//
// For multi-page output the letterhead is repeated per page:
//   • PDF  — quotationPrintUtils.captureSheetToPdf stamps it on every page.
//   • Print— quotationPrintUtils.printSheetWithLetterhead grafts print-only
//           copies at the top of every document section (page starts).
// ============================================================================
import './letterhead.css';

export const VH_LETTERHEAD_ASSET = '/assets/vishak-tech-letterhead.png';

export default function Letterhead({ className = '' }) {
  return (
    <div className={`letterhead ${className}`.trim()}>
      <img
        src={VH_LETTERHEAD_ASSET}
        alt="Vishak Tech letterhead"
        className="letterhead-image"
        draggable={false}
      />
    </div>
  );
}
