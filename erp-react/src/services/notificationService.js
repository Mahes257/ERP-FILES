/**
 * notificationService.js
 * ------------------------------------------------------------------
 * REST API client for the backend notification system.
 *
 * Endpoints:
 *   GET  /notifications              — paged inbox for authenticated user
 *   GET  /notifications/unread-count — unread count
 *   POST /notifications/{id}/read    — mark as read
 *   POST /notifications/{id}/resolve — resolve (dismiss)
 *   POST /notifications              — create (for PoC testing)
 *
 * All calls go through the shared axios instance which handles JWT
 * injection and 401 refresh automatically.
 * ------------------------------------------------------------------
 */
import api from '../api/axiosInstance';

/**
 * `options.suppressGlobalError`: a caller that renders the failure in place —
 * the header bell's popup, which shows an error state with Retry — must not
 * have its rejection replace a valid, working route with the global error
 * page. The request still rejects, so the caller keeps full control.
 */
function readConfig(signal, options = {}) {
  const config = { signal };
  if (options.suppressGlobalError) config.suppressGlobalError = true;
  return config;
}

/**
 * Fetch a page of the current user's notifications (newest first).
 * The backend still returns the inbox as an array, so callers are unchanged;
 * paging only bounds how much one request loads.
 */
export async function listNotifications(signal, options = {}) {
  const config = readConfig(signal, options);
  config.params = {
    page: options.page ?? 0,
    size: options.size ?? 200,
  };
  const res = await api.get('/notifications', config);
  return res?.data?.data ?? [];
}

/** Get the unread notification count. */
export async function getUnreadCount(signal, options = {}) {
  const res = await api.get('/notifications/unread-count', readConfig(signal, options));
  return Number(res?.data?.data ?? 0);
}

/** Mark a single notification as read. Returns the updated notification. */
export async function markAsRead(notificationId) {
  const res = await api.post(`/notifications/${notificationId}/read`);
  return res?.data?.data;
}

/** Resolve (dismiss) a notification — cancels pending reminders. */
export async function resolveNotification(notificationId) {
  const res = await api.post(`/notifications/${notificationId}/resolve`);
  return res?.data?.data;
}

/** Create a notification (PoC / admin testing). */
export async function createNotification(payload) {
  const res = await api.post('/notifications', payload);
  return res?.data?.data;
}
