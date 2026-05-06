import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type ApiDevicePayload = {
  name: string;
  power: number;
  duration: number;
  priority: number;
  essential: boolean;
  start_time: string;
  end_time: string;
};

type ApiDevice = ApiDevicePayload & { id: string };

type DeviceRow = {
  id: string;
  name: string;
  power: number;
  duration: number;
  priority: number;
  essential: boolean;
  startTime: string;
  endTime: string;
};

const DEVICES_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/devices' : 'http://127.0.0.1:8000/devices';

function hhmmToHourText(hhmm: string): string {
  const [h, m] = hhmm.split(':').map((v) => Number(v));
  if (Number.isNaN(h) || Number.isNaN(m)) return '0';
  const value = h + m / 60;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function hourTextToHHMM(hourText: string): string | null {
  const timePattern = /^(\d{1,2}):([0-5]\d)$/;
  const match = timePattern.exec(hourText.trim());
  if (match) {
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (hh > 23) return null;
    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
  }

  const normalized = Number(hourText.replace(',', '.'));
  if (Number.isNaN(normalized)) return null;
  const totalMinutes = Math.round(normalized * 60);
  const normalizedDayMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalizedDayMinutes / 60);
  const minute = normalizedDayMinutes % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function minutesToHHMM(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hh = Math.floor(safeMinutes / 60);
  const mm = safeMinutes % 60;
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

function hhmmToMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(hhmm.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  return hh * 60 + mm;
}

function fromApiDevice(api: ApiDevice): DeviceRow {
  return {
    id: api.id,
    name: api.name,
    power: api.power,
    duration: api.duration,
    priority: api.priority,
    essential: api.essential,
    startTime: hhmmToHourText(api.start_time),
    endTime: hhmmToHourText(api.end_time),
  };
}

export default function ManageDevicesScreen() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [power, setPower] = useState('');
  const [duration, setDuration] = useState('00:30');
  const [priority, setPriority] = useState('3');
  const [essential, setEssential] = useState(false);
  const [startHour, setStartHour] = useState('8');
  const [endHour, setEndHour] = useState('18');
  const isEditing = useMemo(() => editingId !== null, [editingId]);

  const resetForm = () => {
    setName('');
    setPower('');
    setDuration('00:30');
    setPriority('3');
    setEssential(false);
    setStartHour('8');
    setEndHour('18');
    setEditingId(null);
  };

  const loadDevices = async () => {
    try {
      setLoadingDevices(true);
      const res = await fetch(DEVICES_URL);
      if (!res.ok) {
        throw new Error(`GET /devices failed (${res.status})`);
      }
      const data: unknown = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid devices response format');
      }
      const mapped = (data as ApiDevice[]).map(fromApiDevice);
      setDevices(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load devices';
      Alert.alert('Load failed', message);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    void loadDevices();
  }, []);

  const submitDevice = async () => {
    console.log('[ManageDevices] submit triggered', { name, power, duration, priority, essential, startHour, endHour });
    const parsedPower = Number(power.replace(',', '.'));
    const parsedDuration = hhmmToMinutes(duration);
    const parsedPriority = parseInt(priority, 10);
    const startHHMM = hourTextToHHMM(startHour);
    const endHHMM = hourTextToHHMM(endHour);

    if (!name.trim()) {
      console.warn('[ManageDevices] validation failed: name');
      return Alert.alert('Validation', 'Please enter Name.');
    }
    if (Number.isNaN(parsedPower) || parsedPower <= 0) {
      console.warn('[ManageDevices] validation failed: power', power);
      return Alert.alert('Validation', 'Power (W) must be positive.');
    }
    if (parsedDuration === null || parsedDuration <= 0) {
      console.warn('[ManageDevices] validation failed: duration', duration);
      return Alert.alert('Validation', 'Usage time must be in HH:MM format (example: 05:22).');
    }
    if (Number.isNaN(parsedPriority) || parsedPriority < 1 || parsedPriority > 5) {
      console.warn('[ManageDevices] validation failed: priority', priority);
      return Alert.alert('Validation', 'Priority must be between 1 and 5.');
    }
    if (!startHHMM || !endHHMM) {
      console.warn('[ManageDevices] validation failed: start/end', { startHour, endHour });
      return Alert.alert('Validation', 'Start and End must be hour value (8 or 8.5) or HH:MM.');
    }

    const payload: ApiDevicePayload = {
      name: name.trim(),
      power: parsedPower,
      duration: parsedDuration,
      priority: parsedPriority,
      essential,
      start_time: startHHMM,
      end_time: endHHMM,
    };

    const url = isEditing ? `${DEVICES_URL}/${editingId}` : DEVICES_URL;
    const method = isEditing ? 'PUT' : 'POST';

    try {
      console.log('[ManageDevices] sending request', { method, url, payload });
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ManageDevices] request failed', { status: res.status, body: errorText });
        throw new Error(`${method} failed (${res.status}): ${errorText}`);
      }
      const bodyText = await res.text();
      console.log('[ManageDevices] request success', { status: res.status, body: bodyText });
      await loadDevices();
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save device';
      Alert.alert('Save failed', message);
    }
  };

  const startEdit = (device: DeviceRow) => {
    setEditingId(device.id);
    setName(device.name);
    setPower(String(device.power));
    setDuration(minutesToHHMM(device.duration));
    setPriority(String(device.priority));
    setEssential(device.essential);
    setStartHour(device.startTime);
    setEndHour(device.endTime);
  };

  const deleteDevice = async (deviceId: string) => {
    const previous = devices;
    setDevices((curr) => curr.filter((item) => item.id !== deviceId));
    try {
      const res = await fetch(`${DEVICES_URL}/${deviceId}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(`DELETE failed (${res.status})`);
      }
    } catch (err) {
      setDevices(previous);
      const message = err instanceof Error ? err.message : 'Failed to delete device';
      Alert.alert('Delete failed', message);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Add / Edit Product</ThemedText>
          <ThemedText style={styles.note}>Usage Time format: HH:MM (example: 05:22).</ThemedText>

          <ThemedText style={styles.label}>Name</ThemedText>
          <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words" />

          <ThemedText style={styles.label}>Power (W)</ThemedText>
          <TextInput style={styles.input} value={power} onChangeText={setPower} keyboardType="decimal-pad" />

          <ThemedText style={styles.label}>Usage Time (HH:MM)</ThemedText>
          <TextInput style={styles.input} value={duration} onChangeText={setDuration} autoCapitalize="none" />

          <ThemedText style={styles.label}>Priority (1-5)</ThemedText>
          <TextInput style={styles.input} value={priority} onChangeText={setPriority} keyboardType="number-pad" />

          <ThemedText style={styles.label}>Start Hour</ThemedText>
          <TextInput style={styles.input} value={startHour} onChangeText={setStartHour} keyboardType="decimal-pad" />

          <ThemedText style={styles.label}>End Hour</ThemedText>
          <TextInput style={styles.input} value={endHour} onChangeText={setEndHour} keyboardType="decimal-pad" />

          <ThemedView style={styles.switchRow}>
            <ThemedText style={styles.label}>Mandatory</ThemedText>
            <Switch value={essential} onValueChange={setEssential} />
          </ThemedView>

          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]} onPress={() => void submitDevice()}>
            <Text style={styles.primaryButtonText}>{isEditing ? 'Save Changes' : 'Add Product'}</Text>
          </Pressable>
          {isEditing && (
            <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]} onPress={resetForm}>
              <Text style={styles.secondaryButtonText}>Cancel Edit</Text>
            </Pressable>
          )}
        </ThemedView>

        <ThemedView style={styles.card}>
          <ThemedText type="subtitle">Products ({devices.length})</ThemedText>
          {loadingDevices ? (
            <ActivityIndicator size="small" color="#0a7ea4" />
          ) : devices.length === 0 ? (
            <ThemedText style={styles.muted}>No products saved.</ThemedText>
          ) : (
            devices.map((d) => (
              <ThemedView key={d.id} style={styles.deviceCard}>
                <ThemedText type="defaultSemiBold">{d.name}</ThemedText>
                <ThemedText>
                  {d.power} W • {minutesToHHMM(d.duration)} • priority {d.priority}
                </ThemedText>
                <ThemedText>
                  {d.essential ? 'mandatory' : 'optional'} • {d.startTime}h - {d.endTime}h
                </ThemedText>
                <Pressable style={({ pressed }) => [styles.editButton, pressed && styles.buttonPressed]} onPress={() => startEdit(d)}>
                  <Text style={styles.editButtonText}>Edit</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [styles.deleteButton, pressed && styles.buttonPressed]} onPress={() => void deleteDevice(d.id)}>
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </Pressable>
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
  content: { padding: 16, gap: 14, paddingBottom: 26 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d8e0ea',
    backgroundColor: '#f8fbff',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  note: { fontSize: 13, opacity: 0.8 },
  label: { marginTop: 4, fontSize: 14 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c6ced8',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  primaryButton: { marginTop: 10, backgroundColor: '#0a7ea4', borderRadius: 8, alignItems: 'center', paddingVertical: 12 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryButton: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a7ea4',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 11,
  },
  secondaryButtonText: { color: '#0a7ea4', fontSize: 15, fontWeight: '600' },
  editButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a7ea4',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editButtonText: { color: '#0a7ea4', fontWeight: '600' },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#b1321f',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffe9e5',
  },
  deleteButtonText: { color: '#b1321f', fontWeight: '700' },
  buttonPressed: { opacity: 0.85 },
  muted: { opacity: 0.7 },
  deviceCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d9e2',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    marginTop: 6,
  },
});
