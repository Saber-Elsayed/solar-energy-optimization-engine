import { ActivityIndicator, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useEnergyPolling } from '@/hooks/use-energy-polling';

type BatteryStatusCardProps = {
  energyLatestUrl: string;
  batteryCapacityWh: string;
  onBatteryCapacityChange: (value: string) => void;
  onUnauthorized: () => Promise<void> | void;
};

export function BatteryStatusCard({
  energyLatestUrl,
  batteryCapacityWh,
  onBatteryCapacityChange,
  onUnauthorized,
}: BatteryStatusCardProps) {
  const { battery, loading } = useEnergyPolling({
    energyLatestUrl,
    onUnauthorized,
    pollMs: 5000,
  });

  const capacity = Number(batteryCapacityWh.replace(',', '.'));
  const safeCapacity = Number.isNaN(capacity) || capacity <= 0 ? 0 : capacity;
  const soc = typeof battery?.soc === 'number' ? battery.soc : null;
  const availableEnergyWh = soc !== null ? safeCapacity * (soc / 100) : safeCapacity;

  return (
    <ThemedView style={[styles.card, styles.infoBlue]}>
      <ThemedText type="subtitle">Battery</ThemedText>
      {loading ? (
        <ActivityIndicator size="small" color="#0a7ea4" />
      ) : (
        <>
          <ThemedText>Voltage: {battery?.voltage !== undefined ? String(battery.voltage) : 'N/A'}</ThemedText>
          <ThemedText>Current: {battery?.current !== undefined ? String(battery.current) : 'N/A'}</ThemedText>
          <ThemedText style={styles.socText}>SOC: {battery?.soc !== undefined ? `${String(battery.soc)}%` : 'N/A'}</ThemedText>
          <ThemedView style={styles.socBarTrack}>
            <ThemedView style={[styles.socBarFill, { width: `${Math.max(0, Math.min(100, soc ?? 0))}%` }]} />
          </ThemedView>
        </>
      )}
      <ThemedText style={styles.label}>Battery Capacity</ThemedText>
      <TextInput
        style={styles.input}
        value={batteryCapacityWh}
        onChangeText={onBatteryCapacityChange}
        keyboardType="decimal-pad"
      />
      <ThemedText style={styles.muted}>Available Energy: {availableEnergyWh.toFixed(1)}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 280,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d7deea',
    borderRadius: 12,
    backgroundColor: '#f8fbff',
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  infoBlue: {
    borderColor: '#9ec5f8',
    backgroundColor: '#eef5ff',
  },
  label: { fontSize: 14 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c6ced8',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
  },
  muted: { opacity: 0.7 },
  socText: { fontWeight: '700', color: '#1b4b7a' },
  socBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#dbe8f7',
    overflow: 'hidden',
    marginTop: 2,
    marginBottom: 2,
  },
  socBarFill: {
    height: '100%',
    backgroundColor: '#1f7a34',
  },
});

