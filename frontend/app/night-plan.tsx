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
import { ThemedView } from '@/components/themed-view';
import {
  DEFAULT_INVERTER_MAX_POWER_W,
  DEVICES_URL,
  ENERGY_LATEST_URL,
  NIGHT_WINDOW_URL,
  SOLAR_SYSTEM_URL,
} from '@/lib/api-config';
import type { ApiDevice } from '@/lib/device-types';
import { assessNightDevice, type NightWindow } from '@/lib/night-plan-catalog';
import {
  buildNightProductSuggestions,
  suggestionToDevicePayload,
  type NightProductSuggestion,
} from '@/lib/night-plan-suggestions';
import {
  getHomeSqm,
  clearNightRunMinutes,
  getNightDurationOverrides,
  getNightPlanMemberIds,
  getNightRunMinutes,
  enterNightPlanMode,
  exitNightPlanMode,
  hydrateNightPlanStore,
  isNightPlanDeviceEnabled,
  isNightPlanMember,
  isNightPlanModeActive,
  isNightSetupComplete,
  pruneNightPlanDeviceIds,
  resetNightPlanHomeProfile,
  setHomeSqm,
  setNightPlanDeviceEnabled,
  setNightPlanMember,
  setNightRunMinutes,
  setNightSetupComplete,
  setLastNightDarknessMinutes,
  subscribeNightPlanStore,
} from '@/lib/night-plan-store';
import {
  buildNightPlanToggleBlock,
  formatNightRuntimeLabel,
  type NightLimitedRunSuggestion,
  type NightPlanToggleBlock,
  validateAddingDeviceToNightPlan,
  validateNightPlanLoad,
  validateSuggestionSelection,
} from '@/lib/night-plan-validation';
type EnergyDataItem = { soc?: number };

type SolarSystemProfileResponse = {
  battery_capacity_wh: number;
  inverter_max_power_w: number;
};

const NIGHT_FALLBACK_MINUTES = 12 * 60;

async function fetchDevicesList(): Promise<ApiDevice[]> {
  const res = await fetch(`${DEVICES_URL}?t=${Date.now()}`);
  if (!res.ok) {
    return [];
  }
  const data = (await res.json()) as ApiDevice[];
  return Array.isArray(data) ? data : [];
}

async function ensureDeviceOnServer(
  suggestion: NightProductSuggestion,
  existing: ApiDevice[],
  darknessMinutes: number,
): Promise<ApiDevice | null> {
  const payload = suggestionToDevicePayload(suggestion, darknessMinutes);
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
  const saved = (await res.json()) as { id?: string };
  if (!saved.id) {
    return null;
  }
  return { id: saved.id, ...payload };
}

