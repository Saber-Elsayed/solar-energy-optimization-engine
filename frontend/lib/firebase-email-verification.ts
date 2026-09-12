import { type ActionCodeSettings, type User, sendEmailVerification } from 'firebase/auth';

/** Continue URL must be HTTPS and listed under Firebase Auth authorized domains. */
const EMAIL_VERIFICATION_CONTINUE_URL = 'https://solar-energy-optimizer.firebaseapp.com';

const actionCodeSettings: ActionCodeSettings = {
  url: EMAIL_VERIFICATION_CONTINUE_URL,
  handleCodeInApp: false,
};

export async function sendUserVerificationEmail(user: User): Promise<void> {
  if (user.emailVerified) {
    throw new Error('This email is already verified.');
  }
  if (!user.email) {
    throw new Error('No email address on this account.');
  }
  await sendEmailVerification(user, actionCodeSettings);
}
