// Thin fetch wrapper: attaches the session token, parses JSON, surfaces server error messages.
const TOKEN_KEY = 'fs-token';

export const session = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
  user: null,
};

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.details = body?.details;
  }
}

async function request(method, path, body, { form } = {}) {
  const headers = {};
  if (session.token) headers.authorization = `Bearer ${session.token}`;
  if (body !== undefined && !form) headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: form ? body : body === undefined ? undefined : JSON.stringify(body) });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (res.status === 401 && session.token && !path.startsWith('/auth/login')) {
    session.token = null;
    location.hash = '#/login';
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  upload: (p, formData) => request('POST', p, formData, { form: true }),
};

export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
