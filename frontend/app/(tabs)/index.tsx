import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RunnableComboList } from '@/components/combination-catalog-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  CITIES_URL,
  DEFAULT_INVERTER_MAX_POWER_W,
  DEVICES_URL,
  ENERGY_LATEST_URL,
  OPTIMIZE_URL,
  SOLAR_SYSTEM_URL,
} from '@/lib/api-config';
import type { ApiDevice } from '@/lib/device-types';
import {
  buildDevicesCatalogSignature,
  buildRunnableCombinationCatalog,
  deviceEnergyWh,
  energyForDuration,
  MAX_INVERTER_ENUM_DEVICES,
} from '@/lib/optimization-catalog';

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
  constraint?: 'inverter_power' | 'available_energy';
  remainingEnergyWhAtBlock?: number;
};

type AlternativeCombination = {
  id: string;
  blockedDevice: ApiDevice;
  constraint: 'inverter_power' | 'available_energy';
  removeDevices: ApiDevice[];
  addDevices: ApiDevice[];
  summary: string;
};

type DurationReductionSuggestion = {
  id: string;
  device: ApiDevice;
  originalDurationMinutes: number;
  suggestedDurationMinutes: number;
  reduceByMinutes: number;
  suggestedEnergyWh: number;
  summary: string;
};

function maxRunnableDurationMinutes(device: ApiDevice, availableEnergyWh: number): number {
  if (device.power <= 0 || availableEnergyWh <= 0) return 0;
  return Math.floor((availableEnergyWh / device.power) * 60);
}

function buildDurationReductionSuggestions(blocked: DeviceDecision[]): DurationReductionSuggestion[] {
  const suggestions: DurationReductionSuggestion[] = [];

  for (const item of blocked) {
    if (item.constraint !== 'available_energy') continue;

    const remainingEnergyWh = item.remainingEnergyWhAtBlock ?? 0;
    const originalDurationMinutes = item.device.duration;
    const maxDurationMinutes = maxRunnableDurationMinutes(item.device, remainingEnergyWh);

    if (maxDurationMinutes <= 0) {
      const deficitWh = Math.max(0, item.deviceEnergyWh - remainingEnergyWh);
      suggestions.push({
        id: `${item.device.id}|none`,
        device: item.device,
        originalDurationMinutes,
        suggestedDurationMinutes: 0,
        reduceByMinutes: originalDurationMinutes,
        suggestedEnergyWh: 0,
        summary: `Not enough energy (${deficitWh.toFixed(0)} Wh short) to run even 1 minute.`,
      });
      continue;
    }

    if (maxDurationMinutes >= originalDurationMinutes) continue;

    const reduceByMinutes = originalDurationMinutes - maxDurationMinutes;
    const suggestedEnergyWh = energyForDuration(item.device, maxDurationMinutes);
    suggestions.push({
      id: `${item.device.id}|${maxDurationMinutes}`,
      device: item.device,
      originalDurationMinutes,
      suggestedDurationMinutes: maxDurationMinutes,
      reduceByMinutes,
      suggestedEnergyWh,
      summary: `Reduce usage by ${reduceByMinutes} min (${originalDurationMinutes} → ${maxDurationMinutes} min) to run within available energy (${suggestedEnergyWh.toFixed(0)} Wh).`,
    });
  }

  return suggestions;
}

function getConstraintKind(reason?: string): 'inverter_power' | 'available_energy' | null {
  if (reason?.includes('inverter limit')) return 'inverter_power';
  if (
    reason?.includes('available energy') ||
    reason?.includes('battery capacity') ||
    reason?.includes('Not enough')
  ) {
    return 'available_energy';
  }
  return null;
}

function combinationFits(devices: ApiDevice[], availableEnergyWh: number, inverterMaxPowerW: number): boolean {
  const totalPower = devices.reduce((sum, device) => sum + device.power, 0);
  const totalEnergy = devices.reduce((sum, device) => sum + deviceEnergyWh(device), 0);
  return totalPower <= inverterMaxPowerW && totalEnergy <= availableEnergyWh;
}

