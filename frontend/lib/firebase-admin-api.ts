import { auth } from '@/lib/firebase';
import { ADMIN_REGISTRATIONS_URL } from '@/lib/api-config';

export type AdminRegistration = {
  firebase_uid: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  rejected_reason?: string | null;
};

async function authorizedFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not signed in');
  }
  const token = await user.getIdToken();
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
  return payload as T;
}

export async function listPendingRegistrations(): Promise<AdminRegistration[]> {
  const url = `${ADMIN_REGISTRATIONS_URL}?status=pending`;
  return authorizedFetch<AdminRegistration[]>(url, { method: 'GET' });
}

export async function approveRegistration(firebaseUid: string): Promise<AdminRegistration> {
  return authorizedFetch<AdminRegistration>(`${ADMIN_REGISTRATIONS_URL}/${firebaseUid}/approve`, { method: 'POST' });
}

export async function rejectRegistration(firebaseUid: string, reason?: string | null): Promise<AdminRegistration> {
  return authorizedFetch<AdminRegistration>(`${ADMIN_REGISTRATIONS_URL}/${firebaseUid}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason ?? null }),
  });
}

