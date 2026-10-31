import { Navigate, Outlet } from 'react-router-dom';
import { isAuthenticated } from '../../services/authService';

/**
 * Route guard. A session is considered active when either the access token is
 * still valid OR a refresh token exists — in the latter case the Axios
 * interceptor refreshes the access token transparently on the next request,
 * so a user with an expired (but refreshable) access token is never bounced
 * back to the sign-in page.
 */
export default function ProtectedRoute() {
  if (!isAuthenticated()) {
    return <Navigate to="/signin" replace />;
  }
  return <Outlet />;
}
