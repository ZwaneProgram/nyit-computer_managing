// Thin fetch wrapper around the Fastify backend. In dev, Vite proxies /api ->
// http://localhost:3000 (see vite.config.ts); in prod the API is same-origin.

export interface ApiUser {
  id: number;
  username: string;
  full_name: string | null;
  role: 'owner' | 'staff';
}

/** Error carrying the HTTP status + the server's Thai error message. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: 'include', // send/receive the session cookie
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (ตรวจสอบว่า API ทำงานอยู่)', 0);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* 204 / empty body */
  }

  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `เกิดข้อผิดพลาด (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

/** Auth endpoints. */
export const api = {
  me: () => request<{ user: ApiUser }>('/api/auth/me').then((r) => r.user),
  needsSetup: () => request<{ needsSetup: boolean }>('/api/auth/needs-setup').then((r) => r.needsSetup),
  login: (username: string, password: string) =>
    request<{ user: ApiUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }).then((r) => r.user),
  register: (username: string, password: string, full_name?: string) =>
    request<{ user: ApiUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, full_name }),
    }).then((r) => r.user),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
};

/** Generic helpers for feature endpoints (products, etc.). */
export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path: string) => request<void>(path, { method: 'DELETE' }),
};
