/**
 * purchase/components/PurchaseModulePlaceholder.jsx
 * ------------------------------------------------------------------
 * Shared scaffold for Purchase workflow modules that are part of the
 * sidebar navigation but are not yet backed by a data service
 * (Approval & Costing: NFA / PCS / TPC; Technical Bid: TBE / TBER;
 * Vendor Documents).
 *
 * Renders the standard Purchase shell — the shared PurchasePageLayout
 * + PurchaseHeader (cpr/master variant, so the breadcrumb and header
 * match every other Purchase page) — plus one card describing the
 * module's purpose and its exact position in the procurement workflow.
 * Keeps these routes loadable and visually consistent without
 * duplicating layout code or inventing business logic.
 * ------------------------------------------------------------------
 */
import { ChevronRight } from 'lucide-react';
import PurchaseHeader from './PurchaseHeader';
import PurchasePageLayout from './list/PurchasePageLayout';
import PurchaseSectionCard from './PurchaseSectionCard';
import '../styles/cpr-list.css';

export default function PurchaseModulePlaceholder({
  icon: Icon,
  title,
  subtitle,
  crumb,
  workflow = [],
  note
}) {
  return (
    <PurchasePageLayout>
      <PurchaseHeader variant="cpr" crumb={crumb} icon={Icon} title={title} subtitle={subtitle} />

      <PurchaseSectionCard className="mt-5">
        <div className="space-y-5 py-1">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Position in the procurement workflow
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {workflow.map((step, index) => (
                <span key={step} className="flex items-center gap-1.5">
                  {index > 0 && <ChevronRight className="w-3 h-3 text-slate-300" aria-hidden="true" />}
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {step}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-xs leading-relaxed text-slate-500">{note}</p>
          </div>
        </div>
      </PurchaseSectionCard>
    </PurchasePageLayout>
  );
}
