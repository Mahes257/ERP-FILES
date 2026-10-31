import api from '../api/axiosInstance';
import {
  clearAuth,
  getStoredRefreshToken,
  getStoredToken,
  getStoredUser,
  isAuthenticated,
  isTokenExpired,
  storeAuth,
  storeTokens
} from './tokenStorage';

// Re-export the token helpers so existing imports keep working.
export {
  clearAuth,
  getStoredRefreshToken,
  getStoredToken,
  getStoredUser,
  isAuthenticated,
  isTokenExpired,
  storeAuth,
  storeTokens
};

function toAuthError(error) {
  // Axios timeout (global 30s cap): surface it clearly instead of the generic
  // "network connection" message.
  if (error?.code === 'ECONNABORTED' || /timeout of \d+ms exceeded/.test(error?.message || '')) {
    return new Error('The request timed out. Please try again.');
  }
  if (error.response) {
    const message =
      error.response.data?.message ||
      error.response.data?.error ||
      error.response.data?.detail ||
      `Request failed with status ${error.response.status}`;
    return new Error(message);
  }
  if (error.request) {
    return new Error('Unable to reach the server. Please check your network connection.');
  }
  return new Error(error.message || 'Invalid Email or Password');
}

const authService = {
  async login(email, password) {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      return data;
    } catch (error) {
      throw toAuthError(error);
    }
  },

  /** Silent refresh — used by the Axios interceptor and on app boot. */
  async refresh(refreshToken) {
    const token = refreshToken || getStoredRefreshToken();
    if (!token) return null;
    try {
      const { data } = await api.post('/auth/refresh', { refreshToken: token });
      const payload = data?.data;
      if (payload?.token) {
        storeTokens(payload.token, payload.refreshToken);
        return payload.token;
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Local-development auto-login probe. The backend only reports `enabled`
   * when the feature is configured on the server AND this request comes from
   * the local machine, so a deployed instance always answers false.
   * Never throws and never surfaces the global error page.
   */
  async localAutoLoginStatus() {
    try {
      const { data } = await api.get('/auth/local-auto-login/status', { suppressGlobalError: true });
      return data?.data || null;
    } catch {
      return null;
    }
  },

  /**
   * Exchanges the server's configured local account for a normal session
   * (real JWT + refresh token). Callers must still persist the result through
   * tokenStorage — nothing is faked client-side.
   */
  async localAutoLogin() {
    const { data } = await api.post('/auth/local-auto-login', null, { suppressGlobalError: true });
    return data?.data || null;
  },

  /** Revokes the refresh token server-side (best-effort). */
  async logout(refreshToken) {
    const token = refreshToken || getStoredRefreshToken();
    if (!token) return;
    try {
      await api.post('/auth/logout', { refreshToken: token });
    } catch {
      // best-effort — local session is cleared regardless
    }
  }
};

export default authService;
