import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

/** One saved device row (matches backend /optimize device shape). */
export type DeviceRow = {
  id: string;
  name: string;
  power_kw: number;
  duration_minutes: number;
  priority: number;
  mandatory: boolean;
};

/**
 * Device entry + optimization home screen.
 * Form fields are controlled inputs; the list is the accumulated `devices` state.
 */
export default function DeviceOptimizerScreen() {
  // --- State -----------------------------------------------------------------
  // `devices`: list of devices the user has added (shown below the form).
  const [devices, setDevices] = useState<DeviceRow[]>([]);

  // Form fields: separate state per input so each keystroke/toggle re-renders correctly.
  // Numbers are kept as strings while typing; we parse them when adding a device.
  const [name, setName] = useState('');
  const [powerKw, setPowerKw] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [priority, setPriority] = useState('3');
  const [mandatory, setMandatory] = useState(false);

  // --- Adding a device -------------------------------------------------------
  // Validates, appends to `devices`, then resets the form so the user can enter another.
  const handleAddDevice = () => {
    const trimmedName = name.trim();
    const power = parseFloat(powerKw);
    const duration = parseInt(durationMinutes, 10);
    const prio = parseInt(priority, 10);

    if (!trimmedName) {
      Alert.alert('Validation', 'Please enter a device name.');
      return;
    }
    if (Number.isNaN(power) || power <= 0) {
      Alert.alert('Validation', 'Power (kW) must be a positive number.');
      return;
    }
    if (Number.isNaN(duration) || duration <= 0) {
      Alert.alert('Validation', 'Duration must be a positive whole number of minutes.');
      return;
    }
    if (Number.isNaN(prio) || prio < 1 || prio > 5) {
      Alert.alert('Validation', 'Priority must be between 1 and 5.');
      return;
    }

    const newDevice: DeviceRow = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: trimmedName,
      power_kw: power,
      duration_minutes: duration,
      priority: prio,
      mandatory,
    };

    setDevices((prev) => [...prev, newDevice]);

    // Clear inputs after a successful add (fresh row for the next device).
    setName('');
    setPowerKw('');
    setDurationMinutes('');
    setPriority('3');
    setMandatory(false);
  };

  const handleOptimize = () => {
    // Placeholder: later this will call the Solar Energy Optimization API.
    console.log('Optimize pressed', { devices });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <ThemedView style={styles.section}>
          <ThemedText type="title">Devices</ThemedText>
          <ThemedText style={styles.hint}>Add devices, then run Optimize (logs to console).</ThemedText>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">New device</ThemedText>

          <ThemedText style={styles.label}>Name</ThemedText>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. EV charger"
            placeholderTextColor="#888"
            autoCapitalize="words"
          />

          <ThemedText style={styles.label}>Power (kW)</ThemedText>
          <TextInput
            style={styles.input}
            value={powerKw}
            onChangeText={setPowerKw}
            placeholder="e.g. 7.2"
            placeholderTextColor="#888"
            keyboardType="decimal-pad"
          />

          <ThemedText style={styles.label}>Duration (minutes)</ThemedText>
          <TextInput
            style={styles.input}
            value={durationMinutes}
            onChangeText={setDurationMinutes}
            placeholder="e.g. 120"
            placeholderTextColor="#888"
            keyboardType="number-pad"
          />

          <ThemedText style={styles.label}>Priority (1–5)</ThemedText>
          <TextInput
            style={styles.input}
            value={priority}
            onChangeText={setPriority}
            placeholder="1 to 5"
            placeholderTextColor="#888"
            keyboardType="number-pad"
            maxLength={1}
          />

          <ThemedView style={styles.switchRow}>
            <ThemedText style={styles.label}>Mandatory</ThemedText>
            <Switch value={mandatory} onValueChange={setMandatory} />
          </ThemedView>

          <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={handleAddDevice}>
            <Text style={styles.buttonText}>Add Device</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.buttonSecondary, pressed && styles.buttonPressed]}
            onPress={handleOptimize}>
            <Text style={styles.buttonSecondaryText}>Optimize</Text>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Device list ({devices.length})</ThemedText>
          {devices.length === 0 ? (
            <ThemedText style={styles.empty}>No devices yet. Add one above.</ThemedText>
          ) : (
            devices.map((d) => (
              <ThemedView key={d.id} style={styles.card}>
                <ThemedText type="defaultSemiBold">{d.name}</ThemedText>
                <ThemedText>
                  {d.power_kw} kW · {d.duration_minutes} min · priority {d.priority} ·{' '}
                  {d.mandatory ? 'mandatory' : 'optional'}
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
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  hint: {
    opacity: 0.8,
    marginTop: 4,
  },
  label: {
    marginTop: 8,
    fontSize: 14,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#f9f9f9',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 4,
  },
  button: {
    marginTop: 16,
    backgroundColor: '#0a7ea4',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonSecondary: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a7ea4',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondaryText: {
    color: '#0a7ea4',
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    opacity: 0.7,
    marginTop: 8,
  },
  card: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    gap: 4,
  },
});
