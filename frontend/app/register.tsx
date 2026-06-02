import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { AuthScreenBackground, authScreenStyles } from '@/components/auth-screen-background';
import { PasswordInput } from '@/components/password-input';
import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '@/lib/firebase-auth-errors';
import { isValidEmail } from '@/lib/validate-email';

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleRegister = async () => {
    setEmailError(null);
    if (!email.trim() || !password || !confirmPassword) {
      Alert.alert('Validation', 'Email, password, and confirm password are required.');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password);
      router.replace('/verify-email');
    } catch (err) {
      Alert.alert('Registration failed', getFirebaseAuthErrorMessage(err, 'Unable to create account.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenBackground>
      <View style={authScreenStyles.form}>
        <Text style={authScreenStyles.title}>Register</Text>
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
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#6b7280"
          autoComplete="new-password"
        />
        <PasswordInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm Password"
          placeholderTextColor="#6b7280"
          autoComplete="new-password"
        />
        <Pressable style={authScreenStyles.button} onPress={() => void handleRegister()} disabled={loading}>
          <Text style={authScreenStyles.buttonText}>{loading ? 'Registering...' : 'Register'}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/login')}>
          <Text style={authScreenStyles.link}>Already have an account? Login</Text>
        </Pressable>
      </View>
    </AuthScreenBackground>
  );
}
