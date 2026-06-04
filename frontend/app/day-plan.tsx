import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { OnBgScreen } from '@/components/on-bg-screen';
import { comboStyles } from '@/components/combination-catalog-ui';
import { onBgStyles } from '@/styles/on-bg';
import { ThemedText } from '@/components/themed-text';
import {
  DAY_WINDOW_URL,
  DEFAULT_INVERTER_MAX_POWER_W,
  DEVICES_URL,
  ENERGY_LATEST_URL,
  OPTIMIZE_URL,
  SOLAR_SYSTEM_URL,
} from '@/lib/api-config';
import type { ApiDevice } from '@/lib/device-types';
import {
  hydrateAlwaysOnStore,
  isAlwaysOnMember,
  pruneAlwaysOnDeviceIds,
  setAlwaysOnMember,
  subscribeAlwaysOnStore,
} from '@/lib/always-on-store';
import {
  buildDayPlanToggleBlock,
  formatDay12hLabel,
  validateAddingDeviceToDayPlan,
  validateDayPlanLoad,
  validateDaySuggestionSelection,
  type DayPlanToggleBlock,
} from '@/lib/day-plan-validation';
import {
  getDayBasicTemplateIds,
  hydrateDayPlanEssentialsStore,
  isDayBasicDevice,
  pruneDayBasicDeviceIds,
  setDayBasicDevice,
  setDayBasicTemplateIds,
  subscribeDayPlanEssentialsStore,
} from '@/lib/day-plan-essentials-store';
import {
  buildDayProductSuggestions,
  DAY_BASIC_NECESSITY_OPTIONS,
  daySuggestionToDevicePayload,
  getDayBasicOption,
  isDayBasicNecessityTemplate,
  type DayProductSuggestion,
} from '@/lib/day-plan-suggestions';
import { PLANNING_HORIZON_HOURS } from '@/lib/plan-sustainability';
import {
  enterDayPlanMode,
  exitDayPlanMode,
  hydrateDayPlanStore,
  isDayPlanDeviceEnabled,
  isDayPlanMember,
  isDayPlanModeActive,
  isDaySetupComplete,
  pruneDayPlanDeviceIds,
  setDayPlanDeviceEnabled,
  setDayPlanMember,
  setDaySetupComplete,
  setLastDaylightMinutes,
  subscribeDayPlanStore,
} from '@/lib/day-plan-store';
import {
  getHomeSqm,
  hydrateNightPlanStore,
  setHomeSqm,
  subscribeNightPlanStore,
} from '@/lib/night-plan-store';
import { HomeSqmEditor } from '@/components/home-sqm-editor';
import {
  availableEnergyFromSoc,
  parseControllerSocPercent,
  resolveSocPercent,
} from '@/lib/battery-soc';
import { buildMock12hForecast, type ForecastPoint } from '@/lib/plan-sustainability';

type DayWindow = {
  city?: string;
  sunrise?: string;
  sunset?: string;
  daylight_minutes?: number;
  guidance?: string;
  is_currently_daylight?: boolean;
};

type EnergyDataItem = { soc?: number };

const DAY_FALLBACK_MINUTES = 12 * 60;

async function fetchDevicesList(): Promise<ApiDevice[]> {
  const res = await fetch(`${DEVICES_URL}?t=${Date.now()}`);
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as ApiDevice[];
  return Array.isArray(data) ? data : [];
}

async function ensureDayDeviceOnServer(
  suggestion: DayProductSuggestion,
  existing: ApiDevice[],
  daylightMinutes: number,
): Promise<ApiDevice | null> {
  const payload = daySuggestionToDevicePayload(suggestion, daylightMinutes);
  const match = existing.find(
    (device) => device.name.trim().toLowerCase() === payload.name.trim().toLowerCase(),
  );
  if (match) {
    return match;
  }
  const res = await fetch(DEVICES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return null;
  }
  const saved = (await res.json()) as { success?: boolean; id?: string };
  if (!saved.id) {
    return null;
  }
  return { id: saved.id, ...payload };
}

