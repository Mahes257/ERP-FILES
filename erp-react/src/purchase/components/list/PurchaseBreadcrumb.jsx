/**
 * purchase/components/list/PurchaseBreadcrumb.jsx
 * ------------------------------------------------------------------
 * Shared CPR breadcrumb (pr-breadcrumb / bc-link / bc-current /
 * bc-sep, styled by cpr-list.css), extracted from the Purchase
 * Requisition list. Always prefixes Dashboard > Purchase and then
 * renders the trail passed as `items`:
 *
 *   items = [
 *     { label: 'Purchase Requisition', to: '/purchase/requisition' },
 *     { label: 'Activity Log' }
 *   ]
 *
 * The last item renders as the current page; earlier items render as
 * links when they carry a `to`, otherwise as muted text.
 *
 * Deduplication: consecutive identical labels are removed so that
 * pages passing "Dashboard" or "Purchase" in their items array
 * don't produce duplicates (e.g. Dashboard > Purchase > Purchase
 * becomes Dashboard > Purchase).
 * ------------------------------------------------------------------
 */
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PurchaseBreadcrumb({ items = [] }) {
  const navigate = useNavigate();

  /* Build the full breadcrumb trail and deduplicate consecutive labels */
  const fullTrail = [
    { label: 'Dashboard', to: '/dashboard' },
    { label: 'Purchase', to: '/purchase/dashboard' },
    ...items
  ];

  const deduped = fullTrail.reduce((acc, item) => {
    if (acc.length === 0 || acc[acc.length - 1].label !== item.label) {
      acc.push(item);
    }
    return acc;
  }, []);

  return (
    <nav className="pr-breadcrumb" aria-label="Breadcrumb">
      {deduped.map((item, index) => {
        const isLast = index === deduped.length - 1;
        const isFirst = index === 0;
        const isPurchase = item.label === 'Purchase';

        if (isLast) {
          return (
            <span key={`${item.label}-${index}`} className="bc-current">
              {item.label}
            </span>
          );
        }

        const inner = (item.to && !isFirst) ? (
          <a className="bc-link" href={item.to} onClick={(e) => { e.preventDefault(); navigate(item.to); }}>
            {item.label}
          </a>
        ) : isFirst ? (
          <a className="bc-link" href="/dashboard" onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}>
            {item.label}
          </a>
        ) : isPurchase ? (
          <a className="bc-link" href="/purchase/dashboard" onClick={(e) => { e.preventDefault(); navigate('/purchase/dashboard'); }}>
            {item.label}
          </a>
        ) : (
          <span className="text-slate-500">{item.label}</span>
        );

        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-2">
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            {inner}
          </span>
        );
      })}
    </nav>
  );
}