function expandBlockedDevicesIntoCombination(
  baseDevices: ApiDevice[],
  blockedPool: ApiDevice[],
  availableEnergyWh: number,
  inverterMaxPowerW: number,
  mustInclude?: ApiDevice,
): ApiDevice[] {
  const added: ApiDevice[] = [];
  let current = [...baseDevices];
  const sortedPool = [...blockedPool].sort((a, b) => deviceEnergyWh(a) - deviceEnergyWh(b));

  if (mustInclude && !current.some((device) => device.id === mustInclude.id)) {
    if (combinationFits([...current, mustInclude], availableEnergyWh, inverterMaxPowerW)) {
      current.push(mustInclude);
      added.push(mustInclude);
    } else {
      return [];
    }
  }

  for (const device of sortedPool) {
    if (current.some((item) => item.id === device.id)) continue;
    if (!combinationFits([...current, device], availableEnergyWh, inverterMaxPowerW)) continue;
    current.push(device);
    added.push(device);
  }

  return added;
}

function formatAlternativeSummary(removeDevices: ApiDevice[], addDevices: ApiDevice[]): string {
  const addNames = addDevices.map((device) => device.name).join(', ');
  if (removeDevices.length === 0) {
    return `You can add: ${addNames}`;
  }
  const removeNames = removeDevices.map((device) => device.name).join(', ');
  return `Remove ${removeNames} to run: ${addNames}`;
}

