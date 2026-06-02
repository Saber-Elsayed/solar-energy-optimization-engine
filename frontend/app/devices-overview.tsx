import { useEffect, useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';

import { OnBgScreen } from '@/components/on-bg-screen';
import { ThemedText } from '@/components/themed-text';
import { DEVICES_URL } from '@/lib/api-config';
import {
  hydrateDeviceEnabledStore,
  isDeviceEnabled,
  pruneDisabledDeviceIds,
  setDeviceEnabled,
  subscribeDeviceEnabled,
} from '@/lib/device-enabled-store';
import type { ApiDevice } from '@/lib/device-types';
import { deviceEnergyWh } from '@/lib/optimization-catalog';
import { onBgStyles } from '@/styles/on-bg';

export default function DevicesOverviewScreen() {
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setEnabledRevision] = useState(0);

  useEffect(() => {
    return subscribeDeviceEnabled(() => setEnabledRevision((value) => value + 1));
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        await hydrateDeviceEnabledStore();
        const res = await fetch(`${DEVICES_URL}?t=${Date.now()}`);
        if (res.ok) {
          const data = (await res.json()) as ApiDevice[];
          if (Array.isArray(data)) {
            pruneDisabledDeviceIds(data.map((device) => device.id));
            setDevices(data);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const enabledCount = devices.filter((device) => isDeviceEnabled(device.id)).length;

  return (
    <OnBgScreen>
      <View style={onBgStyles.onBgPanel}>
        <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
          Saved Devices ({devices.length})
        </ThemedText>
        <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
          {enabledCount} active · Turn off a product to exclude it from all energy calculations.
        </ThemedText>

        {loading ? (
          <ActivityIndicator size="large" color="#ffffff" />
        ) : devices.length === 0 ? (
          <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
            No products saved yet.
          </ThemedText>
        ) : (
          devices.map((device) => {
            const enabled = isDeviceEnabled(device.id);
            return (
              <View
                key={device.id}
                style={[onBgStyles.onBgPanelInner, !enabled && styles.deviceRowDisabled]}
              >
                <View style={styles.deviceRowTop}>
                  <View style={styles.deviceTitleBlock}>
                    <ThemedText type="defaultSemiBold" lightColor="#fff" style={onBgStyles.onBgBody}>
                      {device.name}
                    </ThemedText>
                    <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
                      {enabled ? 'Active' : 'Off — not consuming energy'}
                    </ThemedText>
                  </View>
                  <View style={styles.switchBlock}>
                    <ThemedText lightColor="#fff" style={styles.switchLabel}>
                      {enabled ? 'On' : 'Off'}
                    </ThemedText>
                    <Switch
                      value={enabled}
                      onValueChange={(nextEnabled) => setDeviceEnabled(device.id, nextEnabled)}
                      trackColor={{ false: '#64748b', true: '#9ad3a6' }}
                      thumbColor={enabled ? '#1f7a34' : '#f4f4f4'}
                    />
                  </View>
                </View>
                <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
                  {device.essential ? 'Required' : 'Optional'} · Priority {device.priority} · {device.duration}{' '}
                  min
                </ThemedText>
                <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
                  Schedule {device.start_time} – {device.end_time} · Energy{' '}
                  {enabled ? deviceEnergyWh(device).toFixed(0) : '0'} Wh
                </ThemedText>
                <ThemedText lightColor="#fff" style={onBgStyles.onBgBadge}>
                  {device.power} W
                </ThemedText>
              </View>
            );
          })
        )}
      </View>
    </OnBgScreen>
  );
}

const styles = {
  deviceRowDisabled: { opacity: 0.72 },
  deviceRowTop: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  deviceTitleBlock: { flex: 1, gap: 2 },
  switchBlock: { alignItems: 'center' as const, gap: 2 },
  switchLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#fff',
    opacity: 0.9,
  },
};
