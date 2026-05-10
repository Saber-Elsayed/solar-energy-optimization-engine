import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { authFetch } from '@/lib/api';

type SolarSystemResponse = {
  id: string;
  user_id: string;
  battery_capacity_wh: number;
  inverter_max_power_w: number;
  created_at?: string | null;
  updated_at?: string | null;
};

type SolarSystemSaveResponse = {
  success: boolean;
  operation: 'created' | 'updated' | string;
  data: SolarSystemResponse;
};

const SOLAR_SYSTEM_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000/solar-system' : 'http://127.0.0.1:8000/solar-system';

export default function SolarSystemSettingsScreen() {
  const [batteryCapacityWh, setBatteryCapacityWh] = useState('1500');
  const [inverterMaxPowerW, setInverterMaxPowerW] = useState('2000');
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const response = await authFetch(SOLAR_SYSTEM_URL);
        if (response.status === 404) {
          setHasProfile(false);
          return;
        }
        if (!response.ok) {
          throw new Error(`Failed to load settings (${response.status})`);
        }
        const profile = (await response.json()) as SolarSystemResponse;
        setBatteryCapacityWh(String(profile.battery_capacity_wh));
        setInverterMaxPowerW(String(profile.inverter_max_power_w));
        setHasProfile(true);
      } catch (err) {
        Alert.alert('Load failed', err instanceof Error ? err.message : 'Failed to load solar system settings');
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, []);

  const saveSettings = async () => {
    const payload = {
      battery_capacity_wh: Number(batteryCapacityWh.replace(',', '.')),
      inverter_max_power_w: Number(inverterMaxPowerW.replace(',', '.')),
    };

    if (
      Number.isNaN(payload.battery_capacity_wh) ||
      payload.battery_capacity_wh <= 0 ||
      Number.isNaN(payload.inverter_max_power_w) ||
      payload.inverter_max_power_w <= 0
    ) {
      Alert.alert('Validation', 'Please enter valid positive values.');
      return;
    }

    try {
      setLoading(true);
      console.log('[SOLAR DEBUG] request payload:', payload);
      const response = await authFetch(SOLAR_SYSTEM_URL, {
        method: hasProfile ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('[SOLAR DEBUG] save response:', { status: response.status, ok: response.ok });
      if (!response.ok) {
        const text = await response.text();
        console.log('[SOLAR DEBUG] save response body:', text);
        throw new Error(`Save failed (${response.status}): ${text}`);
      }
      const saveResult = (await response.json()) as SolarSystemSaveResponse;
      console.log('[SOLAR DEBUG] save result:', saveResult);
      const savedProfile = saveResult.data;
      setBatteryCapacityWh(String(savedProfile.battery_capacity_wh));
      setInverterMaxPowerW(String(savedProfile.inverter_max_power_w));
      setHasProfile(true);
      if (saveResult.success && saveResult.operation === 'created') {
        Alert.alert('Success', 'Solar system settings created successfully');
      } else if (saveResult.success && saveResult.operation === 'updated') {
        Alert.alert('Success', 'Solar system settings updated successfully');
      } else {
        Alert.alert('Success', 'Solar system settings saved successfully');
      }
    } catch (err) {
      console.log('[SOLAR DEBUG] save error:', err);
      Alert.alert('Save failed', 'Failed to save solar system settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        <ThemedView style={styles.card}>
          <ThemedText type="title">Solar System Settings</ThemedText>

          <ThemedText style={styles.label}>Battery Capacity (Wh)</ThemedText>
          <TextInput style={styles.input} value={batteryCapacityWh} onChangeText={setBatteryCapacityWh} keyboardType="decimal-pad" />

          <ThemedText style={styles.label}>Inverter Max Power (W)</ThemedText>
          <TextInput style={styles.input} value={inverterMaxPowerW} onChangeText={setInverterMaxPowerW} keyboardType="decimal-pad" />

          <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={() => void saveSettings()} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Saving...' : hasProfile ? 'Update Settings' : 'Save Settings'}</Text>
          </Pressable>
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d8e0ea',
    backgroundColor: '#f8fbff',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
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
  button: {
    marginTop: 12,
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 12,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

