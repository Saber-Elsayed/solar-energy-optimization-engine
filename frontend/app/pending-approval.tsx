import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { AuthScreenBackground, authScreenStyles } from '@/components/auth-screen-background';
import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '@/lib/firebase-auth-errors';

export default function PendingApprovalScreen() {
  const router = useRouter();
  const { user, registrationStatus, isApproved, logout, refreshApprovalStatus } = useAuth();
  const [checking, setChecking] = useState(false);
  const [hasCheckedOnce, setHasCheckedOnce] = useState(false);

  const isRejected = registrationStatus === 'rejected';
  const email = user?.email ?? '';

  const tryEnterAppIfApproved = useCallback(async (showAlerts: boolean) => {
    setChecking(true);
    try {
      const approved = await refreshApprovalStatus();
      if (approved) {
        router.replace('/(tabs)');
        return true;
      }
      if (showAlerts) {
        Alert.alert(
          isRejected ? 'Registration rejected' : 'Still pending',
          isRejected
            ? 'Your registration was rejected by an admin. Contact support if you believe this is a mistake.'
            : 'Your account is still waiting for admin approval. Try again after the admin approves you.',
        );
      }
      return false;
    } catch (err) {
      if (showAlerts) {
        Alert.alert('Check failed', getFirebaseAuthErrorMessage(err, 'Unable to refresh approval status.'));
      }
      return false;
    } finally {
      setChecking(false);
    }
  }, [isRejected, refreshApprovalStatus, router]);

  useFocusEffect(
    useCallback(() => {
      if (isApproved) {
        router.replace('/(tabs)');
        return;
      }
      if (!hasCheckedOnce && !isRejected) {
        setHasCheckedOnce(true);
        void tryEnterAppIfApproved(false);
      }
    }, [hasCheckedOnce, isApproved, isRejected, router, tryEnterAppIfApproved]),
  );

  const handleCheckStatus = () => {
    void tryEnterAppIfApproved(true);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  };

  return (
    <AuthScreenBackground>
      <View style={authScreenStyles.form}>
        <Text style={authScreenStyles.title}>
          {isRejected ? 'Registration rejected' : 'Waiting for admin approval'}
        </Text>
        <Text style={authScreenStyles.message}>
          {isRejected
            ? 'An administrator rejected your registration request.'
            : 'Your email is verified. An administrator must approve your account before you can use the app.'}
        </Text>
        <Text style={authScreenStyles.email}>{email}</Text>

        {!isRejected && !hasCheckedOnce ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color="#e0f2fe" />
            <Text style={authScreenStyles.muted}>Checking approval status…</Text>
          </View>
        ) : null}

        {!isRejected && hasCheckedOnce ? (
          <Pressable style={authScreenStyles.button} onPress={handleCheckStatus} disabled={checking}>
            {checking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={authScreenStyles.buttonText}>Check approval status</Text>
            )}
          </Pressable>
        ) : null}

        <Pressable style={authScreenStyles.secondaryButton} onPress={() => void handleLogout()}>
          <Text style={authScreenStyles.secondaryButtonText}>Use a different account</Text>
        </Pressable>
      </View>
    </AuthScreenBackground>
  );
}
