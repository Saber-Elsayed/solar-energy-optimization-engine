import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';

type AppBackgroundProps = {
  children: ReactNode;
};

/** Root shell — neutral background; solar image is per-screen only. */
export function AppBackground({ children }: AppBackgroundProps) {
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
