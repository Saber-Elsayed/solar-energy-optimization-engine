import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { authFetch } from '@/lib/api';

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
const SOLAR_SYSTEM_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000/solar-system' : 'http://127.0.0.1:8000/solar-system';

type SolarSystemProfileResponse = {
  battery_capacity_wh: number;
};
const RAPID_DISCHARGE_DROP = 1.5;
const SAFE_VOLTAGE_THRESHOLD = 11.5;

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
  const previousVoltage = useRef<number | null>(null);

  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [battery, setBattery] = useState<EnergyDataItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<string[]>([]);

  const [city, setCity] = useState('Tel Aviv');
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [selectedCity, setSelectedCity] = useState<CitySuggestion | null>(null);
  const [weather, setWeather] = useState<OptimizeWeather | null>(null);
  const [batteryCapacityWhValue, setBatteryCapacityWhValue] = useState(0);
  const batteryCapacityWhRef = useRef(0);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const voltage = typeof battery?.voltage === 'number' ? battery.voltage : 0;
  const current = typeof battery?.current === 'number' ? battery.current : 0;
  const soc = typeof battery?.soc === 'number' ? battery.soc : null;
  const socNormalized = useMemo(() => (soc !== null ? soc / 100 : 0), [soc]);
  const availableEnergyWh = useMemo(() => {
    if (soc !== null) {
      return batteryCapacityWhValue * socNormalized;
    }
    return batteryCapacityWhValue;
  }, [batteryCapacityWhValue, soc, socNormalized]);
  const optimization = useMemo(
    () => optimizeDevices(devices, availableEnergyWh),
    [devices, availableEnergyWh],
  );

  const evaluateAlerts = (latestSoc: number | undefined, latestAvailableEnergyWh: number) => {
    const dynamicAlerts: string[] = [];
    const socValue = typeof latestSoc === 'number' ? latestSoc : null;
    const nextHourUsageWh = devices.reduce((sum, d) => sum + d.power * (d.duration / 60), 0);

    if (socValue !== null && socValue < 25) {
      dynamicAlerts.push('⚠️ Low battery level');
    }
    if (socValue !== null && socValue < 35 && nextHourUsageWh > latestAvailableEnergyWh) {
      dynamicAlerts.push('⚠️ High usage may drain battery soon');
    }
    if (socValue !== null && latestAvailableEnergyWh > 0 && nextHourUsageWh > latestAvailableEnergyWh) {
      dynamicAlerts.push('⚠️ Risk of battery depletion');
    }
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
      let capacityWhForCalc = batteryCapacityWhRef.current;

      try {
        const solarRes = await authFetch(SOLAR_SYSTEM_URL);
        if (solarRes.status === 404) {
          capacityWhForCalc = 0;
        } else if (solarRes.ok) {
          const profile = (await solarRes.json()) as SolarSystemProfileResponse;
          const parsed = Number(profile.battery_capacity_wh);
          capacityWhForCalc = !Number.isNaN(parsed) && parsed > 0 ? parsed : 0;
        }
      } catch {
        capacityWhForCalc = batteryCapacityWhRef.current;
      }

      batteryCapacityWhRef.current = capacityWhForCalc;
      setBatteryCapacityWhValue(capacityWhForCalc);

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
        const latestSoc = typeof latest?.soc === 'number' ? latest.soc : undefined;
        const latestSocNormalized = typeof latestSoc === 'number' ? latestSoc / 100 : 0;
        const latestAvailableEnergyWh =
          typeof latestSoc === 'number'
            ? capacityWhForCalc * latestSocNormalized
            : capacityWhForCalc;
        console.log('[Energy] Inputs and calculation', {
          soc_raw: latestSoc,
          soc_div_100: latestSocNormalized,
          battery_capacity: capacityWhForCalc,
          available_energy: latestAvailableEnergyWh,
        });
        setBattery(latest);
        evaluateAlerts(latest?.soc, latestAvailableEnergyWh);
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
          <ThemedText type="title">Manage Products</ThemedText>
          <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={() => router.push('/manage-devices')}>
            <Text style={styles.buttonText}>Manage Electrical Devices</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]} onPress={() => router.push('/solar-system-settings')}>
            <Text style={styles.secondaryButtonText}>Solar System Settings</Text>
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
                <ThemedText style={styles.socText}>SOC: {battery?.soc !== undefined ? `${String(battery.soc)}%` : 'N/A'}</ThemedText>
                <ThemedView style={styles.socBarTrack}>
                  <ThemedView style={[styles.socBarFill, { width: `${Math.max(0, Math.min(100, soc ?? 0))}%` }]} />
                </ThemedView>
              </>
            )}
            <ThemedText style={styles.label}>Available Energy (Wh)</ThemedText>
            <ThemedText type="defaultSemiBold">{availableEnergyWh.toFixed(1)} Wh</ThemedText>
            {batteryCapacityWhValue <= 0 ? (
              <ThemedText style={styles.muted}>
                Battery capacity comes from Solar System Settings. Configure it there to compute available energy.
              </ThemedText>
            ) : null}
          </ThemedView>

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
  secondaryButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a7ea4',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: '#0a7ea4',
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
