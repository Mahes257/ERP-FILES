/**
 * purchase/components/list/PurchasePageLayout.jsx
 * ------------------------------------------------------------------
 * Shared page shell for every Purchase list page — the exact root
 * wrapper used by the Purchase Requisition List (the MASTER design).
 * All Purchase pages render through this so the outer geometry is
 * identical. Optional `className` may append extra utilities.
 *
 * When `staticHeader` is provided it is rendered in a non-scrolling
 * wrapper at the top; the remaining `children` go into a scrollable
 * content area below. This enables the "static header + scrollable
 * content" layout requested for the Purchase Requisition page.
 *
 * The Purchase module ALWAYS uses the light theme. The purchase-light-
 * override.css is imported at the PurchaseLayout level to force light
 * colors regardless of global dark mode.
 * ------------------------------------------------------------------
 */

/* Restores the missing box on form-page dropdown triggers whose
   Tailwind border utilities lose the cascade to the app-wide unlayered
   `button { border: none; background: none }` reset. Rules inside are
   scoped to form-page containers only — see the file header. */
import '../../styles/form-field-boxes.css';

export default function PurchasePageLayout({ children, className = '', staticHeader }) {
  return (
    <div
      className={`purchase-page cpr-page flex-1 flex flex-col bg-app font-sans antialiased text-slate-800 w-full max-w-full min-w-0${className ? ` ${className}` : ''}`}
    >
      {staticHeader && (
        <div className="cpr-page-static-header">
          {staticHeader}
        </div>
      )}
      <div className={`cpr-page-scroll-content${staticHeader ? '' : ''}`}>
        {children}
      </div>
    </div>
  );
}
