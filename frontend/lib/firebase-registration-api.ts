import { auth } from '@/lib/firebase';
import {
  FIREBASE_REGISTRATION_STATUS_URL,
  FIREBASE_REGISTRATION_SUBMIT_URL,
} from '@/lib/api-config';

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export type RegistrationStatusResponse = {
  status: RegistrationStatus;
  email: string;
  approved: boolean;
  is_admin?: boolean;
};

async function getBearerToken(forceRefresh = false): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in');
  }
  return user.getIdToken(forceRefresh);
}

async function authorizedFetch(url: string, init?: RequestInit, forceRefresh = false) {
  const token = await getBearerToken(forceRefresh);
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : `Request failed (${response.status})`;
    throw new Error(detail);
  }
  return payload;
}

export async function submitRegistrationRequest(): Promise<RegistrationStatusResponse> {
  return authorizedFetch(FIREBASE_REGISTRATION_SUBMIT_URL, { method: 'POST' });
}

export async function fetchRegistrationStatus(forceRefresh = false): Promise<RegistrationStatusResponse> {
  return authorizedFetch(FIREBASE_REGISTRATION_STATUS_URL, { method: 'GET' }, forceRefresh);
}

export async function readApprovalFromToken(forceRefresh = false): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }
  const tokenResult = await user.getIdTokenResult(forceRefresh);
  if (tokenResult.claims.role === 'admin') {
    return true;
  }
  return Boolean(tokenResult.claims.approved);
}

export async function readIsAdminFromToken(forceRefresh = false): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }
  const tokenResult = await user.getIdTokenResult(forceRefresh);
  return tokenResult.claims.role === 'admin';
}
