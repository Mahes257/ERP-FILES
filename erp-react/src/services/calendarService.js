import api from '../api/axiosInstance';

/**
 * Enterprise Calendar feed — read-only.
 *
 * The backend exposes exactly one mapping for the Calendar:
 *
 *   GET /calendar/entries?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * It returns entries projected from business records that already exist. There
 * is deliberately no create/update/delete call here: Calendar entries are never
 * written back, and the business record keeps being edited in its own module.
 *
 * `suppressGlobalError` is set because the Calendar owns this failure: a feed
 * that cannot load must leave the local events and the page in place and render
 * an inline message, never replace a working route with the global error view.
 *
 * The caller passes an AbortSignal so a fast month/week navigation cancels the
 * previous request instead of racing the next one.
 */
export async function fetchCalendarEntries({ from, to, signal } = {}) {
  const { data } = await api.get('/calendar/entries', {
    params: { from, to },
    signal,
    suppressGlobalError: true
  });
  return data;
}

export default { fetchCalendarEntries };
