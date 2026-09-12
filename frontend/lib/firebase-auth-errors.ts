import { FirebaseError } from 'firebase/app';

export function getFirebaseAuthErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a few minutes, then try again.';
      case 'auth/quota-exceeded':
        return 'Email quota exceeded. Try again later or use another email.';
      case 'auth/operation-not-allowed':
        return 'Email verification is disabled in Firebase. Enable Email/Password in Firebase Console.';
      default:
        return error.message || fallback;
    }
  }
  if (error instanceof Error) {
    const message = error.message;
    if (/network request failed|failed to fetch|network error/i.test(message)) {
      return (
        'Cannot reach the API server. On a phone, set EXPO_PUBLIC_API_URL in frontend/.env to your computer LAN IP ' +
        '(e.g. http://192.168.1.12:8000) and run the backend on 0.0.0.0:8000.'
      );
    }
    return message;
  }
  return fallback;
}
