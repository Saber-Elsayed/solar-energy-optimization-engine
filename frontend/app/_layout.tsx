import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { AppBackground } from '@/components/app-background';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

function transparentNavigationTheme(base: Theme): Theme {
  return {
    ...base,
    colors: {
      ...base.colors,
      background: 'transparent',
      card: 'transparent',
    },
  };
}

const stackScreenOptions = {
  contentStyle: { backgroundColor: '#F4F4F5' },
  headerStyle: { backgroundColor: '#FFFFFF' },
  headerTintColor: '#18181B',
  headerTitleStyle: { color: '#18181B' },
  headerShadowVisible: false,
} as const;

function RootNavigator() {
  const colorScheme = useColorScheme();
  const navigationTheme = useMemo(
    () =>
      transparentNavigationTheme(colorScheme === 'dark' ? DarkTheme : DefaultTheme),
    [colorScheme],
  );
  const { user, loading, isEmailVerified, isApproved, isAdmin } = useAuth();
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
    const inPendingApproval = authRoute === 'pending-approval';
    const inAdminApprovals = authRoute === 'admin-approvals';
    const inAuthScreen = inLogin || inRegister || inVerifyEmail || inPendingApproval || inAdminApprovals;

    if (!user && !inAuthScreen) {
      router.replace('/login');
      return;
    }

    if (user && !isEmailVerified && !inVerifyEmail) {
      router.replace('/verify-email');
      return;
    }

    // Admins skip user approval flow and go straight to approvals screen.
    if (user && isEmailVerified && isAdmin && !inAdminApprovals) {
      router.replace('/admin-approvals');
      return;
    }

    if (user && isEmailVerified && !isAdmin && isApproved === false && !inPendingApproval) {
      router.replace('/pending-approval');
      return;
    }

    if (
      user &&
      isEmailVerified &&
      isApproved &&
      !isAdmin &&
      (inLogin || inRegister || inVerifyEmail || inPendingApproval)
    ) {
      router.replace('/(tabs)');
      return;
    }

    if (user && isEmailVerified && isAdmin && (inLogin || inRegister || inVerifyEmail || inPendingApproval)) {
      router.replace('/admin-approvals');
      return;
    }

    if (user && isEmailVerified && inAdminApprovals && !isAdmin) {
      router.replace(isApproved ? '/(tabs)' : '/pending-approval');
    }
  }, [user, loading, isEmailVerified, isApproved, isAdmin, segments, router]);

  if (loading) {
    return (
      <AppBackground>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e0f2fe" />
        </View>
      </AppBackground>
    );
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <AppBackground>
        <Stack screenOptions={stackScreenOptions}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false, contentStyle: { flex: 1 } }} />
          <Stack.Screen name="register" options={{ headerShown: false, contentStyle: { flex: 1 } }} />
          <Stack.Screen name="verify-email" options={{ headerShown: false, contentStyle: { flex: 1 } }} />
          <Stack.Screen name="pending-approval" options={{ headerShown: false, contentStyle: { flex: 1 } }} />
          <Stack.Screen name="admin-approvals" options={{ headerShown: false, contentStyle: { flex: 1 } }} />
          <Stack.Screen name="manage-devices" options={{ title: 'Manage Electrical Devices' }} />
          <Stack.Screen name="solar-system-settings" options={{ title: 'Solar System Settings' }} />
          <Stack.Screen name="constraint-combinations" options={{ title: 'Constraint Combinations' }} />
          <Stack.Screen name="devices-overview" options={{ title: 'Devices Overview' }} />
          <Stack.Screen name="feasible-combinations" options={{ title: 'Feasible Combinations' }} />
          <Stack.Screen name="night-plan" options={{ title: 'Night Discharge Plan' }} />
          <Stack.Screen name="twelve-hour-forecast" options={{ title: '12-Hour Run Forecast' }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
      </AppBackground>
      <StatusBar style="light" />
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
  },
});
