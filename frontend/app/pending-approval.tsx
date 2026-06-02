import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '@/lib/firebase-auth-errors';

export default function PendingApprovalScreen() {
  const router = useRouter();
  const { user, registrationStatus, logout, refreshApprovalStatus } = useAuth();
  const [checking, setChecking] = useState(false);

  const isRejected = registrationStatus === 'rejected';
  const email = user?.email ?? '';

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const approved = await refreshApprovalStatus();
      if (approved) {
        router.replace('/(tabs)');
        return;
      }
      Alert.alert(
        isRejected ? 'Registration rejected' : 'Still pending',
        isRejected
          ? 'Your registration was rejected by an admin. Contact support if you believe this is a mistake.'
          : 'Your account is still waiting for admin approval. Try again after the admin approves you.',
      );
    } catch (err) {
      Alert.alert('Check failed', getFirebaseAuthErrorMessage(err, 'Unable to refresh approval status.'));
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
        <Text style={styles.title}>{isRejected ? 'Registration rejected' : 'Waiting for admin approval'}</Text>
        <Text style={styles.message}>
          {isRejected
            ? 'An administrator rejected your registration request.'
            : 'Your email is verified. An administrator must approve your account before you can use the app.'}
        </Text>
        <Text style={styles.email}>{email}</Text>

        {!isRejected ? (
          <Pressable style={styles.button} onPress={() => void handleCheckStatus()} disabled={checking}>
            {checking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Check approval status</Text>
            )}
          </Pressable>
        ) : null}

        <Pressable style={styles.secondaryButton} onPress={() => void handleLogout()}>
          <Text style={styles.secondaryButtonText}>Use a different account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  container: { gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  message: { fontSize: 15, color: '#334155', lineHeight: 22 },
  email: { fontSize: 16, fontWeight: '600', color: '#0a7ea4', marginBottom: 8 },
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
});
