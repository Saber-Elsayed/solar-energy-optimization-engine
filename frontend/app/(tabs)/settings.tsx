import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppButton } from '@/components/mobile/button';
import { Card } from '@/components/mobile/card';
import { MobileScreen, ScreenHeader } from '@/components/mobile/screen';
import { BodyText, CaptionText, HeadingText, TitleText } from '@/components/mobile/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useAppData } from '@/contexts/AppDataContext';
import { colors, spacing } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { batteryCapacityWhValue, inverterMaxPowerWValue } = useAppData();

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/login');
    } catch {
      // Auth guard redirects when session clears.
    }
  };

  return (
    <MobileScreen edges={['top', 'bottom']}>
      <ScreenHeader>
        <TitleText>Settings</TitleText>
        <CaptionText>Account and solar system configuration</CaptionText>
      </ScreenHeader>

      <Card>
        <HeadingText>User Profile</HeadingText>
        <BodyText>{user?.email ?? 'Not signed in'}</BodyText>
        <CaptionText>
          {user?.emailVerified ? 'Email verified' : 'Email not verified'} · UID {user?.uid?.slice(0, 8)}…
        </CaptionText>
      </Card>

      <Card onPress={() => router.push('/solar-system-settings')}>
        <View style={styles.linkRow}>
          <Ionicons name="sunny" size={22} color={colors.primary} />
          <View style={styles.linkText}>
            <HeadingText>Solar System Settings</HeadingText>
            <CaptionText>
              Battery {batteryCapacityWhValue > 0 ? `${batteryCapacityWhValue.toFixed(0)} Wh` : 'not set'} · Inverter{' '}
              {inverterMaxPowerWValue.toFixed(0)} W
            </CaptionText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Card>

      <Card onPress={() => router.push('/manage-devices')}>
        <View style={styles.linkRow}>
          <Ionicons name="construct-outline" size={22} color={colors.primary} />
          <View style={styles.linkText}>
            <HeadingText>Manage Devices</HeadingText>
            <CaptionText>Add, edit, or remove electrical devices</CaptionText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Card>

      <Card onPress={() => router.push('/feasible-combinations')}>
        <View style={styles.linkRow}>
          <Ionicons name="git-branch-outline" size={22} color={colors.primary} />
          <View style={styles.linkText}>
            <HeadingText>Feasible Combinations</HeadingText>
            <CaptionText>Full catalog and plan selection</CaptionText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Card>

      <Card onPress={() => router.push('/constraint-combinations')}>
        <View style={styles.linkRow}>
          <Ionicons name="albums-outline" size={22} color={colors.primary} />
          <View style={styles.linkText}>
            <HeadingText>Inverter & Battery Catalog</HeadingText>
            <CaptionText>Constraint combination reference</CaptionText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Card>

      <AppButton label="Logout" onPress={() => void handleLogout()} variant="danger" />
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  linkText: {
    flex: 1,
    gap: spacing.xs,
  },
});
