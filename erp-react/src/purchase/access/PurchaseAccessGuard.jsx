/**
 * PurchaseAccessGuard
 * ------------------------------------------------------------------
 * Route-level gate for the Purchase module.
 *
 *   area="orders"              → requires orders.view
 *   area="orders" action="create" → requires orders.create
 *   area="orders" action="edit"   → requires orders.edit
 *
 * A denied user is sent to the application's 403 page, so typing a Purchase URL
 * by hand cannot bypass the navigation hiding. While permissions load the page
 * shows the module loader; if they cannot be read it shows an explicit error
 * with a retry and grants nothing (fail closed).
 *
 * A missing area (a Purchase route this guard was not given) is refused rather
 * than allowed: the backend is the real boundary, but the UI must not present a
 * page the user has no permission for.
 * ------------------------------------------------------------------
 */
import { Navigate, useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { PageLoader } from '../components/ui';
import usePurchaseAccess from './usePurchaseAccess';
import { PURCHASE_AREAS, areaForPath } from './catalog';

export default function PurchaseAccessGuard({ area, action = 'view', children }) {
  const params = useParams();
  const { loading, failed, error, can, reload } = usePurchaseAccess();
  const requiredAction = typeof action === 'function' ? action(params) : action;
  const areaKey = area || areaForPath(window.location.pathname);

  if (loading) return <PageLoader />;

  if (failed) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-4" role="alert">
          <p className="text-sm font-bold text-rose-800">Purchase permissions could not be loaded.</p>
          <p className="mt-1 text-xs text-rose-700">
            {error?.message || 'The access check failed, so no Purchase page or action is available.'}
          </p>
          <button
            type="button"
            onClick={reload}
            className="st-btn st-btn-ghost mt-3"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!areaKey || !can(areaKey, requiredAction)) return <Navigate to="/error/403" replace />;

  return children;
}

/** Inline "no access" state for a page that renders a message instead of redirecting. */
export function PurchaseNoAccess({ area, action = 'view' }) {
  const label = PURCHASE_AREAS.find((entry) => entry.key === area)?.label || 'this Purchase area';
  return (
    <div className="p-8">
      <div className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
        <p className="text-xs font-semibold text-amber-800">
          You do not have permission to {action} {label}.
        </p>
      </div>
    </div>
  );
}
