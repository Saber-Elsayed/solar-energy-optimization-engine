import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { CenterAutoToast } from '@/components/center-auto-toast';
import { OnBgScreen } from '@/components/on-bg-screen';
import { ThemedText } from '@/components/themed-text';
import { onBgStyles } from '@/styles/on-bg';

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

type DeviceSaveResponse = {
  success: boolean;
  operation: 'created' | 'updated';
  id: string;
};

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

const PRODUCT_SAVE_FAILURE_MESSAGE = 'Failed to save product. Please try again.';
const PRODUCT_DELETE_FAILURE_MESSAGE = 'Failed to delete product. Please try again.';
const PRODUCT_DELETED_MESSAGE = 'Product deleted successfully';

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
  const trimmed = hhmm.trim();
  const minutesOnly = Number(trimmed);
  if (!Number.isNaN(minutesOnly) && minutesOnly > 0) {
    return Math.round(minutesOnly);
  }

  const match = /^(\d{1,2}):([0-5]\d)$/.exec(trimmed);
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
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
    setToast(null);
  };

  const listActionsLocked = deletingId !== null || submitting || loadingDevices;

  const loadDevices = async () => {
    try {
      setLoadingDevices(true);
      const res = await fetch(`${DEVICES_URL}?t=${Date.now()}`);
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
      return Alert.alert('Validation', 'Usage time must be HH:MM (05:22) or minutes (e.g. 30).');
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

    setSubmitting(true);
    setToast(null);
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
        setToast({ kind: 'error', message: PRODUCT_SAVE_FAILURE_MESSAGE });
        return;
      }
      const saveResult = (await res.json()) as DeviceSaveResponse;
      console.log('[ManageDevices] request success', { status: res.status, saveResult });

      if (!saveResult.success) {
        setToast({ kind: 'error', message: PRODUCT_SAVE_FAILURE_MESSAGE });
        return;
      }

      resetForm();
      await loadDevices();

      const successMessage =
        saveResult.operation === 'created' ? 'Product added successfully' : 'Product updated successfully';
      setToast({ kind: 'success', message: successMessage });
    } catch (err) {
      console.error('[ManageDevices] save error', err);
      setToast({ kind: 'error', message: PRODUCT_SAVE_FAILURE_MESSAGE });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (device: DeviceRow) => {
    setToast({
      kind: 'info',
      message: `“${device.name}” loaded for editing. Update the fields above, then tap Save Changes.`,
    });
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
    setToast(null);
    setDeletingId(deviceId);
    try {
      const res = await fetch(`${DEVICES_URL}/${deviceId}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error('[ManageDevices] DELETE failed', { status: res.status });
        setToast({ kind: 'error', message: PRODUCT_DELETE_FAILURE_MESSAGE });
        return;
      }
      if (editingId === deviceId) {
        resetForm();
      }
      setToast({ kind: 'success', message: PRODUCT_DELETED_MESSAGE });
      await loadDevices();
    } catch (err) {
      console.error('[ManageDevices] delete error', err);
      setToast({ kind: 'error', message: PRODUCT_DELETE_FAILURE_MESSAGE });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <OnBgScreen keyboardShouldPersistTaps="always">
        <View style={onBgStyles.onBgPanel}>
          <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
            Add / Edit Product
          </ThemedText>
          <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
            Usage Time: HH:MM (05:22) or minutes (30).
          </ThemedText>

          <ThemedText lightColor="#fff" style={onBgStyles.onBgLabel}>
            Name
          </ThemedText>
          <TextInput
            style={onBgStyles.onBgInput}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholderTextColor="rgba(255, 255, 255, 0.55)"
          />

          <ThemedText lightColor="#fff" style={onBgStyles.onBgLabel}>
            Power (W)
          </ThemedText>
          <TextInput
            style={onBgStyles.onBgInput}
            value={power}
            onChangeText={setPower}
            keyboardType="decimal-pad"
            placeholderTextColor="rgba(255, 255, 255, 0.55)"
          />

          <ThemedText lightColor="#fff" style={onBgStyles.onBgLabel}>
            Usage Time (HH:MM)
          </ThemedText>
          <TextInput
            style={onBgStyles.onBgInput}
            value={duration}
            onChangeText={setDuration}
            autoCapitalize="none"
            placeholderTextColor="rgba(255, 255, 255, 0.55)"
          />

          <ThemedText lightColor="#fff" style={onBgStyles.onBgLabel}>
            Priority (1-5)
          </ThemedText>
          <TextInput
            style={onBgStyles.onBgInput}
            value={priority}
            onChangeText={setPriority}
            keyboardType="number-pad"
            placeholderTextColor="rgba(255, 255, 255, 0.55)"
          />

          <ThemedText lightColor="#fff" style={onBgStyles.onBgLabel}>
            Start Hour
          </ThemedText>
          <TextInput
            style={onBgStyles.onBgInput}
            value={startHour}
            onChangeText={setStartHour}
            keyboardType="decimal-pad"
            placeholderTextColor="rgba(255, 255, 255, 0.55)"
          />

          <ThemedText lightColor="#fff" style={onBgStyles.onBgLabel}>
            End Hour
          </ThemedText>
          <TextInput
            style={onBgStyles.onBgInput}
            value={endHour}
            onChangeText={setEndHour}
            keyboardType="decimal-pad"
            placeholderTextColor="rgba(255, 255, 255, 0.55)"
          />

          <View style={styles.switchRow}>
            <ThemedText lightColor="#fff" style={onBgStyles.onBgLabel}>
              Mandatory
            </ThemedText>
            <Switch value={essential} onValueChange={setEssential} />
          </View>

          <Pressable
            style={({ pressed }) => [
              onBgStyles.onBgActionButton,
              styles.submitButton,
              pressed && !listActionsLocked && onBgStyles.buttonPressed,
              listActionsLocked && styles.primaryButtonDisabled,
            ]}
            onPress={() => void submitDevice()}
            disabled={listActionsLocked}
          >
            <View style={styles.primaryButtonInner}>
              {submitting ? <ActivityIndicator color="#fff" /> : null}
              <Text style={onBgStyles.onBgActionButtonText}>
                {submitting
                  ? isEditing
                    ? 'Saving...'
                    : 'Adding...'
                  : isEditing
                    ? 'Save Changes'
                    : 'Add Product'}
              </Text>
            </View>
          </Pressable>

          {isEditing && (
            <Pressable
              style={({ pressed }) => [
                onBgStyles.onBgOutlineButton,
                pressed && !submitting && onBgStyles.buttonPressed,
                (submitting || deletingId !== null) && styles.primaryButtonDisabled,
              ]}
              onPress={() => resetForm()}
              disabled={submitting || deletingId !== null}
            >
              <Text style={onBgStyles.onBgOutlineButtonText}>Cancel Edit</Text>
            </Pressable>
          )}
        </View>

        <View style={onBgStyles.onBgPanel}>
          <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
            Products ({devices.length})
          </ThemedText>
          {loadingDevices ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : devices.length === 0 ? (
            <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
              No products saved.
            </ThemedText>
          ) : (
            devices.map((d) => (
              <View key={d.id} style={onBgStyles.onBgPanelInner}>
                <ThemedText type="defaultSemiBold" lightColor="#fff" style={onBgStyles.onBgBody}>
                  {d.name}
                </ThemedText>
                <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
                  {d.power} W • {minutesToHHMM(d.duration)} • priority {d.priority}
                </ThemedText>
                <ThemedText lightColor="#fff" style={onBgStyles.onBgMuted}>
                  {d.essential ? 'mandatory' : 'optional'} • {d.startTime}h - {d.endTime}h
                </ThemedText>
                <Pressable
                  style={({ pressed }) => [
                    onBgStyles.onBgOutlineButton,
                    styles.rowButton,
                    pressed && !listActionsLocked && onBgStyles.buttonPressed,
                    listActionsLocked && styles.rowActionDisabled,
                  ]}
                  onPress={() => startEdit(d)}
                  disabled={listActionsLocked}
                >
                  <Text style={onBgStyles.onBgOutlineButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    onBgStyles.onBgDangerButton,
                    styles.rowButton,
                    pressed && !listActionsLocked && onBgStyles.buttonPressed,
                    listActionsLocked && styles.rowActionDisabled,
                  ]}
                  onPress={() => void deleteDevice(d.id)}
                  disabled={listActionsLocked}
                >
                  {deletingId === d.id ? (
                    <View style={styles.deleteButtonInner}>
                      <ActivityIndicator size="small" color="#ffe8e4" />
                      <Text style={onBgStyles.onBgDangerButtonText}>Deleting...</Text>
                    </View>
                  ) : (
                    <Text style={onBgStyles.onBgDangerButtonText}>Delete</Text>
                  )}
                </Pressable>
              </View>
            ))
          )}
        </View>
      </OnBgScreen>
      <CenterAutoToast feedback={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  submitButton: { alignSelf: 'stretch', marginTop: 10 },
  primaryButtonDisabled: { opacity: 0.72 },
  primaryButtonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowButton: { alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 12 },
  rowActionDisabled: { opacity: 0.5 },
  deleteButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