export default function DayPlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ city?: string }>();
  const targetCity = (typeof params.city === 'string' ? params.city : 'Tel Aviv').trim() || 'Tel Aviv';

  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayWindow, setDayWindow] = useState<DayWindow | null>(null);
  const [forecastPoints, setForecastPoints] = useState<ForecastPoint[]>(() => buildMock12hForecast());
  const [batteryCapacityWhValue, setBatteryCapacityWhValue] = useState(0);
  const batteryCapacityWhRef = useRef(0);
  const [inverterMaxPowerWValue, setInverterMaxPowerWValue] = useState(DEFAULT_INVERTER_MAX_POWER_W);
  const [soc, setSoc] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [homeSqmInput, setHomeSqmInput] = useState('');
  const [selectedBasicTemplateIds, setSelectedBasicTemplateIds] = useState<string[]>(() => [
    'day-basic-fridge',
    'day-basic-freezer',
    'day-basic-router',
  ]);
  const [selectedAdditionalIds, setSelectedAdditionalIds] = useState<string[]>([]);
  const [extrasStepOpen, setExtrasStepOpen] = useState(false);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [modeActionMessage, setModeActionMessage] = useState<string | null>(null);
  const [applyingSuggestions, setApplyingSuggestions] = useState(false);
  const [deviceToggleBlocks, setDeviceToggleBlocks] = useState<Record<string, DayPlanToggleBlock>>({});

  const homeSqm = useMemo(() => getHomeSqm(), [revision]);
  const setupComplete = useMemo(() => isDaySetupComplete(), [revision]);
  const dayPlanModeActive = useMemo(() => isDayPlanModeActive(), [revision]);

  const daylightMinutes = dayWindow?.daylight_minutes ?? DAY_FALLBACK_MINUTES;
  const socPercent = resolveSocPercent(soc);
  const availableEnergyWh = useMemo(
    () => availableEnergyFromSoc(soc, batteryCapacityWhValue),
    [soc, batteryCapacityWhValue, revision],
  );

  const suggestionBundle = useMemo(
    () => (homeSqm ? buildDayProductSuggestions(homeSqm, selectedBasicTemplateIds) : null),
    [homeSqm, selectedBasicTemplateIds, revision],
  );

  const basicDevices = useMemo(
    () => devices.filter((device) => isDayBasicDevice(device.id)),
    [devices, revision],
  );

  const selectedBasicSuggestions = useMemo(
    () =>
      selectedBasicTemplateIds
        .map((id) => getDayBasicOption(id))
        .filter((item): item is NonNullable<typeof item> => item !== undefined),
    [selectedBasicTemplateIds],
  );

  const selectedAdditionalSuggestions = useMemo(
    () =>
      suggestionBundle?.additionalSuggestions.filter((item) =>
        selectedAdditionalIds.includes(item.templateId),
      ) ?? [],
    [suggestionBundle, selectedAdditionalIds],
  );

  const basicsOnlyValidation = useMemo(() => {
    if (selectedBasicSuggestions.length === 0) {
      return null;
    }
    return validateDaySuggestionSelection({
      basicSuggestions: selectedBasicSuggestions,
      additionalSuggestions: [],
      basicDevices: [],
      inverterMaxPowerW: inverterMaxPowerWValue,
      initialBatteryWh: availableEnergyWh,
      batteryCapacityWh: batteryCapacityWhValue,
      forecastPoints,
    });
  }, [
    selectedBasicSuggestions,
    inverterMaxPowerWValue,
    availableEnergyWh,
    batteryCapacityWhValue,
    forecastPoints,
  ]);

  const fullSelectionValidation = useMemo(() => {
    if (selectedBasicSuggestions.length === 0) {
      return null;
    }
    return validateDaySuggestionSelection({
      basicSuggestions: selectedBasicSuggestions,
      additionalSuggestions: selectedAdditionalSuggestions,
      basicDevices: [],
      inverterMaxPowerW: inverterMaxPowerWValue,
      initialBatteryWh: availableEnergyWh,
      batteryCapacityWh: batteryCapacityWhValue,
      forecastPoints,
    });
  }, [
    selectedBasicSuggestions,
    selectedAdditionalSuggestions,
    inverterMaxPowerWValue,
    availableEnergyWh,
    batteryCapacityWhValue,
    forecastPoints,
  ]);

  useEffect(() => {
    if (!homeSqm || setupComplete) {
      return;
    }
    const stored = getDayBasicTemplateIds();
    if (stored.length > 0) {
      setSelectedBasicTemplateIds(stored);
      setExtrasStepOpen(true);
    }
  }, [homeSqm, setupComplete]);

  const dayPlanDevices = useMemo(
    () => devices.filter((device) => isDayPlanMember(device.id)),
    [devices, revision],
  );

  const activeDayDevices = useMemo(
    () => dayPlanDevices.filter((device) => isDayPlanDeviceEnabled(device.id)),
    [dayPlanDevices, revision],
  );

  const optionalActiveDevices = useMemo(
    () => activeDayDevices.filter((device) => !isDayBasicDevice(device.id)),
    [activeDayDevices, revision],
  );

  const activePlanValidation = useMemo(
    () =>
      validateDayPlanLoad({
        activeDevices: optionalActiveDevices,
        basicDevices: basicDevices.length > 0 ? basicDevices : activeDayDevices.filter((d) => isDayBasicDevice(d.id)),
        inverterMaxPowerW: inverterMaxPowerWValue,
        initialBatteryWh: availableEnergyWh,
        batteryCapacityWh: batteryCapacityWhValue,
        forecastPoints,
      }),
    [
      optionalActiveDevices,
      basicDevices,
      activeDayDevices,
      inverterMaxPowerWValue,
      availableEnergyWh,
      batteryCapacityWhValue,
      forecastPoints,
      revision,
    ],
  );

  const reloadDevices = useCallback(async () => {
    const data = await fetchDevicesList();
    pruneDayPlanDeviceIds(data.map((d) => d.id));
    pruneAlwaysOnDeviceIds(data.map((d) => d.id));
    pruneDayBasicDeviceIds(data.map((d) => d.id));
    setDevices(data);
  }, []);

  useEffect(() => {
    void Promise.all([
      hydrateDayPlanStore(),
      hydrateNightPlanStore(),
      hydrateAlwaysOnStore(),
      hydrateDayPlanEssentialsStore(),
    ]).then(() => {
      setRevision((v) => v + 1);
      const sqm = getHomeSqm();
      if (sqm) {
        setHomeSqmInput(String(sqm));
      }
    });
    const unsubDay = subscribeDayPlanStore(() => setRevision((v) => v + 1));
    const unsubNight = subscribeNightPlanStore(() => {
      setRevision((v) => v + 1);
      const sqm = getHomeSqm();
      if (sqm) {
        setHomeSqmInput(String(sqm));
      }
    });
    const unsubAlways = subscribeAlwaysOnStore(() => setRevision((v) => v + 1));
    const unsubEssentials = subscribeDayPlanEssentialsStore(() => setRevision((v) => v + 1));
    return () => {
      unsubDay();
      unsubNight();
      unsubAlways();
      unsubEssentials();
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [solarRes, energyRes, dayRes, optimizeRes] = await Promise.all([
          fetch(SOLAR_SYSTEM_URL),
          fetch(ENERGY_LATEST_URL),
          fetch(`${DAY_WINDOW_URL}?city=${encodeURIComponent(targetCity)}&t=${Date.now()}`),
          fetch(OPTIMIZE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ city: targetCity, devices: [] }),
          }).catch(() => null),
        ]);

        if (solarRes.ok) {
          const solar = (await solarRes.json()) as { battery_capacity_wh?: number; inverter_max_power_w?: number };
          const cap = solar.battery_capacity_wh ?? 0;
          batteryCapacityWhRef.current = cap;
          setBatteryCapacityWhValue(cap);
          setInverterMaxPowerWValue(solar.inverter_max_power_w ?? DEFAULT_INVERTER_MAX_POWER_W);
        }

        if (energyRes.ok) {
          const energy = (await energyRes.json()) as EnergyDataItem;
          setSoc(parseControllerSocPercent(energy.soc));
          setRevision((v) => v + 1);
        }

        if (dayRes.ok) {
          const window = (await dayRes.json()) as DayWindow;
          setDayWindow(window);
          if (window.daylight_minutes) {
            setLastDaylightMinutes(window.daylight_minutes);
          }
        }

        if (optimizeRes?.ok) {
          const optimized = (await optimizeRes.json()) as { forecast_points?: ForecastPoint[] };
          if (Array.isArray(optimized.forecast_points) && optimized.forecast_points.length > 0) {
            setForecastPoints(optimized.forecast_points);
          }
        }

        await reloadDevices();
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [targetCity, reloadDevices]);

  const onSaveHomeSqm = () => {
    const parsed = Number(homeSqmInput.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed <= 0) {
      setBlockMessage('Enter a valid home size in m².');
      return;
    }
    setHomeSqm(parsed);
    setDaySetupComplete(false);
    setRevision((v) => v + 1);
    setBlockMessage(null);
    setModeActionMessage(`Home size saved: ${Math.round(parsed)} m² (stored on this device, shared with Night plan).`);
  };

  const toggleBasicTemplate = (templateId: string) => {
    setSelectedBasicTemplateIds((prev) => {
      if (prev.includes(templateId)) {
        if (prev.length <= 1) {
          setBlockMessage('Keep at least one basic necessity.');
          return prev;
        }
        return prev.filter((id) => id !== templateId);
      }
      return [...prev, templateId];
    });
    setBlockMessage(null);
  };

  const toggleAdditionalTemplate = (suggestion: DayProductSuggestion) => {
    const selected = selectedAdditionalIds.includes(suggestion.templateId);
    if (selected) {
      setSelectedAdditionalIds((prev) => prev.filter((id) => id !== suggestion.templateId));
      setBlockMessage(null);
      return;
    }
    const nextAdditional = [...selectedAdditionalSuggestions, suggestion];
    const check = validateDaySuggestionSelection({
      basicSuggestions: selectedBasicSuggestions,
      additionalSuggestions: nextAdditional,
      basicDevices: [],
      inverterMaxPowerW: inverterMaxPowerWValue,
      initialBatteryWh: availableEnergyWh,
      batteryCapacityWh: batteryCapacityWhValue,
      forecastPoints,
    });
    if (!check.allowed) {
      setBlockMessage(
        check.reason ??
          `Cannot add — need ${formatDay12hLabel(PLANNING_HORIZON_HOURS, PLANNING_HORIZON_HOURS)}.`,
      );
      return;
    }
    setSelectedAdditionalIds((prev) => [...prev, suggestion.templateId]);
    setBlockMessage(null);
  };

  const onApplySuggestions = async () => {
    if (!suggestionBundle) {
      Alert.alert('Day plan', 'Enter home size first (Step 1).');
      return;
    }
    if (selectedBasicSuggestions.length === 0) {
      Alert.alert('Day plan', 'Select at least one basic necessity (Step 2).');
      return;
    }
    if (fullSelectionValidation && !fullSelectionValidation.allowed) {
      Alert.alert('Cannot start', fullSelectionValidation.reason ?? 'Selection must pass 12/12 h.');
      return;
    }

    setDayBasicTemplateIds(selectedBasicTemplateIds);
    setApplyingSuggestions(true);
    setModeActionMessage(null);
    try {
      let list = await fetchDevicesList();
      let addedCount = 0;
      const toApply = [...selectedBasicSuggestions, ...selectedAdditionalSuggestions];
      for (const suggestion of toApply) {
        const device = await ensureDayDeviceOnServer(suggestion, list, daylightMinutes);
        if (!device) {
          setModeActionMessage(`Could not add "${suggestion.name}" — is the backend running?`);
          continue;
        }
        addedCount += 1;
        list = await fetchDevicesList();
        setDayPlanMember(device.id, true);
        setDayPlanDeviceEnabled(device.id, true);
        if (suggestion.isBasicNecessity || isDayBasicNecessityTemplate(suggestion.templateId)) {
          setDayBasicDevice(device.id, true);
          setAlwaysOnMember(device.id, true);
        }
      }
      if (addedCount === 0) {
        setModeActionMessage('No products were added. Check backend connection and try again.');
        return;
      }
      setDaySetupComplete(true);
      setRevision((v) => v + 1);
      const enterResult = enterDayPlanMode();
      if (enterResult.ok) {
        setModeActionMessage(
          `Day plan is active with ${addedCount} product(s). Open Dashboard to see the running plan.`,
        );
        setBlockMessage(null);
      } else {
        setModeActionMessage(
          'Products saved. Turn on at least one device in “Day plan products” below, then tap Activate day plan.',
        );
      }
      await reloadDevices();
    } finally {
      setApplyingSuggestions(false);
    }
  };

  const validateToggle = (device: ApiDevice, currentActive: ApiDevice[]) =>
    validateAddingDeviceToDayPlan({
      device,
      currentActive,
      basicDevices,
      inverterMaxPowerW: inverterMaxPowerWValue,
      initialBatteryWh: availableEnergyWh,
      batteryCapacityWh: batteryCapacityWhValue,
      forecastPoints,
    });

  const onToggleDayMember = (device: ApiDevice, member: boolean) => {
    if (isDayBasicDevice(device.id)) {
      return;
    }
    if (!member) {
      setDayPlanMember(device.id, false);
      return;
    }
    const check = validateToggle(device, optionalActiveDevices.filter((d) => d.id !== device.id));
    const block = buildDayPlanToggleBlock(check);
    if (block) {
      setDeviceToggleBlocks((prev) => ({ ...prev, [device.id]: block }));
      setBlockMessage(block.message);
      return;
    }
    setDayPlanMember(device.id, true);
    setDayPlanDeviceEnabled(device.id, true);
    setDeviceToggleBlocks((prev) => {
      const next = { ...prev };
      delete next[device.id];
      return next;
    });
  };

  const onToggleAlwaysOn = (device: ApiDevice, on: boolean) => {
    if (isDayBasicDevice(device.id)) {
      return;
    }
    setAlwaysOnMember(device.id, on);
    if (on) {
      const check = validateToggle(device, optionalActiveDevices);
      if (!check.allowed) {
        setBlockMessage(check.reason);
        setAlwaysOnMember(device.id, false);
        return;
      }
      setDayPlanMember(device.id, true);
      setDayPlanDeviceEnabled(device.id, true);
    }
    setBlockMessage(null);
  };

  const showWizard = !setupComplete;
  const showSqmStep = showWizard && !homeSqm;

  return (
    <OnBgScreen variant="solar">
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : (
          <>
            <View style={[onBgStyles.onBgPanel, styles.dayPanel]}>
              <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
                Day plan (12h + solar)
              </ThemedText>
              <ThemedText lightColor="#fff" style={comboStyles.muted}>
                Sunrise → sunset · battery recharges from solar · not fixed like night discharge.
              </ThemedText>
              {dayWindow ? (
                <ThemedText type="defaultSemiBold" lightColor="#fff">
                  {dayWindow.city} · {dayWindow.sunrise} → {dayWindow.sunset} ·{' '}
                  {((daylightMinutes || 0) / 60).toFixed(1)} h daylight
                </ThemedText>
              ) : null}
              <ThemedText lightColor="#fff" style={comboStyles.muted}>
                Battery {availableEnergyWh.toFixed(0)} Wh · Inverter {inverterMaxPowerWValue.toFixed(0)} W · Plan{' '}
                {formatDay12hLabel(
                  activePlanValidation.sustainableHours,
                  activePlanValidation.planningHorizonHours,
                )}
                {activePlanValidation.runsFull12h ? ' · OK' : ' · need 12/12'}
              </ThemedText>
            </View>

            {blockMessage ? (
              <View style={[onBgStyles.onBgPanel, onBgStyles.onBgAlertPanel]}>
                <ThemedText lightColor="#fecaca">{blockMessage}</ThemedText>
              </View>
            ) : null}

            {modeActionMessage ? (
              <View style={[onBgStyles.onBgPanel, styles.successPanel]}>
                <ThemedText lightColor="#bbf7d0">{modeActionMessage}</ThemedText>
              </View>
            ) : null}

            {setupComplete ? (
              <HomeSqmEditor
                onUpdated={() => setRevision((v) => v + 1)}
                resetDaySetup
              />
            ) : null}

            {showSqmStep ? (
              <View style={onBgStyles.onBgPanel}>
                <ThemedText type="subtitle" lightColor="#fff">
                  Step 1 — Home size (shared with night plan)
                </ThemedText>
                <TextInput
                  style={onBgStyles.onBgInput}
                  keyboardType="numeric"
                  placeholder="e.g. 85"
                  value={homeSqmInput}
                  onChangeText={setHomeSqmInput}
                />
                <Pressable style={onBgStyles.onBgActionButton} onPress={onSaveHomeSqm}>
                  <Text style={onBgStyles.onBgActionButtonText}>Continue</Text>
                </Pressable>
              </View>
            ) : null}

            {showWizard && homeSqm && suggestionBundle ? (
              <>
                <View style={onBgStyles.onBgPanel}>
                  <ThemedText type="subtitle" lightColor="#fff">
                    Step 2 — Basic necessities (always run)
                  </ThemedText>
                  <ThemedText lightColor="#fff" style={comboStyles.muted}>
                    These run first with highest priority · must pass{' '}
                    {formatDay12hLabel(PLANNING_HORIZON_HOURS, PLANNING_HORIZON_HOURS)} before saving.
                  </ThemedText>
                  {DAY_BASIC_NECESSITY_OPTIONS.map((suggestion) => {
                    const selected = selectedBasicTemplateIds.includes(suggestion.templateId);
                    return (
                      <Pressable
                        key={suggestion.templateId}
                        style={[styles.suggestionRow, selected && styles.suggestionSelected]}
                        onPress={() => toggleBasicTemplate(suggestion.templateId)}
                      >
                        <ThemedText lightColor="#fff">{suggestion.name}</ThemedText>
                        <ThemedText lightColor="#fff" style={comboStyles.muted}>
                          {suggestion.power} W · {suggestion.description}
                          {selected ? ' · Selected' : ''}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                  {basicsOnlyValidation ? (
                    <ThemedText
                      lightColor={basicsOnlyValidation.runsFull12h ? '#bbf7d0' : '#fecaca'}
                      style={comboStyles.muted}
                    >
                      Basics outlook:{' '}
                      {formatDay12hLabel(
                        basicsOnlyValidation.sustainableHours,
                        basicsOnlyValidation.planningHorizonHours,
                      )}
                      {!basicsOnlyValidation.allowed && basicsOnlyValidation.reason
                        ? ` · ${basicsOnlyValidation.reason}`
                        : null}
                    </ThemedText>
                  ) : null}
                  {!extrasStepOpen ? (
                    <Pressable
                      style={({ pressed }) => [
                        onBgStyles.onBgActionButton,
                        pressed && onBgStyles.buttonPressed,
                        (!basicsOnlyValidation?.allowed || selectedBasicTemplateIds.length === 0) &&
                          styles.buttonDisabled,
                      ]}
                      disabled={
                        !basicsOnlyValidation?.allowed || selectedBasicTemplateIds.length === 0
                      }
                      onPress={() => {
                        if (!basicsOnlyValidation?.allowed) {
                          setBlockMessage(basicsOnlyValidation?.reason ?? 'Basics must pass 12/12 h.');
                          return;
                        }
                        setExtrasStepOpen(true);
                        setBlockMessage(null);
                      }}
                    >
                      <Text style={onBgStyles.onBgActionButtonText}>Continue — home-size suggestions</Text>
                    </Pressable>
                  ) : null}
                </View>

                {extrasStepOpen ? (
                  <View style={onBgStyles.onBgPanel}>
                    <ThemedText type="subtitle" lightColor="#fff">
                      Step 3 — More products by home size
                    </ThemedText>
                    <ThemedText lightColor="#fff" style={comboStyles.muted}>
                      Optional · each selection must reach 12/12 h together with your basics.
                    </ThemedText>
                    {suggestionBundle.additionalSuggestions.length === 0 ? (
                      <ThemedText lightColor="#fff" style={comboStyles.muted}>
                        No extra suggestions for this home size — save basics only.
                      </ThemedText>
                    ) : (
                      suggestionBundle.additionalSuggestions.map((suggestion) => {
                        const selected = selectedAdditionalIds.includes(suggestion.templateId);
                        return (
                          <Pressable
                            key={suggestion.templateId}
                            style={[styles.suggestionRow, selected && styles.suggestionSelected]}
                            onPress={() => toggleAdditionalTemplate(suggestion)}
                          >
                            <ThemedText lightColor="#fff">{suggestion.name}</ThemedText>
                            <ThemedText lightColor="#fff" style={comboStyles.muted}>
                              {suggestion.power} W · {suggestion.description}
                              {suggestion.essential ? ' · Recommended' : ''}
                            </ThemedText>
                          </Pressable>
                        );
                      })
                    )}
                    {fullSelectionValidation ? (
                      <ThemedText
                        lightColor={fullSelectionValidation.runsFull12h ? '#bbf7d0' : '#fecaca'}
                        style={comboStyles.muted}
                      >
                        Full plan:{' '}
                        {formatDay12hLabel(
                          fullSelectionValidation.sustainableHours,
                          fullSelectionValidation.planningHorizonHours,
                        )}
                      </ThemedText>
                    ) : null}
                    <Pressable
                      style={({ pressed }) => [
                        onBgStyles.onBgActionButton,
                        pressed && onBgStyles.buttonPressed,
                        (applyingSuggestions ||
                          !fullSelectionValidation?.allowed ||
                          selectedBasicTemplateIds.length === 0) &&
                          styles.buttonDisabled,
                      ]}
                      disabled={
                        applyingSuggestions ||
                        !fullSelectionValidation?.allowed ||
                        selectedBasicTemplateIds.length === 0
                      }
                      onPress={() => void onApplySuggestions()}
                    >
                      {applyingSuggestions ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={onBgStyles.onBgActionButtonText}>Save & start day plan</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null}

            {basicDevices.length > 0 ? (
              <View style={onBgStyles.onBgPanel}>
                <ThemedText type="subtitle" lightColor="#fff">
                  Basic necessities (always on · 12/12)
                </ThemedText>
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  First priority on the running plan · cannot be turned off here.
                </ThemedText>
                {basicDevices.map((device) => (
                  <View key={`basic-${device.id}`} style={styles.deviceRow}>
                    <ThemedText lightColor="#fff">{device.name}</ThemedText>
                    <ThemedText lightColor="#bbf7d0" style={comboStyles.muted}>
                      {device.power} W · Always
                    </ThemedText>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={onBgStyles.onBgPanel}>
              <ThemedText type="subtitle" lightColor="#fff">
                Other always-on (24h)
              </ThemedText>
              {devices.filter((d) => !isDayBasicDevice(d.id)).length === 0 ? (
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  No extra always-on devices.
                </ThemedText>
              ) : (
                devices
                  .filter((device) => !isDayBasicDevice(device.id))
                  .map((device) => (
                    <View key={`always-${device.id}`} style={styles.deviceRow}>
                      <ThemedText lightColor="#fff">{device.name}</ThemedText>
                      <Switch
                        value={isAlwaysOnMember(device.id)}
                        onValueChange={(on) => onToggleAlwaysOn(device, on)}
                      />
                    </View>
                  ))
              )}
            </View>

            {!showWizard ? (
              <View style={onBgStyles.onBgPanel}>
                <ThemedText type="subtitle" lightColor="#fff">
                  Day plan products
                </ThemedText>
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  {dayPlanModeActive ? 'Day plan active on dashboard' : 'Paused'} · extras need 12/12 h
                </ThemedText>
                <View style={styles.modeRow}>
                  {!dayPlanModeActive ? (
                    <Pressable style={onBgStyles.onBgActionButton} onPress={() => enterDayPlanMode()}>
                      <Text style={onBgStyles.onBgActionButtonText}>Activate day plan</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [onBgStyles.onBgActionButton, pressed && onBgStyles.buttonPressed]}
                      onPress={() => exitDayPlanMode()}
                    >
                      <Text style={onBgStyles.onBgActionButtonText}>Exit day plan</Text>
                    </Pressable>
                  )}
                </View>
                {devices.map((device) => {
                  const isBasic = isDayBasicDevice(device.id);
                  if (isBasic) {
                    return null;
                  }
                  const member = isDayPlanMember(device.id);
                  const enabled = isDayPlanDeviceEnabled(device.id);
                  const block = deviceToggleBlocks[device.id];
                  return (
                    <View key={`day-${device.id}`} style={styles.deviceRow}>
                      <View style={styles.deviceInfo}>
                        <ThemedText lightColor="#fff">{device.name}</ThemedText>
                        <ThemedText lightColor="#fff" style={comboStyles.muted}>
                          {device.power} W · must pass 12/12 h
                        </ThemedText>
                        {block ? (
                          <ThemedText lightColor="#fecaca" style={comboStyles.muted}>
                            {block.message}
                          </ThemedText>
                        ) : null}
                      </View>
                      <Switch value={member && enabled} onValueChange={(on) => onToggleDayMember(device, on)} />
                    </View>
                  );
                })}
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [onBgStyles.onBgActionButton, pressed && onBgStyles.buttonPressed]}
              onPress={() => router.back()}
            >
              <Text style={onBgStyles.onBgActionButtonText}>Back</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </OnBgScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32, gap: 12 },
  dayPanel: { borderColor: 'rgba(250, 204, 21, 0.45)' },
  successPanel: { borderColor: 'rgba(74, 222, 128, 0.5)' },
  buttonDisabled: { opacity: 0.55 },
  suggestionRow: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  suggestionSelected: { borderColor: '#7dd3fc', backgroundColor: 'rgba(14, 116, 144, 0.25)' },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  deviceInfo: { flex: 1 },
  modeRow: { marginVertical: 10 },
});
