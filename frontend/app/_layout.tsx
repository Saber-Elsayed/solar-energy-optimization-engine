import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAuthToken } from '@/lib/auth';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const lastRedirectRef = useRef<string | null>(null);

  console.log('ROOT LAYOUT RENDER', {
    checkingAuth,
    authenticated,
    segments,
  });

  useEffect(() => {
    let mounted = true;
    const bootstrapAuth = async () => {
      const token = await getAuthToken();
      console.log('[AUTH DEBUG] Boot auth token loaded', {
        hasToken: Boolean(token),
        tokenPreview: token ? `${token.slice(0, 12)}...` : null,
      });
      if (!mounted) return;
      setAuthenticated(Boolean(token));
      setCheckingAuth(false);
    };
    void bootstrapAuth();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (checkingAuth) return;
    const current = segments[0];
    const isAuthScreen = current === 'login' || current === 'register';
    console.log('AUTH CHECK', {
      checkingAuth,
      authenticated,
      current,
      isAuthScreen,
    });
    if (!authenticated && !isAuthScreen) {
      if (lastRedirectRef.current !== '/login') {
        lastRedirectRef.current = '/login';
        router.replace('/login');
      }
      return;
    }
    if (authenticated && isAuthScreen) {
      if (lastRedirectRef.current !== '/(tabs)') {
        lastRedirectRef.current = '/(tabs)';
        router.replace('/(tabs)');
      }
      return;
    }
    lastRedirectRef.current = null;
  }, [authenticated, checkingAuth, router, segments]);

  if (checkingAuth) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="manage-devices" options={{ title: 'Manage Electrical Devices' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
