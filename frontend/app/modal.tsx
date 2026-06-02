import { Link } from 'expo-router';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { OnBgScreen } from '@/components/on-bg-screen';
import { onBgStyles } from '@/styles/on-bg';

export default function ModalScreen() {
  return (
    <OnBgScreen contentContainerStyle={styles.centered}>
      <View style={onBgStyles.onBgPanel}>
        <ThemedText type="title" lightColor="#fff" style={onBgStyles.onBgTitle}>
          This is a modal
        </ThemedText>
        <Link href="/" dismissTo style={styles.link}>
          <ThemedText type="link" lightColor="#e0f2fe" style={onBgStyles.onBgBody}>
            Go to home screen
          </ThemedText>
        </Link>
      </View>
    </OnBgScreen>
  );
}

const styles = {
  centered: {
    flexGrow: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
};
