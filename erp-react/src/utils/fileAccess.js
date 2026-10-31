import api from '../api/axiosInstance';

/**
 * Authenticated file access.
 *
 * /files/** requires the JWT (Authorization header). Attachments are therefore
 * fetched through the Axios client (which attaches the token) as blobs instead
 * of navigating to bare URLs — a browser navigation would have no token and
 * get a 401.
 *
 * SECURITY: the backend decides who may download a file (any authenticated ERP
 * user, matching the company-wide data model). The UI never bypasses that.
 */

/**
 * The path segment the Axios client already prepends to every request
 * (normally "/v1", per axiosInstance baseURL / VITE_API_URL).
 */
function apiBasePath() {
  const base = String(api.defaults.baseURL || '').trim();
  if (!base) return '';
  try {
    if (/^https?:\/\//i.test(base)) {
      return new URL(base).pathname.replace(/\/+$/, '');
    }
  } catch {
    return '';
  }
  return base.replace(/\/+$/, '');
}

/**
 * Normalizes an absolute or relative attachment URL into a path RELATIVE to
 * the Axios baseURL.
 *
 * Attachment rows store an absolute URL the backend builds as
 * `${app.base-url}/v1/files/<storedName>` (and the API context-path is /v1).
 * Because Axios already prepends its baseURL ("/v1"), returning that path
 * verbatim produced requests to "/v1/v1/files/<storedName>" — a 404 that made
 * every attachment download fail across the whole ERP. The stored API-base
 * segment is therefore stripped here, once, for every module that shares this
 * utility.
 */
function toApiPath(url) {
  if (!url) return null;
  let path;
  if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
    try {
      const parsed = new URL(url, window.location.origin);
      path = parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  } else {
    path = url;
  }
  const basePath = apiBasePath();
  if (basePath && basePath !== '/' && (path === basePath || path.startsWith(basePath + '/'))) {
    path = path.slice(basePath.length) || '/';
  }
  return path;
}

/** Turns an Axios/file error into a user-facing reason. */
export function describeFileError(error, fallback = 'Failed to download file') {
  const status = error?.response?.status;
  if (status === 400) return 'The file reference is invalid.';
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to access this file.';
  if (status === 404) return 'File not found on the server.';
  if (status >= 500) return 'The server could not read the stored file.';
  if (error?.code === 'ERR_NETWORK') return 'Network error — could not reach the server.';
  const message = String(error?.message || '');
  if (message && !/status code|network error/i.test(message)) return message;
  return fallback;
}

/**
 * Wraps an Axios error in an Error carrying the friendly message, while keeping
 * the original `response`/`status` so existing status-based handling elsewhere
 * (e.g. Documents.jsx) continues to work.
 */
export function toFileError(error, fallback) {
  const wrapped = new Error(describeFileError(error, fallback));
  if (error?.response) wrapped.response = error.response;
  if (error?.response?.status) wrapped.status = error.response.status;
  else if (error?.status) wrapped.status = error.status;
  wrapped.cause = error;
  return wrapped;
}

/**
 * Fetches the file as a blob through the authenticated Axios client.
 *
 * `config` is forwarded to Axios, so a caller that renders a failed file
 * request itself can pass `suppressGlobalError: true` — see `downloadFile`.
 */
export async function fetchFileBlob(url, config = {}) {
  const path = toApiPath(url);
  if (!path) throw new Error('Invalid file URL');
  const res = await api.get(path, { responseType: 'blob', ...config });
  return {
    blob: res.data,
    contentType: res.headers?.['content-type'] || 'application/octet-stream'
  };
}

function triggerDownload(blob, name) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = name || 'file';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to start the download before revoking the URL.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Downloads an attachment through the authenticated channel.
 *
 * `config` is passed through to the request so the caller can opt out of the
 * global error publication (see the Axios response interceptor) for a file it
 * reports itself.
 */
export async function downloadFile(url, name, config = {}) {
  try {
    const { blob } = await fetchFileBlob(url, config);
    triggerDownload(blob, name);
  } catch (err) {
    throw toFileError(err, 'Failed to download file');
  }
}

/**
 * Opens an attachment for preview in a new tab (PDFs/images render inline;
 * everything else downloads because the backend sends Content-Disposition:
 * attachment). Uses an object URL so the fetch carries the JWT.
 */
export async function openFileInNewTab(url) {
  try {
    const { blob } = await fetchFileBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    const win = window.open(objectUrl, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Pop-up blocked — fall back to a direct download.
      triggerDownload(blob);
    } else {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
  } catch (err) {
    throw toFileError(err, 'Failed to open file');
  }
}
