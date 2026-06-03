import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SolarImageBackground } from '@/components/solar-image-background';
import { onBgStyles } from '@/styles/on-bg';

type AuthScreenBackgroundProps = {
  children: ReactNode;
  /** `form` — centered card (login/register). `page` — full-width scrollable content (admin). */
  variant?: 'form' | 'page';
};

/** Layout wrapper for login, register, admin, and related entry screens. */
export function AuthScreenBackground({ children, variant = 'form' }: AuthScreenBackgroundProps) {
  const isPage = variant === 'page';

  return (
    <SolarImageBackground>
      <SafeAreaView style={isPage ? styles.safePage : styles.safeForm} edges={['top', 'bottom']}>
        <View style={isPage ? styles.pageContainer : styles.formContainer}>{children}</View>
      </SafeAreaView>
    </SolarImageBackground>
  );
}

export const authScreenStyles = StyleSheet.create({
  title: { ...onBgStyles.onBgTitle, marginBottom: 8, color: '#fff' },
  input: {
    ...onBgStyles.onBgInput,
  },
  inputError: {
    borderColor: '#b91c1c',
  },
  errorText: {
    color: '#fecaca',
    fontSize: 13,
    marginTop: -6,
  },
  button: { backgroundColor: '#0a7ea4', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  secondaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { marginTop: 8, color: '#e0f2fe', textAlign: 'center', fontWeight: '500' },
  message: { fontSize: 15, color: '#e2e8f0', lineHeight: 22 },
  hint: { fontSize: 14, color: '#cbd5e1', lineHeight: 20, marginBottom: 8 },
  email: { fontSize: 16, fontWeight: '600', color: '#7dd3fc', marginBottom: 8 },
  muted: { fontSize: 14, color: '#cbd5e1' },
  form: { gap: 12 },
});

const styles = StyleSheet.create({
  safeForm: { flex: 1, justifyContent: 'center', padding: 20, width: '100%' },
  safePage: { flex: 1, width: '100%' },
  formContainer: {
    ...onBgStyles.onBgPanel,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  pageContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
});
