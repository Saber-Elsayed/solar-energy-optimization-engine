import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

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
  reason?: string;
};

const DEVICES_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/devices' : 'http://127.0.0.1:8000/devices';
const ENERGY_LATEST_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/energy-data/latest' : 'http://127.0.0.1:8000/energy-data/latest';
const CITIES_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/cities' : 'http://127.0.0.1:8000/cities';
const OPTIMIZE_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000/optimize' : 'http://127.0.0.1:8000/optimize';
const RAPID_DISCHARGE_DROP = 1.5;
const SAFE_VOLTAGE_THRESHOLD = 11.5;

function optimizeDevices(
  devices: ApiDevice[],
  availablePowerW: number,
  availableEnergyWh: number,
) {
  let remainingEnergyWh = availableEnergyWh;
  const ordered = [...devices].sort((a, b) => Number(b.essential) - Number(a.essential) || b.priority - a.priority);
  const allowed: DeviceDecision[] = [];
  const blocked: DeviceDecision[] = [];

  for (const device of ordered) {
    const usageHours = device.duration / 60;
    const requiredEnergyWh = device.power * usageHours;

    if (availablePowerW > 0 && device.power > availablePowerW) {
      blocked.push({ device, reason: 'Power exceeds current supply' });
      continue;
    }

    if (requiredEnergyWh <= remainingEnergyWh) {
      allowed.push({ device });
      remainingEnergyWh -= requiredEnergyWh;
    } else {
      blocked.push({ device, reason: 'Insufficient battery energy' });
    }
  }

  return { allowed, blocked, remainingEnergyWh };
}

