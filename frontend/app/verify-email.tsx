import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '@/lib/firebase-auth-errors';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, logout, resendVerificationEmail, refreshUser } = useAuth();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  const email = user?.email ?? '';

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerificationEmail();
      Alert.alert('Email sent', 'A new verification link was sent to your email.');
    } catch (err) {
      Alert.alert('Could not resend', getFirebaseAuthErrorMessage(err, 'Unable to resend verification email.'));
    } finally {
      setResending(false);
    }
  };

  const handleCheckVerified = async () => {
    setChecking(true);
    try {
      const verified = await refreshUser();
      if (verified) {
        router.replace('/(tabs)');
        return;
      }
      Alert.alert(
        'Not verified yet',
        'Please open the verification link in your email, then tap "I verified my email" again.',
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
      router.replace('/login');
    } catch {
      router.replace('/login');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.message}>
          We sent a verification link to:
        </Text>
        <Text style={styles.email}>{email || 'your email address'}</Text>
        <Text style={styles.hint}>
          Open the link in your inbox to activate your account. You cannot use the app until your email is verified.
        </Text>

        <Pressable style={styles.button} onPress={handleCheckVerified} disabled={checking || resending}>
          {checking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>I verified my email</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => void handleResend()} disabled={resending || checking}>
          <Text style={styles.secondaryButtonText}>
            {resending ? 'Sending...' : 'Resend verification email'}
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
