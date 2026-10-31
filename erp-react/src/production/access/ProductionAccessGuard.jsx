/**
 * ProductionAccessGuard
 * ------------------------------------------------------------------
 * Route-level gate for the Production module.
 *
 *   area="orders"                 → requires orders.view
 *   area="orders" action="create" → requires orders.create
 *   area="casting" action="start" → requires casting.start
 *
 * A denied user is sent to the application's 403 page, so typing a Production
 * URL by hand cannot bypass the navigation hiding. While permissions load the
 * page shows the app loader; if they cannot be read it shows an explicit error
 * with a retry and grants nothing (fail closed).
 * ------------------------------------------------------------------
 */
import { Navigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import PageLoader from '../../components/Common/PageLoader';
import useProductionAccess from './useProductionAccess';

export default function ProductionAccessGuard({ area, action = 'view', children }) {
  const { loading, failed, error, can, reload } = useProductionAccess();

  if (loading) return <PageLoader />;

  if (failed) {
    return (
      <div className="purchase-page cpr-page" style={{ padding: 32 }}>
        <div className="cpr-error-banner" role="alert">
          <div>
            <p style={{ fontWeight: 700 }}>Production permissions could not be loaded.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              {error?.message || 'The access check failed, so no Production page or action is available.'}
            </p>
          </div>
          <button type="button" className="cpr-error-retry" onClick={reload}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!can(area, action)) return <Navigate to="/error/403" replace />;
  return children;
}
