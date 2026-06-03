import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '@/components/mobile/card';
import { MobileScreen, ScreenHeader } from '@/components/mobile/screen';
import { AppButton } from '@/components/mobile/button';
import { BodyText, CaptionText, HeadingText, TitleText } from '@/components/mobile/typography';
import { useAppData } from '@/contexts/AppDataContext';
import { colors, spacing } from '@/constants/theme';
import {
  isDeviceEnabled,
  setDeviceEnabled,
  subscribeDeviceEnabled,
} from '@/lib/device-enabled-store';
import { useEffect, useState } from 'react';
import type { ApiDevice } from '@/lib/device-types';
import { deviceEnergyWh } from '@/lib/optimization-catalog';

export default function DevicesScreen() {
  const router = useRouter();
  const { devices, loading, fetchDashboardData } = useAppData();
  const [enabledRevision, setEnabledRevision] = useState(0);

  useEffect(() => subscribeDeviceEnabled(() => setEnabledRevision((v) => v + 1)), []);

  const renderDevice = (device: ApiDevice) => {
    void enabledRevision;
    const enabled = isDeviceEnabled(device.id);
    return (
      <Card key={device.id}>
        <View style={styles.deviceRow}>
          <View style={styles.deviceInfo}>
            <HeadingText style={styles.deviceName}>{device.name}</HeadingText>
            <CaptionText>
              {device.power} W · {device.duration} min · {deviceEnergyWh(device).toFixed(0)} Wh ·{' '}
              {device.essential ? 'Required' : 'Optional'}
            </CaptionText>
          </View>
          <Switch
            value={enabled}
            onValueChange={(value) => setDeviceEnabled(device.id, value)}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      </Card>
    );
  };

  return (
    <MobileScreen refreshing={loading} onRefresh={() => void fetchDashboardData()}>
      <ScreenHeader>
        <TitleText>Devices</TitleText>
        <CaptionText>Manage electrical loads and schedules</CaptionText>
      </ScreenHeader>

      <AppButton label="Manage Electrical Devices" onPress={() => router.push('/manage-devices')} />
      <AppButton
        label="Devices Overview"
        onPress={() => router.push('/devices-overview')}
        variant="outline"
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : devices.length === 0 ? (
        <Card>
          <BodyText>No devices yet. Add your first device to start optimizing.</BodyText>
        </Card>
      ) : (
        devices.map(renderDevice)
      )}

      <Card onPress={() => router.push('/constraint-combinations')}>
        <View style={styles.linkRow}>
          <Ionicons name="grid-outline" size={20} color={colors.primary} />
          <View style={styles.linkText}>
            <HeadingText>Inverter & Battery Catalog</HeadingText>
            <CaptionText>Browse constraint combination catalogs</CaptionText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Card>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  deviceInfo: { flex: 1, gap: spacing.xs },
  deviceName: { fontSize: 16 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  linkText: { flex: 1, gap: spacing.xs },
});
