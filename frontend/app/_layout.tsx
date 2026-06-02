import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { user, loading, isEmailVerified } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }

    const authRoute = segments[0];
    const inLogin = authRoute === 'login';
    const inRegister = authRoute === 'register';
    const inVerifyEmail = authRoute === 'verify-email';
    const inAuthScreen = inLogin || inRegister || inVerifyEmail;

    if (!user && !inAuthScreen) {
      router.replace('/login');
      return;
    }

    if (user && !isEmailVerified && !inVerifyEmail) {
      router.replace('/verify-email');
      return;
    }

    if (user && isEmailVerified && (inLogin || inRegister || inVerifyEmail)) {
      router.replace('/(tabs)');
    }
  }, [user, loading, isEmailVerified, segments, router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a7ea4" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="verify-email" options={{ headerShown: false }} />
        <Stack.Screen name="manage-devices" options={{ title: 'Manage Electrical Devices' }} />
        <Stack.Screen name="solar-system-settings" options={{ title: 'Solar System Settings' }} />
        <Stack.Screen name="constraint-combinations" options={{ title: 'Constraint Combinations' }} />
        <Stack.Screen name="devices-overview" options={{ title: 'Devices Overview' }} />
        <Stack.Screen name="feasible-combinations" options={{ title: 'Feasible Combinations' }} />
        <Stack.Screen name="night-plan" options={{ title: 'Night Discharge Plan' }} />
        <Stack.Screen name="twelve-hour-forecast" options={{ title: '12-Hour Run Forecast' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
