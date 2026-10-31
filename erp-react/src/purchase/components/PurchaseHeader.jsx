/**
 * purchase/components/PurchaseHeader.jsx
 * ------------------------------------------------------------------
 * Reusable page header for the Purchase module.
 *
 * Default (`po`) variant renders the template's .po-breadcrumb +
 * .po-page-header:
 *
 *   Dashboard › Purchase › <crumb>        [actions]
 *   <icon> Page Title
 *   subtitle
 *
 * `variant="cpr"` renders the CPR list header (pr-breadcrumb +
 * pr-page-header — the design standard used by every Purchase list
 * page, styled by cpr-list.css):
 *
 *   Dashboard > Purchase > <crumb>        [actions]
 *   <icon> Page Title
 *
 * `crumb` may be a plain string ("Purchase Requisition", "Technical
 * Review") or an array of { label, to? } objects for full breadcrumb
 * control. Both variants accept either shape: string entries are
 * rendered as static text and object entries render their `label`
 * (as a link when `to` is present) — crumb objects are never
 * rendered as raw React children.
 * ------------------------------------------------------------------
 */
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PurchaseBreadcrumb from './list/PurchaseBreadcrumb';

export default function PurchaseHeader({ title, subtitle, crumb, actions, icon: Icon, variant = 'po' }) {
  const navigate = useNavigate();

  const crumbs = Array.isArray(crumb)
    ? crumb
    : String(crumb || '')
        .split('·')
        .map((part) => part.trim())
        .filter(Boolean);

  if (variant === 'cpr') {
    const breadcrumbItems =
      crumbs.length > 0 && typeof crumbs[0] === 'object'
        ? crumbs
        : crumbs.map((part) => ({ label: part }));

    return (
      <header>
        <PurchaseBreadcrumb items={breadcrumbItems} />

        <div className="pr-page-header">
          <div className="pr-page-header-title">
            <h1>
              {Icon && <Icon aria-hidden="true" />}
              {title}
            </h1>
            {subtitle && <p className="po-page-header-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="pr-page-header-actions">{actions}</div>}
        </div>
      </header>
    );
  }

  return (
    <header className="mb-5">
      <nav className="po-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="bc-link" onClick={() => navigate('/dashboard')}>
          Dashboard
        </button>
        {crumbs.map((part, index) => {
          const isLast = index === crumbs.length - 1;
          /* Normalize strings and { label, to? } objects so crumb data is
             never rendered as a raw object child. */
          const crumbItem =
            part && typeof part === 'object'
              ? { label: String(part.label ?? ''), to: part.to }
              : { label: String(part ?? ''), to: undefined };
          const isPurchase = crumbItem.label === 'Purchase';
          return (
            <span key={`${crumbItem.label}-${index}`} className="flex items-center gap-2">
              <ChevronRight className="w-3 h-3 text-[#9CA3AF] bc-sep" aria-hidden="true" />
              {isLast ? (
                <span className="bc-current">{crumbItem.label}</span>
              ) : isPurchase ? (
                <button type="button" className="bc-link" onClick={() => navigate('/purchase/dashboard')}>
                  {crumbItem.label}
                </button>
              ) : crumbItem.to ? (
                <button type="button" className="bc-link" onClick={() => navigate(crumbItem.to)}>
                  {crumbItem.label}
                </button>
              ) : (
                <span className="text-slate-500">{crumbItem.label}</span>
              )}
            </span>
          );
        })}
      </nav>

      <div className="po-page-header">
        <div className="min-w-0">
          <h1>
            {Icon && <Icon aria-hidden="true" />}
            {title}
          </h1>
          {subtitle && <p className="po-page-header-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="po-page-header-actions">{actions}</div>}
      </div>
    </header>
  );
}