export default function NightPlanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ city?: string }>();
  const targetCity = (typeof params.city === 'string' ? params.city : 'Tel Aviv').trim() || 'Tel Aviv';

  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [nightWindow, setNightWindow] = useState<NightWindow | null>(null);
  const [nightWindowError, setNightWindowError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [batteryCapacityWhValue, setBatteryCapacityWhValue] = useState(0);
  const batteryCapacityWhRef = useRef(0);
  const [inverterMaxPowerWValue, setInverterMaxPowerWValue] = useState(DEFAULT_INVERTER_MAX_POWER_W);
  const [soc, setSoc] = useState<number | null>(null);
  const [nightPlanRevision, setNightPlanRevision] = useState(0);

  const [homeSqmInput, setHomeSqmInput] = useState('');
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [applyingSuggestions, setApplyingSuggestions] = useState(false);
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [deviceToggleBlocks, setDeviceToggleBlocks] = useState<Record<string, NightPlanToggleBlock>>({});
  const [storeHydrated, setStoreHydrated] = useState(false);
  const [modeActionMessage, setModeActionMessage] = useState<string | null>(null);

  const homeSqm = useMemo(() => getHomeSqm(), [nightPlanRevision]);
  const setupComplete = useMemo(() => isNightSetupComplete(), [nightPlanRevision]);
  const nightPlanModeActive = useMemo(() => isNightPlanModeActive(), [nightPlanRevision]);

  const availableEnergyWh = useMemo(() => {
    if (soc !== null) {
      return batteryCapacityWhValue * (soc / 100);
    }
    return batteryCapacityWhValue;
  }, [batteryCapacityWhValue, soc]);

  const darknessMinutes = nightWindow?.darkness_minutes ?? (nightWindowError ? NIGHT_FALLBACK_MINUTES : 0);
  const darknessHoursLabel = darknessMinutes > 0 ? (darknessMinutes / 60).toFixed(1) : '—';

  const durationOverrides = useMemo(
    () => ({ ...getNightDurationOverrides() }),
    [nightPlanRevision],
  );

  const suggestionBundle = useMemo(() => {
    if (!homeSqm) {
      return null;
    }
    return buildNightProductSuggestions(homeSqm);
  }, [homeSqm, nightPlanRevision]);

  const selectedSuggestions = useMemo(() => {
    if (!suggestionBundle) {
      return [];
    }
    return suggestionBundle.suggestions.filter((item) => selectedSuggestionIds.includes(item.templateId));
  }, [suggestionBundle, selectedSuggestionIds]);

  const suggestionValidation = useMemo(() => {
    if (darknessMinutes <= 0 || selectedSuggestions.length === 0) {
      return null;
    }
    return validateSuggestionSelection({
      selected: selectedSuggestions,
      darknessMinutes,
      inverterMaxPowerW: inverterMaxPowerWValue,
      availableEnergyWh,
    });
  }, [selectedSuggestions, darknessMinutes, inverterMaxPowerWValue, availableEnergyWh]);

  const nightPlanDevices = useMemo(
    () => devices.filter((device) => isNightPlanMember(device.id)),
    [devices, nightPlanRevision],
  );

  const activeNightDevices = useMemo(
    () => nightPlanDevices.filter((device) => isNightPlanDeviceEnabled(device.id)),
    [nightPlanDevices, nightPlanRevision],
  );

  const activePlanValidation = useMemo(() => {
    if (darknessMinutes <= 0) {
      return null;
    }
    return validateNightPlanLoad({
      activeDevices: activeNightDevices,
      darknessMinutes,
      inverterMaxPowerW: inverterMaxPowerWValue,
      availableEnergyWh,
      durationOverrides,
    });
  }, [activeNightDevices, darknessMinutes, inverterMaxPowerWValue, availableEnergyWh, durationOverrides]);

  const deviceAssessments = useMemo(
    () =>
      activeNightDevices.map((device) =>
        assessNightDevice({
          device,
          darknessMinutes,
          inverterMaxPowerW: inverterMaxPowerWValue,
          availableEnergyWh,
          runMinutes: getNightRunMinutes(device.id, darknessMinutes || NIGHT_FALLBACK_MINUTES),
        }),
      ),
    [activeNightDevices, darknessMinutes, inverterMaxPowerWValue, availableEnergyWh, nightPlanRevision],
  );

  const reloadDevices = useCallback(async () => {
    const data = await fetchDevicesList();
    pruneNightPlanDeviceIds(data.map((device) => device.id));
    setDevices(data);
  }, []);

  useEffect(() => {
    void hydrateNightPlanStore().finally(() => {
      setStoreHydrated(true);
      setNightPlanRevision((value) => value + 1);
      const sqm = getHomeSqm();
      if (sqm) {
        setHomeSqmInput(String(sqm));
      }
    });
    return subscribeNightPlanStore(() => {
      setNightPlanRevision((value) => value + 1);
      const sqm = getHomeSqm();
      if (sqm) {
        setHomeSqmInput(String(sqm));
      }
    });
  }, []);

  const handleEnterNightPlan = () => {
    setModeActionMessage(null);
    const result = enterNightPlanMode();
    setNightPlanRevision((value) => value + 1);
    setDeviceToggleBlocks({});
    if (!result.ok) {
      if (result.reason === 'no-members') {
        setModeActionMessage(
          'No night products are saved. Turn on “In night plan” for a device below, or tap “Re-run essential product suggestions”.',
        );
      } else {
        setModeActionMessage('Complete setup first: choose home size and essential products.');
      }
      return;
    }
    const count = getNightPlanMemberIds().length;
    setModeActionMessage(
      `Night plan is active. ${count} product(s) are on and running on the dashboard.`,
    );
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setNightWindowError(null);
      setLoadError(null);
      try {
        let capacityWh = batteryCapacityWhRef.current;
        let inverterMaxPowerW = DEFAULT_INVERTER_MAX_POWER_W;

        const solarRes = await fetch(`${SOLAR_SYSTEM_URL}?t=${Date.now()}`);
        if (solarRes.ok) {
          const solar = (await solarRes.json()) as SolarSystemProfileResponse;
          capacityWh = solar.battery_capacity_wh ?? 0;
          inverterMaxPowerW = solar.inverter_max_power_w ?? DEFAULT_INVERTER_MAX_POWER_W;
          batteryCapacityWhRef.current = capacityWh;
          setBatteryCapacityWhValue(capacityWh);
          setInverterMaxPowerWValue(inverterMaxPowerW);
        }

        const energyRes = await fetch(`${ENERGY_LATEST_URL}?t=${Date.now()}`);
        if (energyRes.ok) {
          const energy = (await energyRes.json()) as EnergyDataItem;
          if (typeof energy.soc === 'number') {
            setSoc(energy.soc);
          }
        }

        await reloadDevices();

        try {
          const nightRes = await fetch(
            `${NIGHT_WINDOW_URL}?city=${encodeURIComponent(targetCity)}&t=${Date.now()}`,
          );
          if (!nightRes.ok) {
            setNightWindow(null);
            setNightWindowError(`Could not load darkness window (${nightRes.status}). Using 12h estimate.`);
          } else {
            setNightWindow((await nightRes.json()) as NightWindow);
          }
        } catch {
          setNightWindow(null);
          setNightWindowError(
            'Could not reach weather service. Check that the backend is running, then reload this screen.',
          );
        }
      } catch {
        setLoadError('Could not load night plan data. Make sure the backend is running on port 8000.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [targetCity, reloadDevices]);

  useEffect(() => {
    if (!suggestionBundle || setupComplete) {
      return;
    }
    setSelectedSuggestionIds(suggestionBundle.suggestions.map((item) => item.templateId));
  }, [suggestionBundle, setupComplete]);

  useEffect(() => {
    const minutes = nightWindow?.darkness_minutes ?? (nightWindowError ? NIGHT_FALLBACK_MINUTES : 0);
    if (minutes > 0) {
      setLastNightDarknessMinutes(minutes);
    }
  }, [nightWindow, nightWindowError]);

  const onSaveHomeSqm = () => {
    const parsed = Number(homeSqmInput.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 20 || parsed > 400) {
      Alert.alert('Home size', 'Enter a floor area between 20 and 400 m².');
      return;
    }
    setHomeSqm(parsed);
    setBlockMessage(null);
  };

  const toggleSuggestion = (templateId: string) => {
    setSelectedSuggestionIds((prev) => {
      const bundle = homeSqm ? buildNightProductSuggestions(homeSqm) : null;
      if (!bundle) {
        return prev;
      }
      const isOn = prev.includes(templateId);
      const nextIds = isOn ? prev.filter((id) => id !== templateId) : [...prev, templateId];
      const nextSelected = bundle.suggestions.filter((item) => nextIds.includes(item.templateId));
      if (darknessMinutes > 0 && nextSelected.length > 0) {
        const check = validateSuggestionSelection({
          selected: nextSelected,
          darknessMinutes,
          inverterMaxPowerW: inverterMaxPowerWValue,
          availableEnergyWh,
        });
        if (!check.allowed) {
          setBlockMessage(check.reason);
          return prev;
        }
      }
      setBlockMessage(null);
      return nextIds;
    });
  };

  const onApplySuggestions = async () => {
    if (!suggestionBundle || selectedSuggestions.length === 0) {
      Alert.alert('Suggestions', 'Select at least one essential product.');
      return;
    }
    if (suggestionValidation && !suggestionValidation.allowed) {
      Alert.alert('Battery limit', suggestionValidation.reason ?? 'Selection exceeds available energy.');
      return;
    }

    setApplyingSuggestions(true);
    setModeActionMessage(null);
    try {
      let list = await fetchDevicesList();
      let addedCount = 0;
      for (const suggestion of selectedSuggestions) {
        const created = await ensureDeviceOnServer(suggestion, list, darknessMinutes || NIGHT_FALLBACK_MINUTES);
        if (!created) {
          setModeActionMessage(`Could not add "${suggestion.name}" — is the backend running on port 8000?`);
          continue;
        }
        addedCount += 1;
        list = await fetchDevicesList();
        setNightPlanMember(created.id, true);
        setNightPlanDeviceEnabled(created.id, true);
      }
      if (addedCount === 0) {
        setModeActionMessage('No products were added. Check the backend connection and try again.');
        return;
      }
      setNightSetupComplete(true);
      const enterResult = enterNightPlanMode();
      setNightPlanRevision((value) => value + 1);
      if (enterResult.ok) {
        setModeActionMessage('Night plan is active with your selected products.');
      } else {
        setModeActionMessage('Products were saved, but night plan could not start. Turn on at least one device below.');
      }
      setBlockMessage(null);
      await reloadDevices();
    } finally {
      setApplyingSuggestions(false);
    }
  };

  const setDeviceToggleBlock = (deviceId: string, block: NightPlanToggleBlock | null) => {
    setDeviceToggleBlocks((prev) => {
      if (!block) {
        if (!(deviceId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[deviceId];
        return next;
      }
      return { ...prev, [deviceId]: block };
    });
  };

  const validateNightToggle = (device: ApiDevice, currentActive: ApiDevice[]) =>
    validateAddingDeviceToNightPlan({
      device,
      currentActive,
      darknessMinutes: darknessMinutes || NIGHT_FALLBACK_MINUTES,
      inverterMaxPowerW: inverterMaxPowerWValue,
      availableEnergyWh,
      durationOverrides,
    });

  const onAcceptLimitedRun = (device: ApiDevice, limited: NightLimitedRunSuggestion) => {
    const currentActive = activeNightDevices.filter((item) => item.id !== device.id);
    const check = validateAddingDeviceToNightPlan({
      device,
      currentActive,
      darknessMinutes: darknessMinutes || NIGHT_FALLBACK_MINUTES,
      inverterMaxPowerW: inverterMaxPowerWValue,
      availableEnergyWh,
      durationOverrides,
      runMinutesForDevice: limited.maxMinutes,
    });
    if (!check.allowed) {
      const block = buildNightPlanToggleBlock(check);
      if (block) {
        setDeviceToggleBlock(device.id, block);
        setBlockMessage(block.message);
      }
      return;
    }

    setNightRunMinutes(device.id, limited.maxMinutes);
    setNightPlanMember(device.id, true);
    setNightPlanDeviceEnabled(device.id, true);
    setDeviceToggleBlock(device.id, null);
    setBlockMessage(null);
  };

  const onToggleNightMember = (device: ApiDevice, member: boolean) => {
    if (!member) {
      setNightPlanMember(device.id, false);
      setDeviceToggleBlock(device.id, null);
      return;
    }

    const currentActive = activeNightDevices.filter((item) => item.id !== device.id);
    const check = validateNightToggle(device, currentActive);
    if (!check.allowed) {
      const block = buildNightPlanToggleBlock(check);
      if (block) {
        setDeviceToggleBlock(device.id, block);
        setBlockMessage(block.message);
      }
      return;
    }

    clearNightRunMinutes(device.id);
    setNightPlanMember(device.id, true);
    setNightPlanDeviceEnabled(device.id, true);
    setDeviceToggleBlock(device.id, null);
    setBlockMessage(null);
  };

  const onToggleNightEnabled = (device: ApiDevice, enabled: boolean) => {
    if (!enabled) {
      setNightPlanDeviceEnabled(device.id, false);
      setDeviceToggleBlock(device.id, null);
      return;
    }

    const currentActive = activeNightDevices.filter((item) => item.id !== device.id);
    const check = validateNightToggle(device, currentActive);
    if (!check.allowed) {
      const block = buildNightPlanToggleBlock(check);
      if (block) {
        setDeviceToggleBlock(device.id, block);
        setBlockMessage(block.message);
      }
      return;
    }

    clearNightRunMinutes(device.id);
    setNightPlanDeviceEnabled(device.id, true);
    setDeviceToggleBlock(device.id, null);
    setBlockMessage(null);
  };

  const showWizard = !setupComplete;
  const showSqmStep = showWizard && !homeSqm;
  const showSuggestionsStep = showWizard && homeSqm && suggestionBundle;

  return (
    <OnBgScreen>
      {loading ? (
        <ActivityIndicator size="large" color="#ffffff" />
      ) : loadError ? (
        <View style={onBgStyles.onBgPanel}>
          <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
            Night discharge plan
          </ThemedText>
          <ThemedText lightColor="#fecaca" style={onBgStyles.onBgErrorText}>
            {loadError}
          </ThemedText>
        </View>
      ) : (
        <>
          <View style={[onBgStyles.onBgPanel, onBgStyles.onBgPanelNight]}>
            <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
              Night discharge plan
            </ThemedText>
            <ThemedText lightColor="#fff" style={comboStyles.muted}>
                Discharge only until sunrise — no solar charging at night.
              </ThemedText>
              {nightWindow ? (
                <>
                  <ThemedText type="defaultSemiBold" lightColor="#fff" style={onBgStyles.onBgHighlight}>
                    {nightWindow.city} · {nightWindow.is_currently_dark ? 'Tonight' : 'Upcoming night'}:{' '}
                    {nightWindow.sunset} → {nightWindow.sunrise}
                  </ThemedText>
                  <ThemedText lightColor="#fff" style={comboStyles.muted}>
                    Darkness {darknessHoursLabel} h · Battery {availableEnergyWh.toFixed(0)} Wh · Inverter{' '}
                    {inverterMaxPowerWValue.toFixed(0)} W
                  </ThemedText>
                </>
              ) : (
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  {nightWindowError ?? 'Darkness window loading…'}
                </ThemedText>
              )}
          </View>

          {blockMessage ? (
            <View style={[onBgStyles.onBgPanel, onBgStyles.onBgAlertPanel]}>
              <ThemedText lightColor="#fecaca" style={onBgStyles.onBgErrorText}>
                {blockMessage}
              </ThemedText>
            </View>
          ) : null}

            {showSqmStep ? (
              <View style={onBgStyles.onBgPanel}>
                <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
                  Step 1 — Home size
                </ThemedText>
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  Enter floor area (m²) so we can estimate indoor/outdoor lights and suggest minimal essential
                  products for the night.
                </ThemedText>
                <TextInput
                  style={onBgStyles.onBgInput}
                  keyboardType="numeric"
                  placeholder="e.g. 85"
                  value={homeSqmInput}
                  onChangeText={setHomeSqmInput}
                />
                <Pressable
                  style={({ pressed }) => [onBgStyles.onBgActionButton, pressed && onBgStyles.buttonPressed]}
                  onPress={onSaveHomeSqm}>
                  <Text style={onBgStyles.onBgActionButtonText}>Continue</Text>
                </Pressable>
              </View>
            ) : null}

            {showSuggestionsStep ? (
              <View style={onBgStyles.onBgPanel}>
                <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
                  Step 2 — Essential products (minimal load)
                </ThemedText>
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  ~{suggestionBundle.lighting.roomCount} rooms · {suggestionBundle.lighting.indoorLightPoints} indoor
                  lights · {suggestionBundle.lighting.outdoorLightPoints} outdoor · home {homeSqm} m²
                </ThemedText>
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  Powers are low averages so the battery is less likely to empty before sunrise. Select what you want,
                  then start the plan.
                </ThemedText>

                {suggestionBundle.suggestions.map((suggestion) => {
                  const selected = selectedSuggestionIds.includes(suggestion.templateId);
                  return (
                    <Pressable
                      key={suggestion.templateId}
                      style={({ pressed }) => [
                        styles.suggestionRow,
                        selected && styles.suggestionRowSelected,
                        pressed && styles.buttonPressed,
                      ]}
                      onPress={() => toggleSuggestion(suggestion.templateId)}>
                      <View style={styles.suggestionText}>
                        <ThemedText type="defaultSemiBold">
                          {selected ? '☑ ' : '☐ '}
                          {suggestion.name}
                        </ThemedText>
                        <ThemedText lightColor="#fff" style={comboStyles.muted}>
                          {suggestion.power} W · Required · {suggestion.description}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}

                {suggestionValidation ? (
                  <ThemedText
                    style={suggestionValidation.allowed ? styles.okText : styles.warnText}>
                    Selected overnight: {suggestionValidation.totalEnergyWh.toFixed(0)} Wh of{' '}
                    {availableEnergyWh.toFixed(0)} Wh
                    {suggestionValidation.allowed
                      ? ` · headroom ${suggestionValidation.headroomWh.toFixed(0)} Wh`
                      : ''}
                  </ThemedText>
                ) : null}

                <Pressable
                  style={({ pressed }) => [
                    onBgStyles.onBgActionButton,
                    (pressed || applyingSuggestions) && onBgStyles.buttonPressed,
                    suggestionValidation && !suggestionValidation.allowed ? styles.buttonDisabled : null,
                  ]}
                  disabled={applyingSuggestions || (suggestionValidation !== null && !suggestionValidation.allowed)}
                  onPress={() => void onApplySuggestions()}>
                  {applyingSuggestions ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={onBgStyles.onBgActionButtonText}>Enter night plan with selection</Text>
                  )}
                </Pressable>

                <Pressable onPress={() => resetNightPlanHomeProfile()}>
                  <ThemedText lightColor="#fff" style={comboStyles.muted}>Change home size (m²)</ThemedText>
                </Pressable>
              </View>
            ) : null}

            {setupComplete ? (
              <>
                <View style={onBgStyles.onBgPanel}>
                  <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
                    {nightPlanModeActive ? 'Night plan is active' : 'Normal mode (night plan paused)'}
                  </ThemedText>
                  <ThemedText lightColor="#fff" style={comboStyles.muted}>
                    {nightPlanModeActive
                      ? 'All night-plan products are on and running. Exit turns them off and removes them from the dashboard running plan.'
                      : 'Entering turns on every product in your night plan and starts the running plan on the dashboard.'}
                  </ThemedText>
                  {!nightPlanModeActive ? (
                    <ThemedView style={styles.savedProductsBox}>
                      <ThemedText type="defaultSemiBold">Products in your night plan</ThemedText>
                      {nightPlanDevices.length === 0 ? (
                        <ThemedText lightColor="#fff" style={comboStyles.muted}>
                          None yet — add devices below or re-run essential product suggestions.
                        </ThemedText>
                      ) : (
                        nightPlanDevices.map((device) => (
                          <ThemedText key={`saved-${device.id}`} style={comboStyles.muted}>
                            · {device.name} · {device.power} W
                            {device.essential ? ' · Required' : ' · Optional'}
                          </ThemedText>
                        ))
                      )}
                    </ThemedView>
                  ) : null}
                  {modeActionMessage ? (
                    <ThemedView style={styles.modeFeedbackBanner}>
                      <ThemedText style={styles.modeFeedbackText}>{modeActionMessage}</ThemedText>
                    </ThemedView>
                  ) : null}
                  {nightPlanModeActive ? (
                    <Pressable
                      style={({ pressed }) => [onBgStyles.onBgOutlineButton, pressed && onBgStyles.buttonPressed]}
                      onPress={() => {
                        exitNightPlanMode();
                        setNightPlanRevision((value) => value + 1);
                        setDeviceToggleBlocks({});
                        setModeActionMessage(
                          'Night plan stopped. All night products were turned off and removed from the running plan.',
                        );
                        router.back();
                      }}>
                      <Text style={onBgStyles.onBgOutlineButtonText}>Exit night plan · return to normal</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [
                        onBgStyles.onBgActionButton,
                        (!storeHydrated || pressed) && onBgStyles.buttonPressed,
                        !storeHydrated ? styles.buttonDisabled : null,
                      ]}
                      disabled={!storeHydrated}
                      onPress={handleEnterNightPlan}>
                      <Text style={onBgStyles.onBgActionButtonText}>
                        {storeHydrated ? 'Enter night plan' : 'Loading saved plan…'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <View style={onBgStyles.onBgPanel}>
                  <ThemedText type="defaultSemiBold" lightColor="#fff" style={onBgStyles.onBgHeading}>
                    Active night load
                  </ThemedText>
                  {activePlanValidation ? (
                    <ThemedText style={activePlanValidation.allowed ? styles.okText : styles.warnText}>
                      {activePlanValidation.totalPowerW.toFixed(0)} W ·{' '}
                      {activePlanValidation.totalEnergyWh.toFixed(0)} Wh for {darknessHoursLabel} h
                      {activePlanValidation.allowed
                        ? ` · ${activePlanValidation.headroomWh.toFixed(0)} Wh headroom`
                        : ` · ${activePlanValidation.reason}`}
                    </ThemedText>
                  ) : null}
                  {homeSqm ? (
                    <ThemedText lightColor="#fff" style={comboStyles.muted}>Home profile: {homeSqm} m²</ThemedText>
                  ) : null}
                </View>

                <Pressable
                  style={({ pressed }) => [onBgStyles.onBgOutlineButton, pressed && onBgStyles.buttonPressed]}
                  onPress={() => router.push('/manage-devices')}>
                  <Text style={onBgStyles.onBgOutlineButtonText}>Add more electrical devices</Text>
                </Pressable>

                <View style={onBgStyles.onBgPanel}>
                  <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
                    Your night products
                  </ThemedText>
                  <ThemedText lightColor="#fff" style={comboStyles.muted}>
                    {nightPlanModeActive
                      ? 'Add devices from the list below. We block additions that could drain the battery before sunrise.'
                      : 'Editing is available while paused. Turn on night plan above to apply these rules to the dashboard.'}
                  </ThemedText>

                  {devices.length === 0 ? (
                    <ThemedText lightColor="#fff" style={comboStyles.muted}>No devices in catalog yet.</ThemedText>
                  ) : (
                    devices.map((device) => {
                      const member = isNightPlanMember(device.id);
                      const enabled = isNightPlanDeviceEnabled(device.id);
                      const toggleBlock = deviceToggleBlocks[device.id];
                      const runMinutes = getNightRunMinutes(device.id, darknessMinutes || NIGHT_FALLBACK_MINUTES);
                      const isLimitedRun =
                        enabled && darknessMinutes > 0 && runMinutes < (darknessMinutes || NIGHT_FALLBACK_MINUTES);
                      const assessment =
                        member && enabled && darknessMinutes > 0
                          ? assessNightDevice({
                              device,
                              darknessMinutes,
                              inverterMaxPowerW: inverterMaxPowerWValue,
                              availableEnergyWh,
                              runMinutes,
                            })
                          : null;

                      return (
                        <ThemedView key={device.id} style={styles.deviceRow}>
                          <View style={styles.deviceRowHeader}>
                            <ThemedText type="defaultSemiBold">{device.name}</ThemedText>
                            <ThemedText lightColor="#fff" style={comboStyles.muted}>
                              {device.power} W · {device.essential ? 'Required' : 'Optional'}
                            </ThemedText>
                          </View>

                          <View style={styles.switchRow}>
                            <ThemedText>In night plan</ThemedText>
                            <Switch
                              key={`member-${device.id}-${member}-${nightPlanRevision}`}
                              value={member}
                              onValueChange={(value) => onToggleNightMember(device, value)}
                            />
                          </View>

                          {member ? (
                            <View style={styles.switchRow}>
                              <ThemedText>Active tonight</ThemedText>
                              <Switch
                                key={`enabled-${device.id}-${enabled}-${nightPlanRevision}`}
                                value={enabled}
                                onValueChange={(value) => onToggleNightEnabled(device, value)}
                              />
                            </View>
                          ) : null}

                          {toggleBlock ? (
                            <ThemedView
                              style={[
                                styles.deviceBlockBanner,
                                toggleBlock.failureKind === 'inverter' && styles.deviceBlockBannerInverter,
                              ]}>
                              <ThemedText type="defaultSemiBold" style={styles.warnText}>
                                {toggleBlock.title}
                              </ThemedText>
                              <ThemedText style={styles.warnText}>{toggleBlock.message}</ThemedText>
                              {toggleBlock.failureKind === 'inverter' ? (
                                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                                  Shorter run time does not reduce inverter load. Lower simultaneous power (W)
                                  instead.
                                </ThemedText>
                              ) : null}
                              {toggleBlock.limitedRun?.available ? (
                                <>
                                  <ThemedText style={styles.offerText}>{toggleBlock.limitedRun.message}</ThemedText>
                                  <Pressable
                                    style={({ pressed }) => [
                                      styles.limitedRunButton,
                                      pressed && styles.buttonPressed,
                                    ]}
                                    onPress={() => onAcceptLimitedRun(device, toggleBlock.limitedRun!)}>
                                    <Text style={styles.limitedRunButtonText}>
                                      Run for {toggleBlock.limitedRun.label} tonight
                                    </Text>
                                  </Pressable>
                                </>
                              ) : null}
                            </ThemedView>
                          ) : null}

                          {isLimitedRun ? (
                            <ThemedText style={styles.offerText}>
                              Limited tonight: {formatNightRuntimeLabel(runMinutes)} (saves battery for other
                              products until morning).
                            </ThemedText>
                          ) : null}

                          {assessment ? (
                            <ThemedText style={assessment.canRunAllNight ? styles.okText : styles.warnText}>
                              {assessment.canRunAllNight
                                ? isLimitedRun
                                  ? `OK for limited run (${assessment.nightEnergyWh.toFixed(0)} Wh).`
                                  : `OK all night (${assessment.nightEnergyWh.toFixed(0)} Wh).`
                                : assessment.blockedReason}
                            </ThemedText>
                          ) : null}
                        </ThemedView>
                      );
                    })
                  )}
                </View>

                <View style={onBgStyles.onBgPanel}>
                  <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
                    Can run all night
                  </ThemedText>
                  {nightPlanDevices.length === 0 ? (
                    <ThemedText lightColor="#fff" style={comboStyles.muted}>No products in the night plan yet.</ThemedText>
                  ) : activeNightDevices.length === 0 ? (
                    <ThemedText lightColor="#fff" style={comboStyles.muted}>Activate at least one product.</ThemedText>
                  ) : batteryCapacityWhValue <= 0 ? (
                    <ThemedText lightColor="#fff" style={comboStyles.muted}>Configure battery in Solar System Settings.</ThemedText>
                  ) : (
                    <>
                      <ThemedText type="defaultSemiBold" lightColor="#fff" style={comboStyles.sectionTitle}>
                        Active products ({deviceAssessments.filter((item) => item.canRunAllNight).length} of{' '}
                        {deviceAssessments.length} OK for full night)
                      </ThemedText>
                      {deviceAssessments.map((item) => (
                        <ThemedText key={item.device.id} style={item.canRunAllNight ? styles.okText : styles.warnText}>
                          {item.canRunAllNight ? '✓' : '✗'} {item.device.name} — {item.nightEnergyWh.toFixed(0)} Wh
                        </ThemedText>
                      ))}
                    </>
                  )}
                </View>

                <Pressable
                  onPress={() => {
                    setNightSetupComplete(false);
                    if (homeSqm) {
                      setSelectedSuggestionIds(
                        buildNightProductSuggestions(homeSqm).suggestions.map((item) => item.templateId),
                      );
                    }
                  }}>
                  <ThemedText lightColor="#fff" style={comboStyles.muted}>Re-run essential product suggestions</ThemedText>
                </Pressable>
              </>
            ) : null}
          </>
        )}
    </OnBgScreen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 28, gap: 14 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  nightBanner: { borderColor: '#5a6a8a', backgroundColor: '#eef2f8' },
  wizardCard: { borderColor: '#6a7ca0', backgroundColor: '#f8f9fc' },
  summaryCard: { borderColor: '#8a9ab8', backgroundColor: '#f0f4fa' },
  modeActiveCard: { borderColor: '#3d7a9e', backgroundColor: '#e8f4fa' },
  modeNormalCard: { borderColor: '#9aa8b8', backgroundColor: '#f4f5f7' },
  modeFeedbackBanner: {
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#e8f4fa',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3d7a9e',
  },
  modeFeedbackText: { color: '#1a4a66', fontSize: 14, lineHeight: 20 },
  savedProductsBox: {
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  blockCard: { borderColor: '#c45c5c', backgroundColor: '#fff5f5' },
  devicesCard: { borderColor: '#7a8ab0', backgroundColor: '#f5f7fc' },
  resultsCard: { borderColor: '#7fb87f', backgroundColor: '#f2faf2' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#9aa8c0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  primaryButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#0a7ea4',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: { color: '#0a7ea4', fontWeight: '600', fontSize: 16 },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.85 },
  suggestionRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c5ccd8',
    borderRadius: 8,
    padding: 10,
  },
  suggestionRowSelected: {
    borderColor: '#0a7ea4',
    backgroundColor: '#eef7fb',
  },
  suggestionText: { gap: 4 },
  deviceRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#c5ccd8',
    paddingTop: 10,
    marginTop: 6,
    gap: 6,
  },
  deviceRowHeader: { gap: 2 },
  deviceBlockBanner: {
    borderWidth: 1,
    borderColor: '#c45c5c',
    backgroundColor: '#fff5f5',
    borderRadius: 8,
    padding: 10,
    gap: 4,
    marginTop: 4,
  },
  deviceBlockBannerInverter: {
    borderColor: '#a86a20',
    backgroundColor: '#fff8ef',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  okText: { color: '#1f7a1f' },
  warnText: { color: '#a33b3b' },
  offerText: { color: '#1a5c7a' },
  limitedRunButton: {
    marginTop: 6,
    backgroundColor: '#1a7a4a',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  limitedRunButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
