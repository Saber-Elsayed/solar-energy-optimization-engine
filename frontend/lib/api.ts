import { getAuthToken } from '@/lib/auth';

export const AUTH_TOKEN_MISSING_ERROR = 'AUTH_TOKEN_MISSING';

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  console.log("TOKEN USED:", token);
  const urlForLog = typeof input === 'string' ? input : input.toString();
  console.log('[AUTH DEBUG] Token loaded before request', {
    url: urlForLog,
    hasToken: Boolean(token),
    tokenPreview: token ? `${token.slice(0, 12)}...` : null,
  });
  const headers = new Headers(init.headers ?? {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  console.log("REQUEST HEADERS:", Object.fromEntries(headers.entries()));
  console.log('[AUTH DEBUG] Outgoing auth header', {
    url: urlForLog,
    authorization: headers.get('Authorization'),
  });
  if (!token) {
    throw new Error(AUTH_TOKEN_MISSING_ERROR);
  }
  return fetch(input, { ...init, headers });
}

export function isUnauthorized(response: Response): boolean {
  return response.status === 401;
}

