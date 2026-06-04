import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
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
import { useAppData } from '@/contexts/AppDataContext';
import { DEFAULT_INVERTER_MAX_POWER_W } from '@/lib/api-config';
import {
  buildFreeRunQuickPickMinutes,
  estimateFreePlanEnergyOutlook,
  formatRunDurationLabel,
  maxRunMinutesFromSustainableHours,
  minutesToHoursInputValue,
  validateFreePlanInverter,
} from '@/lib/free-plan-validation';
import { tickPlanOrchestrator } from '@/lib/plan-orchestrator';
import {
  endFreePlanSession,
  getFreePlanRemainingMs,
  getFreePlanSelectedDeviceIds,
  hydrateFreePlanStore,
  isFreePlanSessionActive,
  setFreePlanSelected,
  startFreePlanSession,
  subscribeFreePlanStore,
} from '@/lib/free-plan-store';
import { getRunningPlanSelection } from '@/lib/feasible-selection-store';

function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export default function FreePlanScreen() {
  const router = useRouter();
  const {
    devices,
    loading,
    inverterMaxPowerWValue,
    availableEnergyWh,
    batteryCapacityWhValue,
    forecastPoints,
    fetchDashboardData,
    isFreePlanActive,
    freePlanRemainingMs,
  } = useAppData();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [runUiRevision, setRunUiRevision] = useState(0);
  const [runHoursInput, setRunHoursInput] = useState('1');
  const [blockMessage, setBlockMessage] = useState<string | null>(null);

  const selectionKey = selectedIds.join('|');

  const inverterMaxW =
    inverterMaxPowerWValue > 0 ? inverterMaxPowerWValue : DEFAULT_INVERTER_MAX_POWER_W;

  useEffect(() => {
    void hydrateFreePlanStore().then(() => {
      setSelectedIds(getFreePlanSelectedDeviceIds());
      setSelectionRevision((v) => v + 1);
    });
    return subscribeFreePlanStore((event) => {
      if (event === 'selection_changed') {
        setSelectionRevision((v) => v + 1);
        return;
      }
      setRunUiRevision((v) => v + 1);
      if (event === 'session_ended') {
        setSelectedIds(getFreePlanSelectedDeviceIds());
        setSelectionRevision((v) => v + 1);
      }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchDashboardData();
      tickPlanOrchestrator();
      setRunUiRevision((v) => v + 1);
    }, [fetchDashboardData]),
  );

  const freePlanRunning = useMemo(() => {
    void runUiRevision;
    return isFreePlanActive || isFreePlanSessionActive();
  }, [isFreePlanActive, runUiRevision]);

  useEffect(() => {
    if (!freePlanRunning) {
      return undefined;
    }
    const id = setInterval(() => setRunUiRevision((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [freePlanRunning]);

  const remainingMs = useMemo(() => {
    void runUiRevision;
    if (!freePlanRunning) {
      return 0;
    }
    return freePlanRemainingMs > 0 ? freePlanRemainingMs : getFreePlanRemainingMs();
  }, [freePlanRunning, freePlanRemainingMs, runUiRevision]);

  const selectedDevices = useMemo(
    () => devices.filter((device) => selectedIds.includes(device.id)),
    [devices, selectionKey],
  );

  const inverterCheck = useMemo(
    () => validateFreePlanInverter(selectedDevices, inverterMaxW),
    [selectedDevices, inverterMaxW],
  );

  const energyOutlook = useMemo(
    () =>
      estimateFreePlanEnergyOutlook({
        devices: selectedDevices,
        initialBatteryWh: availableEnergyWh,
        batteryCapacityWh: batteryCapacityWhValue,
        forecastPoints,
      }),
    [selectedDevices, availableEnergyWh, batteryCapacityWhValue, forecastPoints, selectionKey],
  );

  const maxRunMinutes = useMemo(
    () =>
      energyOutlook ? maxRunMinutesFromSustainableHours(energyOutlook.sustainableHours) : null,
    [energyOutlook],
  );

  const quickPickMinutes = useMemo(
    () => (maxRunMinutes ? buildFreeRunQuickPickMinutes(maxRunMinutes) : []),
    [maxRunMinutes],
  );

  const parsedRunMinutes = useMemo(() => {
    const hours = Number(runHoursInput.replace(',', '.'));
    if (Number.isNaN(hours) || hours <= 0) {
      return null;
    }
    return Math.round(hours * 60);
  }, [runHoursInput]);

  const durationTooLong =
    maxRunMinutes !== null && parsedRunMinutes !== null && parsedRunMinutes > maxRunMinutes;

  const lastAutoSelectionKey = useRef('');
  const sustainableHours = energyOutlook?.sustainableHours ?? null;

  useEffect(() => {
    if (sustainableHours === null || selectedDevices.length === 0) {
      return;
    }
    if (selectionKey === lastAutoSelectionKey.current) {
      return;
    }
    lastAutoSelectionKey.current = selectionKey;
    const cap = maxRunMinutesFromSustainableHours(sustainableHours);
    const defaultMinutes = cap <= 0 ? 30 : Math.min(cap, cap < 60 ? cap : 60);
    setRunHoursInput(minutesToHoursInputValue(defaultMinutes));
    setSelectionRevision((v) => v + 1);
  }, [selectionKey, sustainableHours, selectedDevices.length]);

  useEffect(() => {
    if (maxRunMinutes === null || parsedRunMinutes === null) {
      return;
    }
    if (parsedRunMinutes > maxRunMinutes) {
      setRunHoursInput(minutesToHoursInputValue(maxRunMinutes));
    }
  }, [selectionKey, maxRunMinutes, parsedRunMinutes]);

  const startBlockedReason = useMemo(() => {
    if (selectedDevices.length === 0) {
      return 'Turn on at least one product above.';
    }
    if (!inverterCheck.allowed) {
      return inverterCheck.reason;
    }
    if (!energyOutlook) {
      return 'Set battery capacity in Solar Settings to estimate run time.';
    }
    if (energyOutlook.sustainableHours <= 0) {
      return 'Current energy cannot run this load — remove a product or wait for more charge/solar.';
    }
    if (maxRunMinutes !== null && maxRunMinutes <= 0) {
      return 'Current energy cannot run this load.';
    }
    if (parsedRunMinutes === null) {
      return 'Enter how long to run (hours, e.g. 0.5 or 1).';
    }
    if (durationTooLong && maxRunMinutes !== null) {
      return `Energy supports up to ${formatRunDurationLabel(maxRunMinutes / 60)} — choose a shorter time.`;
    }
    return null;
  }, [
    selectedDevices.length,
    inverterCheck,
    energyOutlook,
    parsedRunMinutes,
    durationTooLong,
    maxRunMinutes,
  ]);

  const refreshAfterPlanChange = useCallback(() => {
    tickPlanOrchestrator();
    setRunUiRevision((v) => v + 1);
    setSelectionRevision((v) => v + 1);
    void fetchDashboardData();
  }, [fetchDashboardData]);

  const onToggleDevice = useCallback(
    (deviceId: string, on: boolean) => {
      if (isFreePlanSessionActive()) {
        endFreePlanSession('user_stop');
        setBlockMessage('Free run stopped because you changed products.');
        refreshAfterPlanChange();
      }
      if (!on) {
        setSelectedIds((prev) => prev.filter((id) => id !== deviceId));
        setFreePlanSelected(deviceId, false);
        setBlockMessage(null);
        setSelectionRevision((v) => v + 1);
        return;
      }
      const device = devices.find((d) => d.id === deviceId);
      if (!device) {
        return;
      }
      const nextDevices = [...selectedDevices, device];
      const check = validateFreePlanInverter(nextDevices, inverterMaxW);
      if (!check.allowed) {
        setBlockMessage(check.reason);
        return;
      }
      setSelectedIds((prev) => (prev.includes(deviceId) ? prev : [...prev, deviceId]));
      setFreePlanSelected(deviceId, true);
      setBlockMessage(null);
      setSelectionRevision((v) => v + 1);
    },
    [devices, selectedDevices, inverterMaxW, refreshAfterPlanChange],
  );

  const onStartRun = () => {
    if (startBlockedReason) {
      Alert.alert('Cannot start', startBlockedReason);
      return;
    }
    if (parsedRunMinutes === null || durationTooLong) {
      Alert.alert('Run time', startBlockedReason ?? 'Invalid run duration.');
      return;
    }

    const ids = [...selectedIds];
    for (const id of ids) {
      setFreePlanSelected(id, true);
    }
    const result = startFreePlanSession(ids, parsedRunMinutes);
    if (!result.ok) {
      Alert.alert('Cannot start', result.reason);
      return;
    }
    setBlockMessage(null);
    setRunUiRevision((v) => v + 1);
    refreshAfterPlanChange();
  };

  const applyQuickDuration = useCallback((minutes: number) => {
    setRunHoursInput(minutesToHoursInputValue(minutes));
    setBlockMessage(null);
    setSelectionRevision((v) => v + 1);
  }, []);

  const stopFreeRunNow = useCallback(() => {
    endFreePlanSession('user_stop');
    setBlockMessage('Free run stopped. Previous plan resumed when applicable.');
    setRunUiRevision((v) => v + 1);
    refreshAfterPlanChange();
  }, [refreshAfterPlanChange]);

  const onStopRun = () => {
    if (Platform.OS === 'web') {
      stopFreeRunNow();
      return;
    }
    Alert.alert('Stop free plan?', 'Previous day/night plan will resume if still in its time window.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: stopFreeRunNow },
    ]);
  };

  return (
    <OnBgScreen variant="solar" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : (
          <>
            <View style={onBgStyles.onBgPanel}>
              <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
                Free plan
              </ThemedText>
              <ThemedText lightColor="#fff" style={comboStyles.muted}>
                Turn devices on under inverter limit only. Set run time — when it ends, devices turn off and your
                previous plan resumes. Day and night plans run automatically in their hours unless a free run is active.
              </ThemedText>
              {freePlanRunning ? (
                <ThemedText type="defaultSemiBold" lightColor="#bbf7d0">
                  Running · {formatRemaining(remainingMs)} left · plan:{' '}
                  {getRunningPlanSelection()?.kind ?? 'free-plan'}
                </ThemedText>
              ) : null}
            </View>

            {blockMessage ? (
              <View style={[onBgStyles.onBgPanel, onBgStyles.onBgAlertPanel]}>
                <ThemedText lightColor="#fecaca">{blockMessage}</ThemedText>
              </View>
            ) : null}

            <View style={onBgStyles.onBgPanel}>
              <ThemedText type="subtitle" lightColor="#fff">
                All products
              </ThemedText>
              <ThemedText lightColor="#fff" style={comboStyles.muted}>
                Use the switches here (not only Devices tab). Selected: {selectedDevices.length}
              </ThemedText>
              {devices.length === 0 ? (
                <ThemedText lightColor="#fff">No devices — add them in Manage Devices.</ThemedText>
              ) : (
                devices.map((device) => (
                  <View key={device.id} style={styles.deviceRow}>
                    <View style={styles.deviceInfo}>
                      <ThemedText lightColor="#fff">{device.name}</ThemedText>
                      <ThemedText lightColor="#fff" style={comboStyles.muted}>
                        {device.power} W · {device.essential ? 'Required' : 'Optional'}
                      </ThemedText>
                    </View>
                    <Switch
                      value={selectedIds.includes(device.id)}
                      onValueChange={(on) => onToggleDevice(device.id, on)}
                    />
                  </View>
                ))
              )}
            </View>

            {!freePlanRunning ? (
              <View style={onBgStyles.onBgPanel} key={`duration-${selectionKey}-${selectionRevision}`}>
                <ThemedText type="subtitle" lightColor="#fff">
                  How long to run
                </ThemedText>
                {energyOutlook && selectedDevices.length > 0 ? (
                  <>
                    <ThemedText type="defaultSemiBold" lightColor="#bbf7d0">
                      Current energy can run {inverterCheck.totalPowerW.toFixed(0)} W for about{' '}
                      {formatRunDurationLabel(energyOutlook.sustainableHours)}
                    </ThemedText>
                    <ThemedText lightColor="#fff" style={comboStyles.muted}>
                      Outlook {energyOutlook.label} (hourly solar + battery) · max you should choose:{' '}
                      {formatRunDurationLabel((maxRunMinutes ?? 0) / 60)}
                    </ThemedText>
                    {quickPickMinutes.length > 0 ? (
                      <View style={styles.quickPickRow}>
                        {quickPickMinutes.map((minutes) => {
                          const selected = parsedRunMinutes === minutes;
                          const isMax = maxRunMinutes !== null && minutes === maxRunMinutes;
                          return (
                            <Pressable
                              key={`pick-${selectionKey}-${minutes}`}
                              style={[
                                styles.quickPickChip,
                                selected && styles.quickPickChipSelected,
                              ]}
                              onPress={() => applyQuickDuration(minutes)}
                            >
                              <Text style={styles.quickPickText}>
                                {isMax
                                  ? `Max (${formatRunDurationLabel(minutes / 60)})`
                                  : formatRunDurationLabel(minutes / 60)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <ThemedText lightColor="#fff" style={comboStyles.muted}>
                    Select products above to see how long your energy can support them.
                  </ThemedText>
                )}
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  Run time in hours (e.g. 0.5 = 30 min, 1 = 1 hour). Must not exceed the max above.
                </ThemedText>
                <TextInput
                  style={onBgStyles.onBgInput}
                  keyboardType="decimal-pad"
                  placeholder={maxRunMinutes ? `max ${minutesToHoursInputValue(maxRunMinutes)} h` : 'e.g. 1'}
                  value={runHoursInput}
                  onChangeText={setRunHoursInput}
                />
                {parsedRunMinutes !== null && maxRunMinutes !== null && !durationTooLong ? (
                  <ThemedText lightColor="#bbf7d0" style={comboStyles.muted}>
                    You chose {formatRunDurationLabel(parsedRunMinutes / 60)} — OK within energy limit
                  </ThemedText>
                ) : null}
                {startBlockedReason ? (
                  <ThemedText lightColor="#fecaca" style={comboStyles.muted}>
                    {startBlockedReason}
                  </ThemedText>
                ) : null}
                <Pressable
                  style={({ pressed }) => [
                    onBgStyles.onBgActionButton,
                    pressed && onBgStyles.buttonPressed,
                    startBlockedReason && styles.buttonMuted,
                  ]}
                  onPress={onStartRun}
                >
                  <Text style={onBgStyles.onBgActionButtonText}>Start free run</Text>
                </Pressable>
              </View>
            ) : (
              <View style={onBgStyles.onBgPanel}>
                <Pressable
                  style={({ pressed }) => [
                    onBgStyles.onBgActionButton,
                    pressed && onBgStyles.buttonPressed,
                    styles.stopButton,
                  ]}
                  onPress={onStopRun}
                >
                  <Text style={onBgStyles.onBgActionButtonText}>Stop free run early</Text>
                </Pressable>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [onBgStyles.onBgActionButton, pressed && onBgStyles.buttonPressed]}
              onPress={() => {
                void fetchDashboardData();
                router.back();
              }}
            >
              <Text style={onBgStyles.onBgActionButtonText}>Back</Text>
            </Pressable>
          </>
        )}
    </OnBgScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32, gap: 12 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  deviceInfo: { flex: 1 },
  buttonMuted: { opacity: 0.85 },
  stopButton: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(185, 28, 28, 0.92)',
  },
  quickPickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  quickPickChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  quickPickChipSelected: {
    borderColor: '#7dd3fc',
    backgroundColor: 'rgba(14, 116, 144, 0.35)',
  },
  quickPickText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
