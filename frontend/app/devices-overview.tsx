import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Saved Devices ({devices.length})</ThemedText>
          <ThemedText style={styles.muted}>
            {enabledCount} active · Turn off a product to exclude it from all energy calculations.
          </ThemedText>

          {loading ? (
            <ActivityIndicator size="large" color="#0a7ea4" />
          ) : devices.length === 0 ? (
            <ThemedText style={styles.muted}>No products saved yet.</ThemedText>
          ) : (
            devices.map((device) => {
              const enabled = isDeviceEnabled(device.id);
              return (
                <ThemedView
                  key={device.id}
                  style={[styles.deviceRowCard, !enabled && styles.deviceRowCardDisabled]}>
                  <ThemedView style={styles.deviceRowTop}>
                    <ThemedView style={styles.deviceTitleBlock}>
                      <ThemedText type="defaultSemiBold" style={!enabled ? styles.disabledText : undefined}>
                        {device.name}
                      </ThemedText>
                      <ThemedText style={styles.muted}>{enabled ? 'Active' : 'Off — not consuming energy'}</ThemedText>
                    </ThemedView>
                    <ThemedView style={styles.switchBlock}>
                      <ThemedText style={styles.switchLabel}>{enabled ? 'On' : 'Off'}</ThemedText>
                      <Switch
                        value={enabled}
                        onValueChange={(nextEnabled) => setDeviceEnabled(device.id, nextEnabled)}
                        trackColor={{ false: '#c9d4e2', true: '#9ad3a6' }}
                        thumbColor={enabled ? '#1f7a34' : '#f4f4f4'}
                      />
                    </ThemedView>
                  </ThemedView>
                  <ThemedText style={styles.muted}>
                    {device.essential ? 'Required' : 'Optional'} · Priority {device.priority} · {device.duration} min
                  </ThemedText>
                  <ThemedText style={styles.muted}>
                    Schedule {device.start_time} – {device.end_time} · Energy{' '}
                    {enabled ? deviceEnergyWh(device).toFixed(0) : '0'} Wh
                  </ThemedText>
                  <ThemedText style={styles.devicePowerBadge}>{device.power} W</ThemedText>
                </ThemedView>
              );
            })
          )}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d7deea',
    borderRadius: 12,
    backgroundColor: '#f8fbff',
    padding: 14,
    gap: 10,
  },
  muted: { opacity: 0.7 },
  deviceRowCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d0dae6',
    borderRadius: 10,
    backgroundColor: '#fff',
    padding: 12,
    gap: 6,
  },
  deviceRowCardDisabled: {
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  deviceRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  deviceTitleBlock: { flex: 1, gap: 2 },
  switchBlock: { alignItems: 'center', gap: 2 },
  switchLabel: { fontSize: 12, opacity: 0.7 },
  disabledText: { opacity: 0.55 },
  devicePowerBadge: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#9ec5f8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#eef5ff',
    fontWeight: '600',
  },
});
