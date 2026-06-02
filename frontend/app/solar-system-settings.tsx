import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CenterAutoToast } from '@/components/center-auto-toast';
import { OnBgScreen } from '@/components/on-bg-screen';
import { ThemedText } from '@/components/themed-text';
import { onBgStyles } from '@/styles/on-bg';

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
  operation: 'created' | 'updated';
  data: SolarSystemResponse;
};

type SaveFeedback = { kind: 'success' | 'error'; message: string };

const SOLAR_SYSTEM_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000/solar-system' : 'http://127.0.0.1:8000/solar-system';

const SAVE_FAILURE_MESSAGE = 'Failed to save solar system settings. Please try again.';

export default function SolarSystemSettingsScreen() {
  const [batteryCapacityWh, setBatteryCapacityWh] = useState('1500');
  const [inverterMaxPowerW, setInverterMaxPowerW] = useState('2000');
  const [hasProfile, setHasProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);

  const fetchProfileFromServer = useCallback(async () => {
    const response = await fetch(SOLAR_SYSTEM_URL);
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
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      try {
        setProfileLoading(true);
        await fetchProfileFromServer();
      } catch (err) {
        if (!cancelled) {
          Alert.alert('Load failed', err instanceof Error ? err.message : 'Failed to load solar system settings');
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [fetchProfileFromServer]);

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

    setSaving(true);
    setSaveFeedback(null);
    try {
      console.log('[SOLAR DEBUG] request payload:', payload);
      const response = await fetch(SOLAR_SYSTEM_URL, {
        method: hasProfile ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('[SOLAR DEBUG] save response:', { status: response.status, ok: response.ok });
      if (!response.ok) {
        const text = await response.text();
        console.log('[SOLAR DEBUG] save response body:', text);
        setSaveFeedback({ kind: 'error', message: SAVE_FAILURE_MESSAGE });
        return;
      }
      const saveResult = (await response.json()) as SolarSystemSaveResponse;
      console.log('[SOLAR DEBUG] save result:', saveResult);

      if (!saveResult.success) {
        setSaveFeedback({ kind: 'error', message: SAVE_FAILURE_MESSAGE });
        return;
      }

      const savedProfile = saveResult.data;
      setBatteryCapacityWh(String(savedProfile.battery_capacity_wh));
      setInverterMaxPowerW(String(savedProfile.inverter_max_power_w));
      setHasProfile(true);

      try {
        await fetchProfileFromServer();
      } catch (refreshErr) {
        console.log('[SOLAR DEBUG] refresh after save error:', refreshErr);
        setBatteryCapacityWh(String(savedProfile.battery_capacity_wh));
        setInverterMaxPowerW(String(savedProfile.inverter_max_power_w));
        setHasProfile(true);
      }

      const successMessage =
        saveResult.operation === 'created'
          ? 'Solar system settings created successfully'
          : 'Solar system settings updated successfully';
      setSaveFeedback({ kind: 'success', message: successMessage });
    } catch (err) {
      console.log('[SOLAR DEBUG] save error:', err);
      setSaveFeedback({ kind: 'error', message: SAVE_FAILURE_MESSAGE });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <OnBgScreen keyboardShouldPersistTaps="always">
        <View style={onBgStyles.onBgPanel}>
          <ThemedText type="title" lightColor="#fff" style={onBgStyles.onBgTitle}>
            Solar System Settings
          </ThemedText>

          <ThemedText lightColor="#fff" style={onBgStyles.onBgLabel}>
            Battery Capacity (Wh)
          </ThemedText>
          <TextInput
            style={onBgStyles.onBgInput}
            value={batteryCapacityWh}
            onChangeText={setBatteryCapacityWh}
            keyboardType="decimal-pad"
            placeholderTextColor="rgba(255, 255, 255, 0.55)"
          />

          <ThemedText lightColor="#fff" style={onBgStyles.onBgLabel}>
            Inverter Max Power (W)
          </ThemedText>
          <TextInput
            style={onBgStyles.onBgInput}
            value={inverterMaxPowerW}
            onChangeText={setInverterMaxPowerW}
            keyboardType="decimal-pad"
            placeholderTextColor="rgba(255, 255, 255, 0.55)"
          />

          <Pressable
            style={({ pressed }) => [
              onBgStyles.onBgActionButton,
              styles.saveButton,
              pressed && !saving && onBgStyles.buttonPressed,
              saving && styles.buttonDisabled,
            ]}
            onPress={() => void saveSettings()}
            disabled={saving || profileLoading}
          >
            <View style={styles.buttonInner}>
              {saving ? <ActivityIndicator color="#fff" /> : null}
              <Text style={onBgStyles.onBgActionButtonText}>
                {saving ? 'Saving...' : hasProfile ? 'Update Settings' : 'Save Settings'}
              </Text>
            </View>
          </Pressable>
        </View>
      </OnBgScreen>
      <CenterAutoToast feedback={saveFeedback} onDismiss={() => setSaveFeedback(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  saveButton: { alignSelf: 'stretch', marginTop: 12 },
  buttonDisabled: { opacity: 0.72 },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