function buildAlternativeCombinations(
  allowed: DeviceDecision[],
  blocked: DeviceDecision[],
  availableEnergyWh: number,
  inverterMaxPowerW: number,
  activePowerW: number,
  remainingEnergyWh: number,
): AlternativeCombination[] {
  const allowedDevices = allowed.map((item) => item.device);
  const removableOptional = allowedDevices.filter((device) => !device.essential);
  const constraintBlocked = blocked.filter((item) => getConstraintKind(item.reason) !== null);
  const blockedPool = constraintBlocked.map((item) => item.device);

  if (constraintBlocked.length === 0) {
    return [];
  }

  const suggestions: AlternativeCombination[] = [];
  const seen = new Set<string>();

  const pushSuggestion = (
    blockedDevice: ApiDevice,
    constraint: 'inverter_power' | 'available_energy',
    removeDevices: ApiDevice[],
    addDevices: ApiDevice[],
  ) => {
    if (addDevices.length === 0) return;
    const key = [
      blockedDevice.id,
      removeDevices
        .map((device) => device.id)
        .sort()
        .join('+'),
      addDevices
        .map((device) => device.id)
        .sort()
        .join('+'),
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({
      id: key,
      blockedDevice,
      constraint,
      removeDevices,
      addDevices,
      summary: formatAlternativeSummary(removeDevices, addDevices),
    });
  };

  for (const blockedItem of constraintBlocked) {
    const target = blockedItem.device;
    const constraint = getConstraintKind(blockedItem.reason)!;

    for (const remove of removableOptional) {
      const base = allowedDevices.filter((device) => device.id !== remove.id);
      const addDevices = expandBlockedDevicesIntoCombination(
        base,
        blockedPool,
        availableEnergyWh,
        inverterMaxPowerW,
        target,
      );
      pushSuggestion(target, constraint, [remove], addDevices);
    }

    for (let i = 0; i < removableOptional.length; i += 1) {
      for (let j = i + 1; j < removableOptional.length; j += 1) {
        const removeDevices = [removableOptional[i], removableOptional[j]];
        const removeIds = new Set(removeDevices.map((device) => device.id));
        const base = allowedDevices.filter((device) => !removeIds.has(device.id));
        const addDevices = expandBlockedDevicesIntoCombination(
          base,
          blockedPool,
          availableEnergyWh,
          inverterMaxPowerW,
          target,
        );
        pushSuggestion(target, constraint, removeDevices, addDevices);
      }
    }

    if (
      target.power <= inverterMaxPowerW - activePowerW &&
      deviceEnergyWh(target) <= remainingEnergyWh
    ) {
      pushSuggestion(target, constraint, [], [target]);
    }
  }

  const powerSlack = inverterMaxPowerW - activePowerW;
  const energySlack = remainingEnergyWh;
  for (const blockedItem of constraintBlocked) {
    const device = blockedItem.device;
    if (device.power > powerSlack || deviceEnergyWh(device) > energySlack) continue;
    if (allowedDevices.some((allowedDevice) => allowedDevice.id === device.id)) continue;
    pushSuggestion(device, getConstraintKind(blockedItem.reason)!, [], [device]);
  }

  return suggestions.slice(0, 12);
}

type SolarSystemProfileResponse = {
  battery_capacity_wh: number;
  inverter_max_power_w: number;
};

function optimizeDevices(
  devices: ApiDevice[],
  availableEnergyWh: number,
  inverterMaxPowerW: number,
) {
  let remainingEnergyWh = availableEnergyWh;
  let activePowerW = 0;
  const allowed: DeviceDecision[] = [];
  const blocked: DeviceDecision[] = [];
  const mandatoryDevices = devices.filter((d) => d.essential);
  const optionalDevices = devices.filter((d) => !d.essential);
  let totalDeviceEnergyWh = 0;
  let mandatoryEnergyWh = 0;
  let optionalEnergyWh = 0;

  const evaluateDevice = (device: ApiDevice, category: 'mandatory' | 'optional') => {
    const usageHours = device.duration / 60;
    const requiredEnergyWh = device.power * usageHours;
    const projectedPowerW = activePowerW + device.power;

    console.log('[Optimization] Device check', {
      device: device.name,
      category,
      power_w: device.power,
      usage_time_hours: usageHours,
      device_energy_wh: requiredEnergyWh,
      active_power_w: activePowerW,
      projected_power_w: projectedPowerW,
      inverter_max_power_w: inverterMaxPowerW,
      remaining_before_wh: remainingEnergyWh,
    });

    if (projectedPowerW > inverterMaxPowerW) {
      blocked.push({
        device,
        deviceEnergyWh: requiredEnergyWh,
        reason: `Total active power (${projectedPowerW.toFixed(0)} W) exceeds inverter limit (${inverterMaxPowerW.toFixed(0)} W).`,
        constraint: 'inverter_power',
      });
      console.log('[Optimization] Decision', {
        device: device.name,
        decision: 'blocked',
        category,
        reason: 'inverter_power',
      });
      return;
    }

    if (requiredEnergyWh > remainingEnergyWh) {
      blocked.push({
        device,
        deviceEnergyWh: requiredEnergyWh,
        reason: device.essential
          ? 'Not enough available energy'
          : 'Exceeds remaining battery capacity',
        constraint: 'available_energy',
        remainingEnergyWhAtBlock: remainingEnergyWh,
      });
      console.log('[Optimization] Decision', {
        device: device.name,
        decision: 'blocked',
        category,
        reason: 'available_energy',
      });
      return;
    }

    allowed.push({ device, deviceEnergyWh: requiredEnergyWh });
    remainingEnergyWh -= requiredEnergyWh;
    activePowerW += device.power;
    console.log('[Optimization] Decision', {
      device: device.name,
      decision: 'allowed',
      category,
      active_power_after_w: activePowerW,
      remaining_after_wh: remainingEnergyWh,
    });
  };

  console.log('[Optimization] New cycle start', {
    available_energy_wh: availableEnergyWh,
    inverter_max_power_w: inverterMaxPowerW,
    device_count: devices.length,
    mandatory_count: mandatoryDevices.length,
    optional_count: optionalDevices.length,
  });

  for (const device of mandatoryDevices) {
    const requiredEnergyWh = device.power * (device.duration / 60);
    totalDeviceEnergyWh += requiredEnergyWh;
    mandatoryEnergyWh += requiredEnergyWh;
    evaluateDevice(device, 'mandatory');
  }

  const optionalWithEnergy = optionalDevices
    .map((device) => ({
      device,
      requiredEnergyWh: device.power * (device.duration / 60),
    }))
    .sort((a, b) => a.requiredEnergyWh - b.requiredEnergyWh);

  for (const item of optionalWithEnergy) {
    totalDeviceEnergyWh += item.requiredEnergyWh;
    optionalEnergyWh += item.requiredEnergyWh;
    evaluateDevice(item.device, 'optional');
  }

  const blockedMandatoryCount = blocked.filter((item) => item.device.essential).length;
  const blockedOptionalCount = blocked.filter((item) => !item.device.essential).length;

  console.log('[Optimization] Cycle summary', {
    total_device_energy_wh: totalDeviceEnergyWh,
    mandatory_energy_wh: mandatoryEnergyWh,
    optional_energy_wh: optionalEnergyWh,
    active_power_w: activePowerW,
    remaining_energy_wh: remainingEnergyWh,
    allowed_count: allowed.length,
    blocked_count: blocked.length,
    blocked_mandatory_count: blockedMandatoryCount,
    blocked_optional_count: blockedOptionalCount,
  });

  const alternatives = buildAlternativeCombinations(
    allowed,
    blocked,
    availableEnergyWh,
    inverterMaxPowerW,
    activePowerW,
    remainingEnergyWh,
  );
  const durationSuggestions = buildDurationReductionSuggestions(blocked);

  return {
    allowed,
    blocked,
    remainingEnergyWh,
    activePowerW,
    blockedMandatoryCount,
    blockedOptionalCount,
    alternatives,
    durationSuggestions,
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
  const [inverterMaxPowerWValue, setInverterMaxPowerWValue] = useState(DEFAULT_INVERTER_MAX_POWER_W);
  const inverterMaxPowerWRef = useRef(DEFAULT_INVERTER_MAX_POWER_W);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [selectedRunnableCombinationId, setSelectedRunnableCombinationId] = useState<string | null>(null);
  const [showAllRunnableEssentialOnly, setShowAllRunnableEssentialOnly] = useState(false);
  const [showAllRunnableOptionalOnly, setShowAllRunnableOptionalOnly] = useState(false);
  const [showAllRunnableEssentialOptional, setShowAllRunnableEssentialOptional] = useState(false);

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
    () => optimizeDevices(devices, availableEnergyWh, inverterMaxPowerWValue),
    [devices, availableEnergyWh, inverterMaxPowerWValue],
  );
  const devicesCatalogSignature = useMemo(() => buildDevicesCatalogSignature(devices), [devices]);
  const energyCatalogSignature = useMemo(
    () => `${devicesCatalogSignature}|${availableEnergyWh.toFixed(1)}`,
    [devicesCatalogSignature, availableEnergyWh],
  );
  const runnableCombinationCatalog = useMemo(
    () => buildRunnableCombinationCatalog(devices, inverterMaxPowerWValue, availableEnergyWh),
    [devices, inverterMaxPowerWValue, availableEnergyWh],
  );
  const runnableCatalogSignature = useMemo(
    () => `${energyCatalogSignature}|inv:${inverterMaxPowerWValue.toFixed(0)}`,
    [energyCatalogSignature, inverterMaxPowerWValue],
  );
  const allRunnableCombinations = useMemo(
    () => [
      ...runnableCombinationCatalog.essentialOnly,
      ...runnableCombinationCatalog.optionalOnly,
      ...runnableCombinationCatalog.essentialWithOptional,
    ],
    [runnableCombinationCatalog],
  );
  const selectedRunnableCombination = useMemo(
    () => allRunnableCombinations.find((combo) => combo.id === selectedRunnableCombinationId) ?? null,
    [allRunnableCombinations, selectedRunnableCombinationId],
  );

  useEffect(() => {
    setShowAllRunnableEssentialOnly(false);
    setShowAllRunnableOptionalOnly(false);
    setShowAllRunnableEssentialOptional(false);
  }, [runnableCatalogSignature]);

  useEffect(() => {
    if (!selectedRunnableCombinationId) {
      return;
    }
    const stillExists = allRunnableCombinations.some((combo) => combo.id === selectedRunnableCombinationId);
    if (!stillExists) {
      setSelectedRunnableCombinationId(null);
    }
  }, [allRunnableCombinations, selectedRunnableCombinationId]);

  const handleSelectRunnableCombination = (comboId: string) => {
    setSelectedRunnableCombinationId((prev) => (prev === comboId ? null : comboId));
  };

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
    const blockedByInverter = optimization.blocked.some((item) =>
      item.reason?.includes('exceeds inverter limit'),
    );
    if (blockedByInverter) {
      dynamicAlerts.push('⚠️ Some devices blocked due to inverter power limit');
    }
    setAlerts(dynamicAlerts);
  };

  const fetchDashboardData = async () => {
    try {
      let capacityWhForCalc = batteryCapacityWhRef.current;
      let inverterMaxPowerWForCalc = inverterMaxPowerWRef.current;

      try {
        const solarRes = await fetch(`${SOLAR_SYSTEM_URL}?t=${Date.now()}`);
        if (solarRes.status === 404) {
          capacityWhForCalc = 0;
          inverterMaxPowerWForCalc = DEFAULT_INVERTER_MAX_POWER_W;
        } else if (solarRes.ok) {
          const profile = (await solarRes.json()) as SolarSystemProfileResponse;
          const parsedCapacity = Number(profile.battery_capacity_wh);
          const parsedInverter = Number(profile.inverter_max_power_w);
          capacityWhForCalc = !Number.isNaN(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : 0;
          inverterMaxPowerWForCalc =
            !Number.isNaN(parsedInverter) && parsedInverter > 0 ? parsedInverter : DEFAULT_INVERTER_MAX_POWER_W;
        }
      } catch {
        capacityWhForCalc = batteryCapacityWhRef.current;
        inverterMaxPowerWForCalc = inverterMaxPowerWRef.current;
      }

      batteryCapacityWhRef.current = capacityWhForCalc;
      inverterMaxPowerWRef.current = inverterMaxPowerWForCalc;
      setBatteryCapacityWhValue((prev) => (prev === capacityWhForCalc ? prev : capacityWhForCalc));
      setInverterMaxPowerWValue((prev) =>
        prev === inverterMaxPowerWForCalc ? prev : inverterMaxPowerWForCalc,
      );

      const [devicesRes, energyRes] = await Promise.all([
        fetch(`${DEVICES_URL}?t=${Date.now()}`),
        fetch(`${ENERGY_LATEST_URL}?t=${Date.now()}`),
      ]);
      if (devicesRes.ok) {
        const devicesData = (await devicesRes.json()) as ApiDevice[];
        if (Array.isArray(devicesData)) {
          const nextSignature = buildDevicesCatalogSignature(devicesData);
          setDevices((prev) =>
            buildDevicesCatalogSignature(prev) === nextSignature ? prev : devicesData,
          );
        }
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
          <ThemedView style={styles.batteryColumn}>
            <ThemedView style={[styles.card, styles.infoBlue, styles.columnCard]}>
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

            <Pressable
              style={({ pressed }) => [styles.card, styles.infoBlue, styles.columnCard, pressed && styles.buttonPressed]}
              onPress={() => router.push('/constraint-combinations')}>
              <ThemedText type="subtitle">Inverter & Battery Combinations</ThemedText>
              <ThemedText style={styles.muted}>Inverter power and battery energy catalogs</ThemedText>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.card, styles.infoBlue, styles.columnCard, pressed && styles.buttonPressed]}
              onPress={() => router.push('/devices-overview')}>
              <ThemedText type="subtitle">Devices Overview</ThemedText>
              <ThemedText style={styles.muted}>Power, schedule, and energy per device</ThemedText>
            </Pressable>
          </ThemedView>

          <ThemedView style={styles.optimizationColumn}>
            <ThemedView style={[styles.card, styles.safeGreen]}>
            <ThemedText type="subtitle">Optimization Results</ThemedText>

            {selectedRunnableCombination ? (
              <>
                <ThemedText type="defaultSemiBold" style={styles.selectedPlanTitle}>
                  Selected Running Plan
                </ThemedText>
                <ThemedView style={styles.selectedPlanCard}>
                  <ThemedText>{selectedRunnableCombination.summary}</ThemedText>
                  <ThemedText style={styles.muted}>
                    Total load {selectedRunnableCombination.totalPowerW.toFixed(0)} W · Total energy{' '}
                    {selectedRunnableCombination.totalEnergyWh.toFixed(0)} Wh
                  </ThemedText>
                  {selectedRunnableCombination.devices.map((device) => (
                    <ThemedText key={`selected-${device.id}`}>
                      - {device.name} ({device.essential ? 'Required' : 'Optional'}) · {device.power} W ·{' '}
                      {device.duration} min · {deviceEnergyWh(device).toFixed(0)} Wh
                    </ThemedText>
                  ))}
                </ThemedView>
              </>
            ) : (
              <ThemedText style={styles.muted}>
                Select a feasible combination below to display your running plan here.
              </ThemedText>
            )}

            <ThemedText type="defaultSemiBold" style={styles.blockedTitle}>
              Automatic Schedule (priority-based)
            </ThemedText>
            <ThemedText style={styles.muted}>
              Inverter limit: {inverterMaxPowerWValue.toFixed(0)} W · Active load: {optimization.activePowerW.toFixed(0)} W
            </ThemedText>
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

            {optimization.alternatives.length > 0 ? (
              <>
                <ThemedText type="defaultSemiBold" style={styles.blockedTitle}>
                  Swap Suggestions
                </ThemedText>
                <ThemedText style={styles.muted}>
                  Replace currently allowed devices to free inverter or energy capacity:
                </ThemedText>
                {optimization.alternatives.map((option) => (
                  <ThemedView key={option.id} style={styles.alternativeCard}>
                    <ThemedText type="defaultSemiBold">
                      For {option.blockedDevice.name} (
                      {option.constraint === 'inverter_power' ? 'inverter limit' : 'energy limit'})
                    </ThemedText>
                    <ThemedText>{option.summary}</ThemedText>
                    {option.removeDevices.length > 0 ? (
                      <ThemedText style={styles.muted}>
                        Frees {option.removeDevices.reduce((sum, device) => sum + device.power, 0).toFixed(0)} W /{' '}
                        {option.removeDevices.reduce((sum, device) => sum + deviceEnergyWh(device), 0).toFixed(0)} Wh
                      </ThemedText>
                    ) : (
                      <ThemedText style={styles.muted}>
                        Uses remaining headroom ({(inverterMaxPowerWValue - optimization.activePowerW).toFixed(0)} W /{' '}
                        {optimization.remainingEnergyWh.toFixed(0)} Wh available)
                      </ThemedText>
                    )}
                  </ThemedView>
                ))}
              </>
            ) : null}

            {optimization.durationSuggestions.length > 0 ? (
              <>
                <ThemedText type="defaultSemiBold" style={styles.blockedTitle}>
                  Duration Reduction Options
                </ThemedText>
                <ThemedText style={styles.muted}>
                  Shorten runtime to fit within available energy:
                </ThemedText>
                {optimization.durationSuggestions.map((option) => (
                  <ThemedView key={option.id} style={styles.durationCard}>
                    <ThemedText type="defaultSemiBold">{option.device.name}</ThemedText>
                    <ThemedText>{option.summary}</ThemedText>
                    {option.suggestedDurationMinutes > 0 ? (
                      <ThemedText style={styles.muted}>
                        Planned: {option.originalDurationMinutes} min (
                        {energyForDuration(option.device, option.originalDurationMinutes).toFixed(0)} Wh) · Suggested:{' '}
                        {option.suggestedDurationMinutes} min ({option.suggestedEnergyWh.toFixed(0)} Wh)
                      </ThemedText>
                    ) : null}
                  </ThemedView>
                ))}
              </>
            ) : null}
          </ThemedView>

            <ThemedView style={[styles.card, styles.runnableCatalogCard]}>
              <ThemedText type="subtitle">Feasible Combinations (Inverter & Energy)</ThemedText>
              <ThemedText style={styles.muted}>
                Intersection of combinations that satisfy inverter power, battery energy, and required/optional rules.
                Tap a combination to run it.
              </ThemedText>

              {devices.length === 0 ? (
                <ThemedText style={styles.muted}>Add devices to see feasible combinations.</ThemedText>
              ) : runnableCombinationCatalog.noEnergyAvailable ? (
                <ThemedText style={styles.muted}>
                  Configure battery capacity and SOC to calculate feasible combinations.
                </ThemedText>
              ) : runnableCombinationCatalog.tooManyDevices ? (
                <ThemedText style={styles.muted}>
                  Too many devices to list all combinations (max {MAX_INVERTER_ENUM_DEVICES}).
                </ThemedText>
              ) : allRunnableCombinations.length === 0 ? (
                <ThemedText style={styles.muted}>
                  No combination satisfies both inverter and energy limits at the same time.
                </ThemedText>
              ) : (
                <>
                  <ThemedText type="defaultSemiBold" style={styles.inverterSectionTitle}>
                    Required only ({runnableCombinationCatalog.essentialOnly.length})
                  </ThemedText>
                  {runnableCombinationCatalog.essentialOnly.length === 0 ? (
                    <ThemedText style={styles.muted}>No required-only feasible combination.</ThemedText>
                  ) : (
                    <RunnableComboList
                      combos={runnableCombinationCatalog.essentialOnly}
                      selectedId={selectedRunnableCombinationId}
                      inverterMaxPowerW={inverterMaxPowerWValue}
                      availableEnergyWh={availableEnergyWh}
                      showAll={showAllRunnableEssentialOnly}
                      onToggleShowAll={() => setShowAllRunnableEssentialOnly((prev) => !prev)}
                      onSelect={handleSelectRunnableCombination}
                    />
                  )}

                  <ThemedText type="defaultSemiBold" style={styles.inverterSectionTitle}>
                    Optional only ({runnableCombinationCatalog.optionalOnly.length})
                  </ThemedText>
                  {runnableCombinationCatalog.optionalOnly.length === 0 ? (
                    <ThemedText style={styles.muted}>No optional-only feasible combination.</ThemedText>
                  ) : (
                    <RunnableComboList
                      combos={runnableCombinationCatalog.optionalOnly}
                      selectedId={selectedRunnableCombinationId}
                      inverterMaxPowerW={inverterMaxPowerWValue}
                      availableEnergyWh={availableEnergyWh}
                      showAll={showAllRunnableOptionalOnly}
                      onToggleShowAll={() => setShowAllRunnableOptionalOnly((prev) => !prev)}
                      onSelect={handleSelectRunnableCombination}
                    />
                  )}

                  <ThemedText type="defaultSemiBold" style={styles.inverterSectionTitle}>
                    Required + Optional ({runnableCombinationCatalog.essentialWithOptional.length})
                  </ThemedText>
                  {runnableCombinationCatalog.essentialWithOptional.length === 0 ? (
                    <ThemedText style={styles.muted}>No required + optional feasible combination.</ThemedText>
                  ) : (
                    <RunnableComboList
                      combos={runnableCombinationCatalog.essentialWithOptional}
                      selectedId={selectedRunnableCombinationId}
                      inverterMaxPowerW={inverterMaxPowerWValue}
                      availableEnergyWh={availableEnergyWh}
                      showAll={showAllRunnableEssentialOptional}
                      onToggleShowAll={() => setShowAllRunnableEssentialOptional((prev) => !prev)}
                      onSelect={handleSelectRunnableCombination}
                    />
                  )}
                </>
              )}
            </ThemedView>
          </ThemedView>
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
  batteryColumn: {
    flex: 1,
    minWidth: 280,
    gap: 12,
  },
  optimizationColumn: {
    flex: 1,
    minWidth: 280,
    gap: 12,
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
  columnCard: {
    flex: 0,
    flexGrow: 0,
    alignSelf: 'stretch',
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
  alternativeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#b8dcc0',
    borderRadius: 8,
    backgroundColor: '#f7fcf8',
    padding: 10,
    gap: 4,
  },
  durationCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c9d8f5',
    borderRadius: 8,
    backgroundColor: '#f3f8ff',
    padding: 10,
    gap: 4,
  },
  inverterCatalogCard: {
    borderColor: '#d4c4a8',
    backgroundColor: '#fffaf0',
  },
  energyCatalogCard: {
    borderColor: '#9ec5f8',
    backgroundColor: '#f0f6ff',
  },
  runnableCatalogCard: {
    borderColor: '#7fb87f',
    backgroundColor: '#f2faf2',
  },
  runnableComboFrame: {
    borderWidth: 2,
    borderColor: '#9ad3a6',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
  },
  runnableComboFrameSelected: {
    borderColor: '#1f7a34',
    backgroundColor: '#e8f8eb',
  },
  runnableComboText: {
    color: '#1f5c2e',
  },
  selectComboButtonText: {
    color: '#0a7ea4',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  selectedPlanTitle: {
    marginTop: 4,
  },
  selectedPlanCard: {
    borderWidth: 2,
    borderColor: '#1f7a34',
    borderRadius: 10,
    backgroundColor: '#edf9ef',
    padding: 12,
    gap: 6,
  },
  energyComboFrameValid: {
    borderWidth: 2,
    borderColor: '#3d7abf',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  energyComboFrameInvalid: {
    borderWidth: 2,
    borderColor: '#c45c4a',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  energyValidText: {
    color: '#1b4b7a',
  },
  energyInvalidText: {
    color: '#8b3a2a',
  },
  inverterSectionTitle: {
    marginTop: 12,
    marginBottom: 4,
  },
  inverterComboList: {
    gap: 10,
    marginBottom: 4,
  },
  inverterComboFrameValid: {
    borderWidth: 2,
    borderColor: '#3d9a52',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inverterComboFrameInvalid: {
    borderWidth: 2,
    borderColor: '#d07060',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inverterValidText: {
    color: '#1f5c2e',
  },
  inverterInvalidText: {
    color: '#8b3a2a',
  },
  showAllButton: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a7ea4',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  showAllButtonText: {
    color: '#0a7ea4',
    fontSize: 14,
    fontWeight: '600',
  },
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
