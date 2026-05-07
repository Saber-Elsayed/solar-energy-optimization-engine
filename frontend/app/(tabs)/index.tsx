import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BatteryStatusCard } from '@/components/battery-status-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AUTH_TOKEN_MISSING_ERROR, authFetch, isUnauthorized } from '@/lib/api';
import { clearAuthToken } from '@/lib/auth';

type ApiDevice = {
  id: string;
  name: string;
  power: number;
  duration: number;
  priority: number;
  essential: boolean;
  start_time: string;
  end_time: string;
};

type EnergyDataItem = {
  voltage?: number;
  current?: number;
  soc?: number;
};

type OptimizeWeather = {
  city?: string;
  condition?: string;
  energy_estimate?: number;
  temperature?: number | null;
};

type CitySuggestion = {
  name: string;
  country: string;
};

type DeviceDecision = {
  device: ApiDevice;
  deviceEnergyWh: number;
  reason?: string;
};

const DEVICES_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/devices' : 'http://127.0.0.1:8000/devices';
const ENERGY_LATEST_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/energy-data/latest' : 'http://127.0.0.1:8000/energy-data/latest';
const CITIES_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/cities' : 'http://127.0.0.1:8000/cities';
const OPTIMIZE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/optimize' : 'http://127.0.0.1:8000/optimize';

function optimizeDevices(
  devices: ApiDevice[],
  availableEnergyWh: number,
) {
  let remainingEnergyWh = availableEnergyWh;
  const allowed: DeviceDecision[] = [];
  const blocked: DeviceDecision[] = [];
  const mandatoryDevices = devices.filter((d) => d.essential);
  const optionalDevices = devices.filter((d) => !d.essential);
  let totalDeviceEnergyWh = 0;
  let mandatoryEnergyWh = 0;
  let optionalEnergyWh = 0;

  console.log('[Optimization] New cycle start', {
    available_energy_wh: availableEnergyWh,
    device_count: devices.length,
    mandatory_count: mandatoryDevices.length,
    optional_count: optionalDevices.length,
  });

  for (const device of mandatoryDevices) {
    const usageHours = device.duration / 60;
    const requiredEnergyWh = device.power * usageHours;
    totalDeviceEnergyWh += requiredEnergyWh;
    mandatoryEnergyWh += requiredEnergyWh;
    console.log('[Optimization] Device energy check', {
      device: device.name,
      category: 'mandatory',
      power_w: device.power,
      usage_time_hours: usageHours,
      device_energy_wh: requiredEnergyWh,
      remaining_before_wh: remainingEnergyWh,
    });

    if (requiredEnergyWh <= remainingEnergyWh) {
      allowed.push({ device, deviceEnergyWh: requiredEnergyWh });
      remainingEnergyWh -= requiredEnergyWh;
      console.log('[Optimization] Decision', {
        device: device.name,
        decision: 'allowed',
        category: 'mandatory',
        remaining_after_wh: remainingEnergyWh,
      });
    } else {
      blocked.push({ device, deviceEnergyWh: requiredEnergyWh, reason: 'Not enough available energy' });
      console.log('[Optimization] Decision', {
        device: device.name,
        decision: 'blocked',
        category: 'mandatory',
        reason: 'Not enough available energy',
        remaining_after_wh: remainingEnergyWh,
      });
    }
  }

  const optionalWithEnergy = optionalDevices
    .map((device) => {
      const usageHours = device.duration / 60;
      const requiredEnergyWh = device.power * usageHours;
      return { device, requiredEnergyWh, usageHours };
    })
    .sort((a, b) => a.requiredEnergyWh - b.requiredEnergyWh);

  for (const item of optionalWithEnergy) {
    const { device, requiredEnergyWh, usageHours } = item;
    totalDeviceEnergyWh += requiredEnergyWh;
    optionalEnergyWh += requiredEnergyWh;
    console.log('[Optimization] Device energy check', {
      device: device.name,
      category: 'optional',
      power_w: device.power,
      usage_time_hours: usageHours,
      device_energy_wh: requiredEnergyWh,
      remaining_before_wh: remainingEnergyWh,
    });

    if (requiredEnergyWh <= remainingEnergyWh) {
      allowed.push({ device, deviceEnergyWh: requiredEnergyWh });
      remainingEnergyWh -= requiredEnergyWh;
      console.log('[Optimization] Decision', {
        device: device.name,
        decision: 'allowed',
        category: 'optional',
        remaining_after_wh: remainingEnergyWh,
      });
    } else {
      blocked.push({ device, deviceEnergyWh: requiredEnergyWh, reason: 'Exceeds remaining battery capacity' });
      console.log('[Optimization] Decision', {
        device: device.name,
        decision: 'blocked',
        category: 'optional',
        reason: 'Exceeds remaining battery capacity',
        remaining_after_wh: remainingEnergyWh,
      });
    }
  }

  const blockedMandatoryCount = blocked.filter((item) => item.device.essential).length;
  const blockedOptionalCount = blocked.filter((item) => !item.device.essential).length;

  console.log('[Optimization] Cycle summary', {
    total_device_energy_wh: totalDeviceEnergyWh,
    mandatory_energy_wh: mandatoryEnergyWh,
    optional_energy_wh: optionalEnergyWh,
    remaining_energy_wh: remainingEnergyWh,
    allowed_count: allowed.length,
    blocked_count: blocked.length,
    blocked_mandatory_count: blockedMandatoryCount,
    blocked_optional_count: blockedOptionalCount,
  });

  return {
    allowed,
    blocked,
    remainingEnergyWh,
    blockedMandatoryCount,
    blockedOptionalCount,
  };
}

