import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DEVICES_URL } from '@/lib/api-config';
import type { ApiDevice } from '@/lib/device-types';
import { deviceEnergyWh } from '@/lib/optimization-catalog';

export default function DevicesOverviewScreen() {
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${DEVICES_URL}?t=${Date.now()}`);
        if (res.ok) {
          const data = (await res.json()) as ApiDevice[];
          if (Array.isArray(data)) {
            setDevices(data);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Saved Devices ({devices.length})</ThemedText>
          <ThemedText style={styles.muted}>Power, runtime, priority, and schedule for each product.</ThemedText>

          {loading ? (
            <ActivityIndicator size="large" color="#0a7ea4" />
          ) : devices.length === 0 ? (
            <ThemedText style={styles.muted}>No products saved yet.</ThemedText>
          ) : (
            devices.map((device) => (
              <ThemedView key={device.id} style={styles.deviceRowCard}>
                <ThemedView style={styles.deviceRowTop}>
                  <ThemedText type="defaultSemiBold">{device.name}</ThemedText>
                  <ThemedText style={styles.devicePowerBadge}>{device.power} W</ThemedText>
                </ThemedView>
                <ThemedText style={styles.muted}>
                  {device.essential ? 'Required' : 'Optional'} · Priority {device.priority} · {device.duration} min
                </ThemedText>
                <ThemedText style={styles.muted}>
                  Schedule {device.start_time} – {device.end_time} · Energy {deviceEnergyWh(device).toFixed(0)} Wh
                </ThemedText>
              </ThemedView>
            ))
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
  deviceRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  devicePowerBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#9ec5f8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#eef5ff',
    fontWeight: '600',
  },
});