export default function HomeScreen() {
  const router = useRouter();
  const previousVoltage = useRef<number | null>(null);

  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [battery, setBattery] = useState<EnergyDataItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<string[]>([]);

  const [city, setCity] = useState('Tel Aviv');
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [selectedCity, setSelectedCity] = useState<CitySuggestion | null>(null);
  const [weather, setWeather] = useState<OptimizeWeather | null>(null);
  const [batteryCapacityWh, setBatteryCapacityWh] = useState('1500');
  const [weatherLoading, setWeatherLoading] = useState(false);

  const voltage = typeof battery?.voltage === 'number' ? battery.voltage : 0;
  const current = typeof battery?.current === 'number' ? battery.current : 0;
  const soc = typeof battery?.soc === 'number' ? battery.soc : null;
  const powerW = useMemo(() => voltage * current, [voltage, current]);
  const batteryCapacityWhValue = useMemo(() => {
    const parsed = Number(batteryCapacityWh.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed <= 0) return 0;
    return parsed;
  }, [batteryCapacityWh]);
  const availableEnergyWh = useMemo(() => {
    if (soc !== null) {
      return batteryCapacityWhValue * (soc / 100);
    }
    return batteryCapacityWhValue;
  }, [batteryCapacityWhValue, soc]);
  const optimization = useMemo(
    () => optimizeDevices(devices, powerW, availableEnergyWh),
    [devices, powerW, availableEnergyWh],
  );

  const evaluateAlerts = (
    latestVoltage: number | undefined,
    latestSoc: number | undefined,
    latestPowerW: number,
    latestAvailableEnergyWh: number,
  ) => {
    const dynamicAlerts: string[] = [];
    const socValue = typeof latestSoc === 'number' ? latestSoc : null;
    const totalRequestedW = devices.reduce((sum, d) => sum + d.power, 0);
    const nextHourUsageWh = devices.reduce((sum, d) => sum + d.power * Math.min(d.duration, 60) / 60, 0);

    if (typeof latestVoltage === 'number') {
      if (previousVoltage.current !== null && previousVoltage.current - latestVoltage >= RAPID_DISCHARGE_DROP) {
        dynamicAlerts.push('⚠️ Rapid battery discharge detected');
      }
      if (latestVoltage < SAFE_VOLTAGE_THRESHOLD) {
        dynamicAlerts.push('⚠️ Risk of power outage - reduce load');
      }
      previousVoltage.current = latestVoltage;
    }
    if (socValue !== null && socValue < 25) {
      dynamicAlerts.push('⚠️ Low battery level');
    }
    if (socValue !== null && socValue < 35 && latestPowerW > 0 && totalRequestedW > latestPowerW) {
      dynamicAlerts.push('⚠️ High usage may drain battery soon');
    }
    if (socValue !== null && latestAvailableEnergyWh > 0 && nextHourUsageWh > latestAvailableEnergyWh) {
      dynamicAlerts.push('⚠️ Risk of battery depletion');
    }
    setAlerts(dynamicAlerts);
  };

  const fetchDashboardData = async () => {
    try {
      const [devicesRes, energyRes] = await Promise.all([
        fetch(`${DEVICES_URL}?t=${Date.now()}`),
        fetch(`${ENERGY_LATEST_URL}?t=${Date.now()}`),
      ]);
      if (devicesRes.ok) {
        const devicesData = (await devicesRes.json()) as ApiDevice[];
        if (Array.isArray(devicesData)) setDevices(devicesData);
      }
      if (energyRes.ok) {
        const latest = (await energyRes.json()) as EnergyDataItem;
        const latestVoltage = typeof latest?.voltage === 'number' ? latest.voltage : 0;
        const latestCurrent = typeof latest?.current === 'number' ? latest.current : 0;
        const latestSoc = typeof latest?.soc === 'number' ? latest.soc : undefined;
        const latestPowerW = latestVoltage * latestCurrent;
        const latestAvailableEnergyWh =
          typeof latestSoc === 'number'
            ? batteryCapacityWhValue * (latestSoc / 100)
            : batteryCapacityWhValue;
        setBattery(latest);
        evaluateAlerts(latest?.voltage, latest?.soc, latestPowerW, latestAvailableEnergyWh);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchWeather = async (targetCity: string) => {
    setWeatherLoading(true);
    try {
      const res = await fetch(OPTIMIZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: targetCity, devices: [] }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { weather?: OptimizeWeather };
      setWeather(data.weather ?? null);
    } finally {
      setWeatherLoading(false);
    }
  };

  useEffect(() => {
    void fetchDashboardData();
    const id = setInterval(() => {
      void fetchDashboardData();
    }, 5000);
    return () => clearInterval(id);
  }, []);

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
          <ThemedText type="title">Smart Energy Dashboard</ThemedText>
          <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={() => router.push('/manage-devices')}>
            <Text style={styles.buttonText}>Manage Electrical Devices</Text>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.row}>
          <ThemedView style={[styles.card, styles.infoBlue]}>
            <ThemedText type="subtitle">Battery</ThemedText>
            {loading ? (
              <ActivityIndicator size="small" color="#0a7ea4" />
            ) : (
              <>
                <ThemedText>Voltage: {battery?.voltage !== undefined ? String(battery.voltage) : 'N/A'}</ThemedText>
                <ThemedText>Current: {battery?.current !== undefined ? String(battery.current) : 'N/A'}</ThemedText>
                <ThemedText>Power: {String(powerW)} W</ThemedText>
                <ThemedText style={styles.socText}>SOC: {battery?.soc !== undefined ? `${String(battery.soc)}%` : 'N/A'}</ThemedText>
                <ThemedView style={styles.socBarTrack}>
                  <ThemedView style={[styles.socBarFill, { width: `${Math.max(0, Math.min(100, soc ?? 0))}%` }]} />
                </ThemedView>
              </>
            )}
            <ThemedText style={styles.label}>Battery Capacity (Wh)</ThemedText>
            <TextInput
              style={styles.input}
              value={batteryCapacityWh}
              onChangeText={setBatteryCapacityWh}
              keyboardType="decimal-pad"
            />
            <ThemedText style={styles.muted}>Available energy: {availableEnergyWh.toFixed(1)} Wh</ThemedText>
          </ThemedView>

          <ThemedView style={[styles.card, styles.safeGreen]}>
            <ThemedText type="subtitle">Optimization Results</ThemedText>
            <ThemedText type="defaultSemiBold">Allowed Devices ({optimization.allowed.length})</ThemedText>
            {optimization.allowed.length === 0 ? (
              <ThemedText style={styles.muted}>No devices can run now.</ThemedText>
            ) : (
              optimization.allowed.map((item) => (
                <ThemedText key={`allowed-${item.device.id}`}>- {item.device.name}</ThemedText>
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
                  - {item.device.name}: {item.reason}
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