export default function HomeScreen() {
  const router = useRouter();

  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<string[]>([]);

  const [city, setCity] = useState('Tel Aviv');
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [selectedCity, setSelectedCity] = useState<CitySuggestion | null>(null);
  const [weather, setWeather] = useState<OptimizeWeather | null>(null);
  const [batteryCapacityWh, setBatteryCapacityWh] = useState('1500');
  const [weatherLoading, setWeatherLoading] = useState(false);

  const batteryCapacityWhValue = useMemo(() => {
    const parsed = Number(batteryCapacityWh.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return parsed;
  }, [batteryCapacityWh]);
  const availableEnergyWh = batteryCapacityWhValue;
  const optimization = useMemo(
    () => optimizeDevices(devices, availableEnergyWh),
    [devices, availableEnergyWh],
  );

  const evaluateAlerts = () => {
    const dynamicAlerts: string[] = [];
    if (optimization.blockedMandatoryCount > 0) {
      dynamicAlerts.push('⚠️ Not enough energy for required devices');
    }
    if (optimization.blockedOptionalCount > 0) {
      dynamicAlerts.push('Optional devices limited due to energy constraints');
    }
    setAlerts(dynamicAlerts);
  };

  const fetchDashboardData = async () => {
    try {
      const devicesRes = await authFetch(`${DEVICES_URL}?t=${Date.now()}`);
      if (isUnauthorized(devicesRes)) {
        await handleLogout();
        return;
      }
      if (devicesRes.ok) {
        const devicesData = (await devicesRes.json()) as ApiDevice[];
        if (Array.isArray(devicesData)) setDevices(devicesData);
      }
    } catch (err) {
      if (err instanceof Error && err.message === AUTH_TOKEN_MISSING_ERROR) {
        await handleLogout();
        return;
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchWeather = async (targetCity: string) => {
    setWeatherLoading(true);
    try {
      const res = await authFetch(OPTIMIZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: targetCity, devices: [] }),
      });
      if (isUnauthorized(res)) {
        await handleLogout();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { weather?: OptimizeWeather };
      setWeather(data.weather ?? null);
    } catch (err) {
      if (err instanceof Error && err.message === AUTH_TOKEN_MISSING_ERROR) {
        await handleLogout();
        return;
      }
    } finally {
      setWeatherLoading(false);
    }
  };

  useEffect(() => {
    void fetchDashboardData();
  }, []);

  useEffect(() => {
    evaluateAlerts();
  }, [optimization.blockedMandatoryCount, optimization.blockedOptionalCount]);

  useEffect(() => {
    const query = city.trim();
    if (query.length < 2) {
      setCitySuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`${CITIES_URL}?query=${encodeURIComponent(query)}`);
      if (!res.ok) {
        setCitySuggestions([]);
        return;
      }
      const data = (await res.json()) as CitySuggestion[];
      if (!Array.isArray(data)) {
        setCitySuggestions([]);
        return;
      }
      setCitySuggestions(data.slice(0, 8));
    }, 350);
    return () => clearTimeout(timer);
  }, [city]);

  const onSelectCity = (item: CitySuggestion) => {
    setSelectedCity(item);
    setCity(item.name);
    setCitySuggestions([]);
    void fetchWeather(item.name);
  };

  const handleLogout = async () => {
    await clearAuthToken();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="always">
        <ThemedView style={styles.topSection}>
          {alerts.length > 0 && (
            <ThemedView style={styles.alertBanner}>
              {alerts.map((alert, idx) => (
                <ThemedText key={`alert-${idx}`} style={styles.alertText}>
                  {alert}
                </ThemedText>
              ))}
            </ThemedView>
          )}

          <ThemedView style={[styles.card, styles.infoBlue, styles.sectionSpacing]}>
            <ThemedText type="subtitle">Weather</ThemedText>
            <ThemedText style={styles.label}>City</ThemedText>
            <TextInput style={styles.input} value={city} onChangeText={setCity} autoCapitalize="words" />
            {citySuggestions.length > 0 && (
              <ThemedView style={styles.dropdown}>
                {citySuggestions.map((item, idx) => (
                  <Pressable key={`${item.name}-${item.country}-${idx}`} style={({ pressed }) => [styles.cityRow, pressed && styles.buttonPressed]} onPress={() => onSelectCity(item)}>
                    <ThemedText>{item.name}</ThemedText>
                    <ThemedText style={styles.muted}>{item.country}</ThemedText>
                  </Pressable>
                ))}
              </ThemedView>
            )}
            {weatherLoading ? <ActivityIndicator size="small" color="#0a7ea4" /> : null}
            {selectedCity && weather && (
              <ThemedView style={styles.subCard}>
                <ThemedText>City: {weather.city ?? selectedCity.name}</ThemedText>
                <ThemedText>Temperature: {weather.temperature ?? 'N/A'}</ThemedText>
                <ThemedText>Condition: {weather.condition ?? 'N/A'}</ThemedText>
              </ThemedView>
            )}
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.topHeaderCard}>
          <ThemedView style={styles.topHeaderRow}>
            <ThemedText type="title">Manage Products</ThemedText>
            <Pressable style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]} onPress={() => void handleLogout()}>
              <Text style={styles.logoutButtonText}>Logout</Text>
            </Pressable>
          </ThemedView>
          <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={() => router.push('/manage-devices')}>
            <Text style={styles.buttonText}>Manage Electrical Devices</Text>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.row}>
          <BatteryStatusCard
            energyLatestUrl={ENERGY_LATEST_URL}
            batteryCapacityWh={batteryCapacityWh}
            onBatteryCapacityChange={setBatteryCapacityWh}
            onUnauthorized={handleLogout}
          />

          <ThemedView style={[styles.card, styles.safeGreen]}>
            <ThemedText type="subtitle">Optimization Results</ThemedText>
            <ThemedText type="defaultSemiBold">Allowed Devices ({optimization.allowed.length})</ThemedText>
            {optimization.allowed.length === 0 ? (
              <ThemedText style={styles.muted}>No devices can run now.</ThemedText>
            ) : (
              optimization.allowed.map((item) => (
                <ThemedText key={`allowed-${item.device.id}`}>
                  - {item.device.name} ({item.device.essential ? 'Required' : 'Optional'}) - {item.deviceEnergyWh.toFixed(1)} Wh
                </ThemedText>
              ))
            )}

            <ThemedText type="defaultSemiBold" style={styles.blockedTitle}>
              Blocked Devices ({optimization.blocked.length})
            </ThemedText>
            {optimization.blocked.length === 0 ? (
              <ThemedText style={styles.muted}>No blocked devices.</ThemedText>
            ) : (
              optimization.blocked.map((item) => (
                <ThemedText key={`blocked-${item.device.id}`}>
                  - {item.device.name} ({item.device.essential ? 'Required' : 'Optional'}): {item.reason}
                </ThemedText>
              ))
            )}
          </ThemedView>
        </ThemedView>

        <ThemedView style={[styles.card, styles.infoNeutral]}>
          <ThemedText type="subtitle">Devices ({devices.length})</ThemedText>
          {devices.length === 0 ? (
            <ThemedText style={styles.muted}>No products saved yet.</ThemedText>
          ) : (
            devices.map((d) => (
              <ThemedView key={d.id} style={styles.deviceRowCard}>
                <ThemedView style={styles.deviceRowTop}>
                  <ThemedText type="defaultSemiBold">{d.name}</ThemedText>
                  <ThemedText style={styles.devicePowerBadge}>{d.power} W</ThemedText>
                </ThemedView>
                <ThemedText style={styles.muted}>
                  Priority {d.priority} · {d.essential ? 'mandatory' : 'optional'} · {d.duration} min
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
  container: {
    padding: 18,
    gap: 16,
    paddingBottom: 28,
  },
  topSection: {
    marginBottom: 4,
  },
  topHeaderCard: {
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
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
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
  safeGreen: {
    borderColor: '#9ad3a6',
    backgroundColor: '#edf9ef',
  },
  infoNeutral: {
    borderColor: '#d7deea',
    backgroundColor: '#f8fbff',
  },
  alertBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d54d38',
    borderRadius: 10,
    backgroundColor: '#ffe9e5',
    padding: 12,
    gap: 4,
    marginBottom: 10,
  },
  alertText: {
    color: '#b1321f',
    fontWeight: '700',
  },
  button: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a7ea4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  logoutButtonText: {
    color: '#0a7ea4',
    fontWeight: '700',
    fontSize: 13,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
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
  dropdown: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccd6e2',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  cityRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e6edf5',
  },
  subCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d1d9e2',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
    gap: 4,
  },
  muted: { opacity: 0.7 },
  blockedTitle: { marginTop: 10 },
  sectionSpacing: {
    marginBottom: 8,
  },
  deviceRowCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d0dae6',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
  },
  deviceRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  devicePowerBadge: {
    color: '#17508d',
    backgroundColor: '#e9f2ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '600',
  },
});
