import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '@/lib/firebase-auth-errors';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, isAdmin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [adminMode, setAdminMode] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Validation', 'Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // Route guard sends unverified users to /verify-email and non-approved users to /pending-approval.
      // If this is an admin login, we navigate to the approvals screen (guard will also enforce admin role).
      if (adminMode) {
        router.replace('/admin-approvals');
      } else if (isAdmin) {
        router.replace('/admin-approvals');
      }
    } catch (err) {
      Alert.alert('Login failed', getFirebaseAuthErrorMessage(err, 'Unable to sign in.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Login</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#6b7280"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
        />
        <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Logging in...' : adminMode ? 'Login as admin' : 'Login'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => setAdminMode((value) => !value)} disabled={loading}>
          <Text style={styles.secondaryButtonText}>{adminMode ? 'User login' : 'Admin login'}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/register')}>
          <Text style={styles.link}>No account? Register</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  container: {
    gap: 12,
    borderRadius: 10,
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    color: '#0f172a',
  },
  button: { backgroundColor: '#0a7ea4', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a7ea4',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  secondaryButtonText: { color: '#0a7ea4', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 8, color: '#0a7ea4', textAlign: 'center' },
});
