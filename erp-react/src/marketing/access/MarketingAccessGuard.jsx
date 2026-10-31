/**
 * MarketingAccessGuard
 * ------------------------------------------------------------------
 * Route-level View gate for the Marketing module.
 *
 *   area="visits"              → requires visits.view
 *   area="hub"                 → requires view on at least one hub area
 *   area="expenses" action={…} → e.g. create for /marketing/expenses/new
 *
 * A denied user is sent to the application's 403 page, so typing a Marketing
 * URL by hand cannot bypass the navigation hiding. While permissions load the
 * page shows the app loader; if they cannot be read it shows an explicit error
 * with a retry and grants nothing (fail closed).
 * ------------------------------------------------------------------
 */
import { Navigate, useParams } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import PageLoader from '../../components/Common/PageLoader';
import useMarketingAccess from './useMarketingAccess';

export default function MarketingAccessGuard({ area, action = 'view', children }) {
  const params = useParams();
  const { loading, failed, error, can, canViewHub, reload } = useMarketingAccess();
  const requiredAction = typeof action === 'function' ? action(params) : action;

  if (loading) return <PageLoader />;

  if (failed) {
    return (
      <div className="purchase-page cpr-page" style={{ padding: 32 }}>
        <div className="cpr-error-banner" role="alert">
          <div>
            <p style={{ fontWeight: 700 }}>Marketing permissions could not be loaded.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              {error?.message || 'The access check failed, so no Marketing page or action is available.'}
            </p>
          </div>
          <button type="button" className="cpr-error-retry" onClick={reload}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const allowed = area === 'hub' ? canViewHub : can(area, requiredAction);
  if (!allowed) return <Navigate to="/error/403" replace />;

  return children;
}

/** Small inline banner used by pages that render a "no access" state instead of redirecting. */
export function MarketingNoAccess({ action = 'view', area }) {
  return (
    <div className="purchase-page cpr-page" style={{ padding: 32 }}>
      <div className="cpr-error-banner" role="alert">
        <p>
          <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6 }} />
          You do not have permission to {action} {area ? `Marketing ${area}` : 'this Marketing area'}.
        </p>
      </div>
    </div>
  );
}
