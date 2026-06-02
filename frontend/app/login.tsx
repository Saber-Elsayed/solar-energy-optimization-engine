import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthScreenBackground, authScreenStyles } from '@/components/auth-screen-background';
import { PasswordInput } from '@/components/password-input';
import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '@/lib/firebase-auth-errors';
import { isValidEmail } from '@/lib/validate-email';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, isAdmin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleLogin = async () => {
    setEmailError(null);
    setPasswordError(null);

    if (!email.trim()) {
      setEmailError('Email is required.');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setPasswordError('Password is required.');
      return;
    }

    setLoading(true);
    try {
      await signIn(email.trim(), password);
      if (adminMode || isAdmin) {
        router.replace('/admin-approvals');
      }
    } catch (err) {
      const message = getFirebaseAuthErrorMessage(err, 'Unable to sign in.');
      if (message.toLowerCase().includes('email') && message.toLowerCase().includes('password')) {
        setPasswordError('Incorrect email or password.');
      } else if (message.toLowerCase().includes('email')) {
        setEmailError(message);
      } else {
        setPasswordError(message);
      }
      Alert.alert('Login failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenBackground>
      <View style={authScreenStyles.form}>
        <Text style={authScreenStyles.title}>Login</Text>
        <TextInput
          style={[authScreenStyles.input, emailError ? authScreenStyles.inputError : null]}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (emailError) {
              setEmailError(null);
            }
          }}
          placeholder="Email"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        {emailError ? <Text style={authScreenStyles.errorText}>{emailError}</Text> : null}

        <PasswordInput
          style={passwordError ? authScreenStyles.inputError : undefined}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (passwordError) {
              setPasswordError(null);
            }
          }}
          placeholder="Password"
          placeholderTextColor="#6b7280"
          autoComplete="password"
        />
        {passwordError ? <Text style={authScreenStyles.errorText}>{passwordError}</Text> : null}

        <Pressable style={authScreenStyles.button} onPress={() => void handleLogin()} disabled={loading}>
          <Text style={authScreenStyles.buttonText}>
            {loading ? 'Logging in...' : adminMode ? 'Login as admin' : 'Login'}
          </Text>
        </Pressable>
        <Pressable
          style={authScreenStyles.secondaryButton}
          onPress={() => setAdminMode((value) => !value)}
          disabled={loading}
        >
          <Text style={authScreenStyles.secondaryButtonText}>{adminMode ? 'User login' : 'Admin login'}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/register')}>
          <Text style={authScreenStyles.link}>No account? Register</Text>
        </Pressable>
      </View>
    </AuthScreenBackground>
  );
}
