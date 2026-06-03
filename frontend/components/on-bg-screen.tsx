import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SolarImageBackground } from '@/components/solar-image-background';
import { onBgStyles } from '@/styles/on-bg';

export type OnBgScreenVariant = 'solar' | 'dark';

type OnBgScreenProps = {
  children: ReactNode;
  /** `solar` — panel photo (catalog/forecast). `dark` — solid backdrop for other legacy screens. */
  variant?: OnBgScreenVariant;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  showsVerticalScrollIndicator?: boolean;
};

function OnBgScrollBody({
  children,
  contentContainerStyle,
  keyboardShouldPersistTaps,
  showsVerticalScrollIndicator,
}: Omit<OnBgScreenProps, 'variant'>) {
  return (
    <SafeAreaView style={onBgStyles.screenSafe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={[onBgStyles.screenContent, contentContainerStyle]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Scrollable screen with optional solar background. */
export function OnBgScreen({ variant = 'dark', ...scrollProps }: OnBgScreenProps) {
  const body = <OnBgScrollBody {...scrollProps} />;

  if (variant === 'solar') {
    return <SolarImageBackground>{body}</SolarImageBackground>;
  }

  return <View style={styles.darkBackdrop}>{body}</View>;
}

const styles = StyleSheet.create({
  darkBackdrop: {
    flex: 1,
    backgroundColor: '#1a1f26',
  },
});
