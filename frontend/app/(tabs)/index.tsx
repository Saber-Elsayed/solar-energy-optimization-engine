import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  CITIES_URL,
  DEFAULT_INVERTER_MAX_POWER_W,
  DEVICES_URL,
  ENERGY_LATEST_URL,
  OPTIMIZE_URL,
  OPTIMIZE_BEST_URL,
  SOLAR_SYSTEM_URL,
} from '@/lib/api-config';
import type { ApiDevice } from '@/lib/device-types';
import { filterEnabledDevices, pruneDisabledDeviceIds, subscribeDeviceEnabled } from '@/lib/device-enabled-store';
import {
  clearRunningPlanSelection,
  getRunningPlanSelection,
  setOrToolsRunningPlan,
  subscribeFeasibleSelection,
} from '@/lib/feasible-selection-store';
import { deviceNightEnergyWh } from '@/lib/night-plan-catalog';
import {
  getLastNightDarknessMinutes,
  getNightRunMinutes,
  hydrateNightPlanStore,
  isNightPlanDeviceEnabled,
  isNightPlanModeActive,
  isNightSetupComplete,
  subscribeNightPlanStore,
} from '@/lib/night-plan-store';
import {
  buildDevicesCatalogSignature,
  buildRunnableCombinationCatalog,
  deviceEnergyWh,
  energyForDuration,
} from '@/lib/optimization-catalog';
import {
  buildMock12hForecast,
  computePlanSustainabilityHours,
  type ForecastPoint,
} from '@/lib/plan-sustainability';
import { buildTwelveHourRunForecast } from '@/lib/twelve-hour-run-forecast';
import { type OrBestCombinationResponse, resolveSelectedRunningPlan } from '@/lib/running-plan';
import { useEnabledDevices } from '@/lib/use-enabled-devices';

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
  const priorityFirstDevices = [...devices].sort((a, b) => {
    if (a.essential !== b.essential) {
      return a.essential ? -1 : 1;
    }
    return b.priority - a.priority;
  });
  const mandatoryDevices = priorityFirstDevices.filter((d) => d.essential);
  const optionalDevices = priorityFirstDevices.filter((d) => !d.essential);
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

  for (const device of optionalDevices) {
    const requiredEnergyWh = device.power * (device.duration / 60);
    totalDeviceEnergyWh += requiredEnergyWh;
    optionalEnergyWh += requiredEnergyWh;
    evaluateDevice(device, 'optional');
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
  const { logout } = useAuth();
  const previousVoltage = useRef<number | null>(null);

  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const activeDevices = useEnabledDevices(devices);
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
  const [forecastPoints, setForecastPoints] = useState<ForecastPoint[]>(() => buildMock12hForecast());
  const [runningPlanSelection, setRunningPlanSelection] = useState(() => getRunningPlanSelection());
  const [orBestPlan, setOrBestPlan] = useState<OrBestCombinationResponse | null>(null);
  const [orBestLoading, setOrBestLoading] = useState(false);
  const [orBestError, setOrBestError] = useState<string | null>(null);
  const [nightPlanUiRevision, setNightPlanUiRevision] = useState(0);

  const nightPlanCardHint = useMemo(() => {
    if (!isNightSetupComplete()) {
      return 'Set up home size and essential products · discharge only until sunrise';
    }
    if (isNightPlanModeActive()) {
      return 'Night plan active · Tap to manage or exit to normal mode';
    }
    return 'Normal mode · Tap to enter night plan';
  }, [nightPlanUiRevision]);

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
    () => optimizeDevices(activeDevices, availableEnergyWh, inverterMaxPowerWValue),
    [activeDevices, availableEnergyWh, inverterMaxPowerWValue],
  );
  const runnableCombinationCatalog = useMemo(
    () => buildRunnableCombinationCatalog(activeDevices, inverterMaxPowerWValue, availableEnergyWh),
    [activeDevices, inverterMaxPowerWValue, availableEnergyWh],
  );
  const allRunnableCombinations = useMemo(
    () => [
      ...runnableCombinationCatalog.essentialOnly,
      ...runnableCombinationCatalog.optionalOnly,
      ...runnableCombinationCatalog.essentialWithOptional,
    ],
    [runnableCombinationCatalog],
  );
  const nightDarknessMinutes = getLastNightDarknessMinutes();
  const activeNightPlanDevices = useMemo(() => {
    void nightPlanUiRevision;
    if (!isNightPlanModeActive()) {
      return [];
    }
    return devices.filter((device) => isNightPlanDeviceEnabled(device.id));
  }, [devices, nightPlanUiRevision]);
  const selectedRunningPlan = useMemo(
    () =>
      resolveSelectedRunningPlan({
        selection: runningPlanSelection,
        allRunnableCombinations,
        orBestPlan,
        activeDevices,
        nightPlanDevices: activeNightPlanDevices,
        nightDarknessMinutes,
      }),
    [
      runningPlanSelection,
      allRunnableCombinations,
      orBestPlan,
      activeDevices,
      activeNightPlanDevices,
      nightDarknessMinutes,
      nightPlanUiRevision,
    ],
  );

  const selectedPlanSustainability = useMemo(() => {
    if (!selectedRunningPlan || batteryCapacityWhValue <= 0) {
      return null;
    }
    return computePlanSustainabilityHours({
      totalPowerW: selectedRunningPlan.totalPowerW,
      initialBatteryWh: availableEnergyWh,
      batteryCapacityWh: batteryCapacityWhValue,
      forecastPoints,
    });
  }, [selectedRunningPlan, batteryCapacityWhValue, availableEnergyWh, forecastPoints]);

  const twelveHourRunForecast = useMemo(
    () =>
      buildTwelveHourRunForecast(allRunnableCombinations, {
        initialBatteryWh: availableEnergyWh,
        batteryCapacityWh: batteryCapacityWhValue,
        forecastPoints,
      }),
    [allRunnableCombinations, availableEnergyWh, batteryCapacityWhValue, forecastPoints],
  );

  const isOrPlanSelected = runningPlanSelection?.kind === 'or-tools';

  useFocusEffect(
    useCallback(() => {
      setRunningPlanSelection(getRunningPlanSelection());
    }, []),
  );

  useEffect(() => {
    void hydrateNightPlanStore().then(() => {
      setRunningPlanSelection(getRunningPlanSelection());
    });
    return subscribeNightPlanStore(() => {
      setNightPlanUiRevision((value) => value + 1);
      setRunningPlanSelection(getRunningPlanSelection());
    });
  }, []);

  useEffect(() => {
    return subscribeFeasibleSelection(() => {
      setRunningPlanSelection(getRunningPlanSelection());
    });
  }, []);

  useEffect(() => {
    if (runningPlanSelection?.kind !== 'feasible') {
      return;
    }
    const stillExists = allRunnableCombinations.some(
      (combo) => combo.id === runningPlanSelection.combinationId,
    );
    if (!stillExists) {
      clearRunningPlanSelection();
      setRunningPlanSelection(null);
    }
  }, [allRunnableCombinations, runningPlanSelection]);

  useEffect(() => {
    if (runningPlanSelection?.kind !== 'or-tools') {
      return;
    }
    const orPlanValid =
      orBestPlan &&
      orBestPlan.can_run.length > 0 &&
      (orBestPlan.solver_status === 'OPTIMAL' || orBestPlan.solver_status === 'FEASIBLE');
    if (!orPlanValid) {
      clearRunningPlanSelection();
      setRunningPlanSelection(null);
    }
  }, [runningPlanSelection, orBestPlan]);

  const fetchOrBestCombination = async (deviceList: ApiDevice[], targetCity: string) => {
    if (deviceList.length === 0) {
      setOrBestPlan(null);
      setOrBestError(null);
      return;
    }
    setOrBestLoading(true);
    setOrBestError(null);
    try {
      const payload = {
        city: targetCity,
        devices: deviceList.map(({ name, power, duration, priority, essential, start_time, end_time }) => ({
          name,
          power,
          duration,
          priority,
          essential,
          start_time: start_time ?? '00:00',
          end_time: end_time ?? '23:59',
        })),
      };
      const res = await fetch(OPTIMIZE_BEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setOrBestPlan(null);
        setOrBestError(`OR request failed (${res.status}). Restart the backend after installing ortools.`);
        return;
      }
      const data = (await res.json()) as OrBestCombinationResponse;
      setOrBestPlan(data);
    } catch {
      setOrBestPlan(null);
      setOrBestError('Could not reach OR-Tools endpoint. Check that the backend is running.');
    } finally {
      setOrBestLoading(false);
    }
  };

  const evaluateAlerts = (latestSoc: number | undefined, latestAvailableEnergyWh: number, deviceList: ApiDevice[]) => {
    const dynamicAlerts: string[] = [];
    const socValue = typeof latestSoc === 'number' ? latestSoc : null;
    const nextHourUsageWh = deviceList.reduce((sum, d) => sum + d.power * (d.duration / 60), 0);

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

      let latestDevices: ApiDevice[] = [];
      const [devicesRes, energyRes] = await Promise.all([
        fetch(`${DEVICES_URL}?t=${Date.now()}`),
        fetch(`${ENERGY_LATEST_URL}?t=${Date.now()}`),
      ]);
      if (devicesRes.ok) {
        const devicesData = (await devicesRes.json()) as ApiDevice[];
        if (Array.isArray(devicesData)) {
          latestDevices = devicesData;
          pruneDisabledDeviceIds(devicesData.map((device) => device.id));
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
        evaluateAlerts(latest?.soc, latestAvailableEnergyWh, filterEnabledDevices(latestDevices));
      }

      const enabledDevices = filterEnabledDevices(latestDevices);
      void fetchOrBestCombination(enabledDevices, city.trim() || 'Tel Aviv');
      void fetchForecastPoints(enabledDevices, city.trim() || 'Tel Aviv');
    } finally {
      setLoading(false);
    }
  };

  const fetchForecastPoints = async (deviceList: ApiDevice[], targetCity: string) => {
    try {
      const payload = {
        city: targetCity,
        devices: deviceList.map(({ name, power, duration, priority, essential, start_time, end_time }) => ({
          name,
          power,
          duration,
          priority,
          essential,
          start_time: start_time ?? '00:00',
          end_time: end_time ?? '23:59',
        })),
      };
      const res = await fetch(OPTIMIZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as {
        weather?: OptimizeWeather;
        forecast_points?: ForecastPoint[];
      };
      if (data.weather) {
        setWeather(data.weather);
      }
      if (Array.isArray(data.forecast_points) && data.forecast_points.length > 0) {
        setForecastPoints(data.forecast_points);
      }
    } catch {
      // Keep the mock forecast when the backend is unavailable.
    }
  };

  const fetchWeather = async (targetCity: string) => {
    setWeatherLoading(true);
    try {
      await fetchForecastPoints(activeDevices, targetCity);
    } finally {
      setWeatherLoading(false);
    }
  };

  const onSelectOrBestPlan = () => {
    if (
      !orBestPlan ||
      orBestPlan.can_run.length === 0 ||
      (orBestPlan.solver_status !== 'OPTIMAL' && orBestPlan.solver_status !== 'FEASIBLE')
    ) {
      return;
    }
    setOrToolsRunningPlan();
    setRunningPlanSelection({ kind: 'or-tools' });
  };

  useEffect(() => {
    return subscribeDeviceEnabled(() => {
      const enabledDevices = filterEnabledDevices(devices);
      void fetchOrBestCombination(enabledDevices, city.trim() || 'Tel Aviv');
      void fetchForecastPoints(enabledDevices, city.trim() || 'Tel Aviv');
    });
  }, [devices, city]);

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

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/login');
    } catch {
      // Route guard redirects to login when auth state clears.
    }
  };

  return (
    <SafeAreaView style={styles.safeForeground} edges={['top', 'bottom']}>
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
          <Pressable style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]} onPress={() => void handleLogout()}>
            <Text style={styles.logoutButtonText}>Logout</Text>
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

            <Pressable
              style={({ pressed }) => [styles.card, styles.infoBlue, styles.columnCard, pressed && styles.buttonPressed]}
              onPress={() => router.push('/feasible-combinations')}>
              <ThemedText type="subtitle">Feasible Combinations (Inverter & Energy)</ThemedText>
              <ThemedText style={styles.muted}>Tap to browse and select a running plan</ThemedText>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.card, styles.nightCard, styles.columnCard, pressed && styles.buttonPressed]}
              onPress={() =>
                router.push({
                  pathname: '/night-plan',
                  params: { city: city.trim() || 'Tel Aviv' },
                })
              }>
              <ThemedText type="subtitle">Night Discharge Plan</ThemedText>
              <ThemedText style={styles.muted}>{nightPlanCardHint}</ThemedText>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.card, styles.infoBlue, styles.columnCard, pressed && styles.buttonPressed]}
              onPress={() =>
                router.push({
                  pathname: '/twelve-hour-forecast',
                  params: { city: city.trim() || 'Tel Aviv' },
                })
              }>
              <ThemedText type="subtitle">12-Hour Run Forecast</ThemedText>
              <ThemedText style={styles.muted}>
                {batteryCapacityWhValue <= 0
                  ? 'Configure battery capacity to forecast 12-hour runs'
                  : twelveHourRunForecast.fullHorizonPlans.length > 0
                    ? `${twelveHourRunForecast.fullHorizonPlans.length} plan(s) can run ${twelveHourRunForecast.planningHorizonHours}h without draining · ${availableEnergyWh.toFixed(0)} Wh now`
                    : `No full ${twelveHourRunForecast.planningHorizonHours}h plans with current battery & weather · ${availableEnergyWh.toFixed(0)} Wh now`}
              </ThemedText>
            </Pressable>
          </ThemedView>

          <ThemedView style={styles.optimizationColumn}>
            <ThemedView style={[styles.card, styles.safeGreen]}>
            <ThemedText type="subtitle">Optimization Results</ThemedText>

            <ThemedText type="defaultSemiBold" style={styles.orBestTitle}>
              OR-Tools Best Plan (recommended)
            </ThemedText>
            {orBestLoading ? (
              <ActivityIndicator size="small" color="#0a7ea4" />
            ) : orBestError ? (
              <ThemedText style={styles.muted}>{orBestError}</ThemedText>
            ) : orBestPlan?.solver_status === 'UNAVAILABLE' ? (
              <ThemedText style={styles.muted}>
                OR-Tools is not installed on the server. Run: pip install ortools
              </ThemedText>
            ) : orBestPlan && orBestPlan.can_run.length > 0 ? (
              <ThemedView
                style={[styles.orBestPlanCard, isOrPlanSelected && styles.orBestPlanCardSelected]}>
                <ThemedText style={styles.muted}>
                  Status: {orBestPlan.solver_status} · Score: {orBestPlan.objective_score} · Load{' '}
                  {orBestPlan.total_power_w.toFixed(0)} W · Energy {orBestPlan.total_energy_wh.toFixed(0)} Wh ·
                  Headroom {orBestPlan.remaining_energy_wh.toFixed(0)} Wh
                </ThemedText>
                {orBestPlan.can_run.map((device) => (
                  <ThemedText key={`or-best-${device.name}-${device.power}`}>
                    - {device.name} ({device.essential ? 'Required' : 'Optional'}) · {device.power} W ·{' '}
                    {device.duration} min · {(device.power * (device.duration / 60)).toFixed(0)} Wh
                  </ThemedText>
                ))}
                <Pressable onPress={onSelectOrBestPlan} style={styles.selectPlanButton}>
                  <ThemedText style={styles.selectPlanButtonText}>
                    {isOrPlanSelected ? 'Running this OR-Tools plan' : 'Select & run this plan'}
                  </ThemedText>
                </Pressable>
              </ThemedView>
            ) : orBestPlan?.solver_status === 'INFEASIBLE' ? (
              <ThemedText style={styles.muted}>
                No combination satisfies inverter and energy limits right now.
              </ThemedText>
            ) : orBestPlan && (orBestPlan.solver_status === 'OPTIMAL' || orBestPlan.solver_status === 'FEASIBLE') ? (
              <ThemedText style={styles.muted}>
                OR found no devices to run under current inverter and energy limits.
              </ThemedText>
            ) : activeDevices.length === 0 ? (
              <ThemedText style={styles.muted}>
                {devices.length === 0
                  ? 'Add devices to compute the OR-Tools best plan.'
                  : 'All devices are turned off. Enable products in Devices Overview.'}
              </ThemedText>
            ) : (
              <ThemedText style={styles.muted}>Waiting for OR-Tools recommendation…</ThemedText>
            )}

            {selectedRunningPlan ? (
              <>
                <ThemedText type="defaultSemiBold" style={styles.selectedPlanTitle}>
                  Selected Running Plan
                  {selectedRunningPlan.source === 'or-tools'
                    ? ' (OR-Tools)'
                    : selectedRunningPlan.source === 'night-plan'
                      ? ' (Night plan)'
                      : ''}
                </ThemedText>
                <ThemedView style={styles.selectedPlanCard}>
                  <ThemedText>{selectedRunningPlan.summary}</ThemedText>
                  <ThemedText style={styles.muted}>
                    Total load {selectedRunningPlan.totalPowerW.toFixed(0)} W · Total energy{' '}
                    {selectedRunningPlan.totalEnergyWh.toFixed(0)} Wh
                  </ThemedText>
                  {selectedPlanSustainability ? (
                    <ThemedView style={styles.sustainabilityCard}>
                      <ThemedText type="defaultSemiBold">12-hour forward plan</ThemedText>
                      <ThemedText>
                        Sustainable for {selectedPlanSustainability.sustainableHours} of{' '}
                        {selectedPlanSustainability.planningHorizonHours} hours without draining the battery.
                      </ThemedText>
                      {selectedPlanSustainability.sustainableHours > 0 &&
                      selectedPlanSustainability.lastSustainableHour ? (
                        <ThemedText style={styles.muted}>
                          Covers continuous load through {selectedPlanSustainability.lastSustainableHour}
                          {selectedPlanSustainability.limitingHour
                            ? ` · Limit reached at ${selectedPlanSustainability.limitingHour}`
                            : ' · Full 12-hour horizon covered'}
                        </ThemedText>
                      ) : (
                        <ThemedText style={styles.muted}>
                          Current battery + forecast solar cannot cover this load for even one hour.
                          {selectedPlanSustainability.limitingHour
                            ? ` Limit at ${selectedPlanSustainability.limitingHour}.`
                            : ''}
                        </ThemedText>
                      )}
                      <ThemedText style={styles.muted}>
                        Projected battery after horizon: {selectedPlanSustainability.finalBatteryWh.toFixed(0)} Wh
                      </ThemedText>
                      {selectedPlanSustainability.hourlyBreakdown.map((row) => (
                        <ThemedText key={`plan-hour-${row.hour}`} style={styles.muted}>
                          {row.hour} · {row.isDay ? `+${row.solarRechargeWh.toFixed(0)} Wh solar` : 'night · +0 Wh solar'}{' '}
                          · load −{row.loadWh.toFixed(0)} Wh · remaining {row.remainingBatteryWh.toFixed(0)} /{' '}
                          {row.batteryCapacityWh.toFixed(0)} Wh
                        </ThemedText>
                      ))}
                    </ThemedView>
                  ) : null}
                  {selectedRunningPlan.devices.map((device) => {
                    const energyWh =
                      selectedRunningPlan.source === 'night-plan'
                        ? deviceNightEnergyWh(
                            device.power,
                            getNightRunMinutes(device.id, nightDarknessMinutes),
                          )
                        : deviceEnergyWh(device);
                    return (
                      <ThemedText key={`selected-${device.id}`}>
                        - {device.name} ({device.essential ? 'Required' : 'Optional'}) · {device.power} W ·{' '}
                        {device.duration} min · {energyWh.toFixed(0)} Wh
                      </ThemedText>
                    );
                  })}
                </ThemedView>
              </>
            ) : (
              <ThemedText style={styles.muted}>
                {isNightPlanModeActive()
                  ? 'Turn on products in Night Discharge Plan, or select a plan on Feasible Combinations / OR-Tools.'
                  : 'Select a plan on Feasible Combinations, choose the OR-Tools best plan, or enter Night Discharge Plan.'}
              </ThemedText>
            )}

            <ThemedText type="defaultSemiBold" style={styles.blockedTitle}>
              Automatic Schedule (priority-based)
            </ThemedText>
            <ThemedText style={styles.muted}>
              Inverter limit: {inverterMaxPowerWValue.toFixed(0)} W · Active load: {optimization.activePowerW.toFixed(0)} W
            </ThemedText>

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
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeForeground: {
    flex: 1,
    backgroundColor: '#fff',
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
    backgroundColor: 'rgba(248, 251, 255, 0.94)',
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
    backgroundColor: 'rgba(248, 251, 255, 0.94)',
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
    backgroundColor: 'rgba(238, 245, 255, 0.94)',
  },
  nightCard: {
    borderColor: '#8a9ab8',
    backgroundColor: 'rgba(238, 241, 247, 0.94)',
  },
  safeGreen: {
    borderColor: '#9ad3a6',
    backgroundColor: 'rgba(237, 249, 239, 0.94)',
  },
  infoNeutral: {
    borderColor: '#d7deea',
    backgroundColor: 'rgba(248, 251, 255, 0.94)',
  },
  alertBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d54d38',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 233, 229, 0.96)',
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
  logoutButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c45c4a',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  logoutButtonText: {
    color: '#b1321f',
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
  orBestTitle: {
    marginTop: 4,
  },
  orBestPlanCard: {
    borderWidth: 2,
    borderColor: '#1f5c9e',
    borderRadius: 10,
    backgroundColor: '#eef5ff',
    padding: 12,
    gap: 6,
  },
  orBestPlanCardSelected: {
    borderColor: '#1f7a34',
    backgroundColor: '#edf9ef',
  },
  selectPlanButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  selectPlanButtonText: {
    color: '#0a7ea4',
    fontSize: 13,
    fontWeight: '700',
  },
  selectedPlanCard: {
    borderWidth: 2,
    borderColor: '#1f7a34',
    borderRadius: 10,
    backgroundColor: '#edf9ef',
    padding: 12,
    gap: 6,
  },
  sustainabilityCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#7fb87f',
    borderRadius: 8,
    backgroundColor: '#f7fcf8',
    padding: 10,
    gap: 4,
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
