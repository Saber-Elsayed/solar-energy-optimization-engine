import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '@/lib/firebase-auth-errors';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, logout, resendVerificationEmail, completeEmailVerification } = useAuth();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const email = user?.email ?? '';

  const handleResend = async () => {
    if (cooldownSeconds > 0) {
      return;
    }
    setResending(true);
    try {
      await resendVerificationEmail();
      setCooldownSeconds(60);
      Alert.alert(
        'Email sent',
        'Check your inbox and spam folder. It can take 1–2 minutes. If nothing arrives, wait and use Resend again.',
      );
    } catch (err) {
      Alert.alert('Could not resend', getFirebaseAuthErrorMessage(err, 'Unable to resend verification email.'));
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setCooldownSeconds((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleCheckVerified = async () => {
    setChecking(true);
    try {
      const verified = await completeEmailVerification();
      if (!verified) {
        Alert.alert(
          'Not verified yet',
          'Please open the verification link in your email, then tap "I verified my email" again.',
        );
        return;
      }
      router.replace('/login');
      Alert.alert(
        'Email verified',
        'Please sign in with your email and password. Your account will wait for admin approval.',
      );
    } catch (err) {
      Alert.alert('Check failed', getFirebaseAuthErrorMessage(err, 'Unable to refresh verification status.'));
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.message}>We sent a verification link to:</Text>
        <Text style={styles.email}>{email || 'your email address'}</Text>
        <Text style={styles.hint}>
          After you verify, tap the button below. You will return to Login, then sign in again while your account
          waits for admin approval.
        </Text>
        <Text style={styles.hint}>Check spam/junk if you do not see the email within a few minutes.</Text>

        <Pressable style={styles.button} onPress={() => void handleCheckVerified()} disabled={checking || resending}>
          {checking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>I verified my email</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => void handleResend()}
          disabled={resending || checking || cooldownSeconds > 0}>
          <Text style={styles.secondaryButtonText}>
            {resending
              ? 'Sending...'
              : cooldownSeconds > 0
                ? `Resend available in ${cooldownSeconds}s`
                : 'Resend verification email'}
          </Text>
        </Pressable>

        <Pressable onPress={() => void handleLogout()}>
          <Text style={styles.link}>Use a different account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  container: { gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  message: { fontSize: 15, color: '#334155' },
  email: { fontSize: 16, fontWeight: '600', color: '#0a7ea4' },
  hint: { fontSize: 14, color: '#64748b', lineHeight: 20, marginBottom: 8 },
  button: {
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#0a7ea4',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#0a7ea4', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 8, color: '#0a7ea4', textAlign: 'center' },
});
