/**
 * SalesAccessGuard
 * ------------------------------------------------------------------
 * Route-level View gate for the Sales module.
 *
 *   area="quotations"          → requires quotations.view
 *   area="crm"                 → requires view on at least one CRM area
 *   area="cpo" action="create" → requires cpo.create
 *
 * A denied user is sent to the application's 403 page, so typing a Sales URL by
 * hand cannot bypass the navigation hiding. While permissions load the page
 * shows the app loader; if they cannot be read it shows an explicit error with a
 * retry and grants nothing (fail closed).
 * ------------------------------------------------------------------
 */
import { Navigate, useParams } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import PageLoader from '../../components/Common/PageLoader';
import useSalesAccess from './useSalesAccess';
import { SALES_AREAS } from './catalog';

/** Sales sidebar modules that gate a whole parent route. */
const MODULE_AREAS = {
  crm: 'crm',
  cpr: 'cpr',
  salesExec: 'salesExec'
};

export default function SalesAccessGuard({ area, action = 'view', children }) {
  const params = useParams();
  const { loading, failed, error, can, canViewModule, reload } = useSalesAccess();
  const requiredAction = typeof action === 'function' ? action(params) : action;
  const moduleKey = MODULE_AREAS[area];

  if (loading) return <PageLoader />;

  if (failed) {
    return (
      <div className="purchase-page cpr-page" style={{ padding: 32 }}>
        <div className="cpr-error-banner" role="alert">
          <div>
            <p style={{ fontWeight: 700 }}>Sales permissions could not be loaded.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              {error?.message || 'The access check failed, so no Sales page or action is available.'}
            </p>
          </div>
          <button type="button" className="cpr-error-retry" onClick={reload}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const allowed = moduleKey ? canViewModule(moduleKey) : can(area, requiredAction);
  if (!allowed) return <Navigate to="/error/403" replace />;

  return children;
}

/** Small inline banner used by pages that render a "no access" state instead of redirecting. */
export function SalesNoAccess({ action = 'view', area }) {
  const label = SALES_AREAS.find((entry) => entry.key === area)?.label || 'this Sales area';
  return (
    <div className="purchase-page cpr-page" style={{ padding: 32 }}>
      <div className="cpr-error-banner" role="alert">
        <p>
          <AlertTriangle size={14} style={{ display: 'inline', marginRight: 6 }} />
          You do not have permission to {action} {label}.
        </p>
      </div>
    </div>
  );
}
