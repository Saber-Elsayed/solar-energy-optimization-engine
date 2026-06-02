import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AuthScreenBackground, authScreenStyles } from '@/components/auth-screen-background';
import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '@/lib/firebase-auth-errors';
import {
  approveRegistration,
  listPendingRegistrations,
  rejectRegistration,
  type AdminRegistration,
} from '@/lib/firebase-admin-api';

export default function AdminApprovalsScreen() {
  const router = useRouter();
  const { isAdmin, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AdminRegistration[]>([]);

  const pendingCount = items.length;

  const load = async () => {
    setLoading(true);
    try {
      const data = await listPendingRegistrations();
      setItems(data);
    } catch (err) {
      Alert.alert('Failed to load', getFirebaseAuthErrorMessage(err, 'Unable to load pending users.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void load();
  }, [isAdmin]);

  const handleApprove = async (firebaseUid: string, email: string) => {
    try {
      await approveRegistration(firebaseUid);
      setItems((prev) => prev.filter((row) => row.firebase_uid !== firebaseUid));
      Alert.alert('Approved', email);
    } catch (err) {
      Alert.alert('Approve failed', getFirebaseAuthErrorMessage(err, 'Unable to approve user.'));
    }
  };

  const handleReject = async (firebaseUid: string, email: string) => {
    const reason = 'Rejected by admin';
    try {
      await rejectRegistration(firebaseUid, reason);
      setItems((prev) => prev.filter((row) => row.firebase_uid !== firebaseUid));
      Alert.alert('Rejected', email);
    } catch (err) {
      Alert.alert('Reject failed', getFirebaseAuthErrorMessage(err, 'Unable to reject user.'));
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  };

  if (!isAdmin) {
    return (
      <AuthScreenBackground>
        <View style={authScreenStyles.form}>
          <Text style={authScreenStyles.title}>Admin access required</Text>
          <Text style={styles.mutedOnDark}>Please sign in with an admin account.</Text>
          <Pressable style={authScreenStyles.button} onPress={() => router.replace('/login')}>
            <Text style={authScreenStyles.buttonText}>Back to login</Text>
          </Pressable>
        </View>
      </AuthScreenBackground>
    );
  }

  return (
    <AuthScreenBackground variant="page">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={authScreenStyles.title}>Pending approvals</Text>
          <Text style={styles.mutedOnDark}>{pendingCount} pending</Text>
          <View style={styles.headerRow}>
            <Pressable style={authScreenStyles.secondaryButton} onPress={() => void load()} disabled={loading}>
              <Text style={authScreenStyles.secondaryButtonText}>Refresh</Text>
            </Pressable>
            <Pressable style={styles.secondaryButtonDanger} onPress={() => void handleLogout()}>
              <Text style={styles.secondaryButtonDangerText}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#e0f2fe" />
            <Text style={styles.mutedOnDark}>Loading…</Text>
          </View>
        ) : pendingCount === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardText}>No pending users right now.</Text>
          </View>
        ) : (
          items.map((row) => (
            <View key={row.firebase_uid} style={styles.card}>
              <Text style={styles.email}>{row.email}</Text>
              <Text style={styles.cardMuted}>Requested: {new Date(row.created_at).toLocaleString()}</Text>
              <View style={styles.row}>
                <Pressable style={styles.approve} onPress={() => void handleApprove(row.firebase_uid, row.email)}>
                  <Text style={styles.approveText}>Approve</Text>
                </Pressable>
                <Pressable style={styles.reject} onPress={() => void handleReject(row.firebase_uid, row.email)}>
                  <Text style={styles.rejectText}>Reject</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </AuthScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 24 },
  header: { gap: 6, marginBottom: 6 },
  headerRow: { flexDirection: 'row', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  mutedOnDark: { color: '#e2e8f0' },
  loadingBox: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  cardText: { color: '#475569' },
  cardMuted: { color: '#64748b' },
  email: { fontSize: 16, fontWeight: '700', color: '#0a7ea4' },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  approve: {
    backgroundColor: '#15803d',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  approveText: { color: '#fff', fontWeight: '700' },
  reject: {
    backgroundColor: '#b91c1c',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  rejectText: { color: '#fff', fontWeight: '700' },
  secondaryButtonDanger: {
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(185, 28, 28, 0.35)',
  },
  secondaryButtonDangerText: { color: '#fff', fontWeight: '700' },
});
