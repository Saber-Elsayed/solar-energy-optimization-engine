/**
 * Optional mirror of FIREBASE_ADMIN_EMAILS for when the backend status API is unreachable.
 * Set EXPO_PUBLIC_FIREBASE_ADMIN_EMAILS in frontend/.env (comma-separated).
 */
export function isAllowlistedAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  const raw = process.env.EXPO_PUBLIC_FIREBASE_ADMIN_EMAILS ?? '';
  const allowlist = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}
