const TOKEN_KEY = 'clinic.token';

// Where the backend lives. Empty = same origin (local dev via Vite proxy, or one server for both).
// Set VITE_API_URL=https://your-api.ondigitalocean.app when the frontend is hosted separately.
export const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const BASE = `${API_ORIGIN}/api`;

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || {};
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = BASE + path;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const s = qs.toString();
    if (s) url += '?' + s;
  }
  const token = getToken();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'You seem to be offline. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data.error || 'Something went wrong', data.details);
  }
  return data;
}

/** Photos need the session header, so they're fetched as blobs and shown via object URLs. */
const fileCache = new Map();
export function fileUrl(id) {
  if (!fileCache.has(id)) {
    fileCache.set(id, fetch(`${BASE}/files/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => { if (!r.ok) throw new Error('not found'); return r.blob(); })
      .then((b) => URL.createObjectURL(b))
      .catch((e) => { fileCache.delete(id); throw e; }));
  }
  return fileCache.get(id);
}
