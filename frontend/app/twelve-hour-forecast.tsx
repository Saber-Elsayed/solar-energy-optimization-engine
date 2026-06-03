import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { TwelveHourRunComboList, comboStyles } from '@/components/combination-catalog-ui';
import { OnBgScreen } from '@/components/on-bg-screen';
import { ThemedText } from '@/components/themed-text';
import { onBgStyles } from '@/styles/on-bg';
import {
  DEFAULT_INVERTER_MAX_POWER_W,
  DEVICES_URL,
  ENERGY_LATEST_URL,
  OPTIMIZE_BEST_URL,
  OPTIMIZE_URL,
  SOLAR_SYSTEM_URL,
} from '@/lib/api-config';
import { filterEnabledDevices, pruneDisabledDeviceIds } from '@/lib/device-enabled-store';
import type { ApiDevice } from '@/lib/device-types';
import {
  getRunningPlanSelection,
  subscribeFeasibleSelection,
} from '@/lib/feasible-selection-store';
import {
  getLastNightDarknessMinutes,
  hydrateNightPlanStore,
  isNightPlanDeviceEnabled,
  isNightPlanModeActive,
  subscribeNightPlanStore,
} from '@/lib/night-plan-store';
import {
  buildDevicesCatalogSignature,
  buildRunnableCombinationCatalog,
  MAX_INVERTER_ENUM_DEVICES,
} from '@/lib/optimization-catalog';
import { buildMock12hForecast, computePlanSustainabilityHours, type ForecastPoint } from '@/lib/plan-sustainability';
import {
  type OrBestCombinationResponse,
  resolveSelectedRunningPlan,
} from '@/lib/running-plan';
import {
  buildHourlySolarForecastRows,
  buildTwelveHourRunForecast,
} from '@/lib/twelve-hour-run-forecast';
import { useEnabledDevices } from '@/lib/use-enabled-devices';

type EnergyDataItem = { soc?: number };

type SolarSystemProfileResponse = {
  battery_capacity_wh: number;
  inverter_max_power_w: number;
};

const POLL_INTERVAL_MS = 5000;

export default function TwelveHourForecastScreen() {
  const params = useLocalSearchParams<{ city?: string }>();
  const targetCity = typeof params.city === 'string' && params.city.trim().length > 0 ? params.city.trim() : 'Tel Aviv';

  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const activeDevices = useEnabledDevices(devices);
  const [loading, setLoading] = useState(true);
  const [batteryCapacityWhValue, setBatteryCapacityWhValue] = useState(0);
  const batteryCapacityWhRef = useRef(0);
  const [inverterMaxPowerWValue, setInverterMaxPowerWValue] = useState(DEFAULT_INVERTER_MAX_POWER_W);
  const [soc, setSoc] = useState<number | null>(null);
  const [forecastPoints, setForecastPoints] = useState<ForecastPoint[]>(() => buildMock12hForecast());
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [runningPlanSelection, setRunningPlanSelection] = useState(() => getRunningPlanSelection());
  const [orBestPlan, setOrBestPlan] = useState<OrBestCombinationResponse | null>(null);
  const [nightPlanUiRevision, setNightPlanUiRevision] = useState(0);

  const [showAllPartial, setShowAllPartial] = useState(false);
  const [showAllRequiredOnly, setShowAllRequiredOnly] = useState(false);
  const [showAllOptionalOnly, setShowAllOptionalOnly] = useState(false);
  const [showAllRequiredOptional, setShowAllRequiredOptional] = useState(false);

  const availableEnergyWh = useMemo(() => {
    if (soc !== null) {
      return batteryCapacityWhValue * (soc / 100);
    }
    return batteryCapacityWhValue;
  }, [batteryCapacityWhValue, soc]);

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

  const twelveHourForecast = useMemo(
    () =>
      buildTwelveHourRunForecast(allRunnableCombinations, {
        initialBatteryWh: availableEnergyWh,
        batteryCapacityWh: batteryCapacityWhValue,
        forecastPoints,
      }),
    [allRunnableCombinations, availableEnergyWh, batteryCapacityWhValue, forecastPoints],
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

  const runningPlanSustainability = useMemo(() => {
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

  const hourlySolarRows = useMemo(() => {
    if (runningPlanSustainability) {
      return runningPlanSustainability.hourlyBreakdown;
    }
    return buildHourlySolarForecastRows(forecastPoints, batteryCapacityWhValue, availableEnergyWh, 0);
  }, [runningPlanSustainability, forecastPoints, batteryCapacityWhValue, availableEnergyWh]);

  const fullHorizonByCategory = useMemo(
    () => ({
      essentialOnly: twelveHourForecast.fullHorizonPlans.filter((plan) => plan.category === 'essential_only'),
      optionalOnly: twelveHourForecast.fullHorizonPlans.filter((plan) => plan.category === 'optional_only'),
      essentialWithOptional: twelveHourForecast.fullHorizonPlans.filter(
        (plan) => plan.category === 'essential_with_optional',
      ),
    }),
    [twelveHourForecast.fullHorizonPlans],
  );

  const forecastSignature = useMemo(
    () =>
      `${buildDevicesCatalogSignature(activeDevices)}|${availableEnergyWh.toFixed(1)}|${batteryCapacityWhValue.toFixed(0)}|${runningPlanSelection?.kind ?? 'none'}|${runningPlanSelection?.kind === 'feasible' ? runningPlanSelection.combinationId : 'or'}|${forecastPoints.map((point) => `${point.hour}:${point.energy}`).join(',')}`,
    [activeDevices, availableEnergyWh, batteryCapacityWhValue, runningPlanSelection, forecastPoints],
  );

  useEffect(() => {
    return subscribeFeasibleSelection(() => {
      setRunningPlanSelection(getRunningPlanSelection());
    });
  }, []);

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
    setShowAllPartial(false);
    setShowAllRequiredOnly(false);
    setShowAllOptionalOnly(false);
    setShowAllRequiredOptional(false);
  }, [forecastSignature]);

  const fetchOrBestCombination = async (deviceList: ApiDevice[]) => {
    if (deviceList.length === 0) {
      setOrBestPlan(null);
      return;
    }
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
        return;
      }
      setOrBestPlan((await res.json()) as OrBestCombinationResponse);
    } catch {
      setOrBestPlan(null);
    }
  };

  const fetchForecastPoints = async (deviceList: ApiDevice[]) => {
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
      const data = (await res.json()) as { forecast_points?: ForecastPoint[] };
      if (Array.isArray(data.forecast_points) && data.forecast_points.length > 0) {
        setForecastPoints(data.forecast_points);
      }
    } catch {
      // Keep the previous or mock forecast.
    }
  };

  const loadDashboardData = async (showSpinner: boolean) => {
    if (showSpinner) {
      setLoading(true);
    }
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

      let latestDevices: ApiDevice[] = [];
      const devicesRes = await fetch(`${DEVICES_URL}?t=${Date.now()}`);
      if (devicesRes.ok) {
        const data = (await devicesRes.json()) as ApiDevice[];
        if (Array.isArray(data)) {
          pruneDisabledDeviceIds(data.map((device) => device.id));
          latestDevices = data;
          setDevices(data);
        }
      }

      const enabledDevices = filterEnabledDevices(latestDevices);
      await fetchForecastPoints(enabledDevices);
      await fetchOrBestCombination(enabledDevices);
      setLastUpdatedAt(new Date());
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadDashboardData(true);
    const intervalId = setInterval(() => {
      void loadDashboardData(false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [targetCity]);

  return (
    <OnBgScreen variant="solar">
      {loading ? (
        <ActivityIndicator size="large" color="#ffffff" />
      ) : (
        <View style={onBgStyles.onBgPanel}>
          <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
            12-Hour Run Forecast
          </ThemedText>
          <ThemedText lightColor="#fff" style={comboStyles.muted}>
              Forward plan from the current hour for {twelveHourForecast.planningHorizonHours} hours. Night hours have
              no solar recharge, so the battery may discharge only.
            </ThemedText>
            <ThemedText lightColor="#fff" style={comboStyles.muted}>
              Available now: {availableEnergyWh.toFixed(1)} Wh · Battery capacity: {batteryCapacityWhValue.toFixed(0)} Wh
              {soc !== null ? ` · SOC ${soc.toFixed(0)}%` : ''}
            </ThemedText>
            {lastUpdatedAt ? (
              <ThemedText lightColor="#fff" style={comboStyles.muted}>
                Updated {lastUpdatedAt.toLocaleTimeString()} · refreshes every {POLL_INTERVAL_MS / 1000}s
              </ThemedText>
            ) : null}

            {batteryCapacityWhValue <= 0 ? (
              <ThemedText lightColor="#fff" style={comboStyles.muted}>
                Configure battery capacity in Solar System Settings to compute the forecast.
              </ThemedText>
            ) : null}

            {activeDevices.length === 0 ? (
              <ThemedText lightColor="#fff" style={comboStyles.muted}>No active devices. Enable products in Devices Overview.</ThemedText>
            ) : null}

            {activeDevices.length > MAX_INVERTER_ENUM_DEVICES ? (
              <ThemedText lightColor="#fff" style={comboStyles.muted}>
                Too many active devices ({activeDevices.length}). Reduce to {MAX_INVERTER_ENUM_DEVICES} or fewer for full
                combination forecast.
              </ThemedText>
            ) : null}

            <ThemedText type="defaultSemiBold" lightColor="#fff" style={comboStyles.sectionTitle}>
              Hourly battery forecast from now ({hourlySolarRows.length} hours)
            </ThemedText>
            {selectedRunningPlan ? (
              <>
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  Running now
                  {selectedRunningPlan.source === 'or-tools'
                    ? ' (OR-Tools)'
                    : selectedRunningPlan.source === 'night-plan'
                      ? ' (Night plan)'
                      : ''}
                  :{' '}
                  {selectedRunningPlan.summary}
                </ThemedText>
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  Continuous load {selectedRunningPlan.totalPowerW.toFixed(0)} W · Starting battery{' '}
                  {availableEnergyWh.toFixed(0)} / {batteryCapacityWhValue.toFixed(0)} Wh
                </ThemedText>
                {runningPlanSustainability ? (
                  <ThemedText lightColor="#fff" style={comboStyles.muted}>
                    This plan can run {runningPlanSustainability.sustainableHours} of{' '}
                    {runningPlanSustainability.planningHorizonHours} forecast hours without draining the battery.
                  </ThemedText>
                ) : null}
              </>
            ) : (
              <ThemedText lightColor="#fff" style={comboStyles.muted}>
                No running plan selected. Select a plan on Feasible Combinations or OR-Tools Best Plan. Showing solar
                recharge only (no device load).
              </ThemedText>
            )}
            {hourlySolarRows.length === 0 ? (
              <ThemedText lightColor="#fff" style={comboStyles.muted}>No forecast points available.</ThemedText>
            ) : (
              hourlySolarRows.map((row) => (
                <ThemedText key={`solar-${row.hour}`} style={comboStyles.muted}>
                  {row.hour} ·{' '}
                  {row.isDay
                    ? `daylight · +${row.solarRechargeWh.toFixed(0)} Wh solar`
                    : 'night · +0 Wh solar · discharge only'}
                  {row.loadWh > 0 ? ` · load −${row.loadWh.toFixed(0)} Wh` : ''} · remaining{' '}
                  {row.remainingBatteryWh.toFixed(0)} / {row.batteryCapacityWh.toFixed(0)} Wh
                </ThemedText>
              ))
            )}

            <ThemedText type="defaultSemiBold" lightColor="#fff" style={comboStyles.sectionTitle}>
              Can run all {twelveHourForecast.planningHorizonHours} hours ({twelveHourForecast.fullHorizonPlans.length})
            </ThemedText>
            {twelveHourForecast.fullHorizonPlans.length === 0 ? (
              <ThemedText lightColor="#fff" style={comboStyles.muted}>
                No active product combination can run the full {twelveHourForecast.planningHorizonHours}-hour horizon with
                current battery and weather forecast.
              </ThemedText>
            ) : (
              <>
                {fullHorizonByCategory.essentialOnly.length > 0 ? (
                  <>
                    <ThemedText type="defaultSemiBold" lightColor="#fff" style={onBgStyles.onBgHeading}>
                      Required only
                    </ThemedText>
                    <TwelveHourRunComboList
                      plans={fullHorizonByCategory.essentialOnly}
                      planningHorizonHours={twelveHourForecast.planningHorizonHours}
                      showAll={showAllRequiredOnly}
                      onToggleShowAll={() => setShowAllRequiredOnly((value) => !value)}
                    />
                  </>
                ) : null}

                {fullHorizonByCategory.optionalOnly.length > 0 ? (
                  <>
                    <ThemedText type="defaultSemiBold" lightColor="#fff" style={onBgStyles.onBgHeading}>
                      Optional only
                    </ThemedText>
                    <TwelveHourRunComboList
                      plans={fullHorizonByCategory.optionalOnly}
                      planningHorizonHours={twelveHourForecast.planningHorizonHours}
                      showAll={showAllOptionalOnly}
                      onToggleShowAll={() => setShowAllOptionalOnly((value) => !value)}
                    />
                  </>
                ) : null}

                {fullHorizonByCategory.essentialWithOptional.length > 0 ? (
                  <>
                    <ThemedText type="defaultSemiBold" lightColor="#fff" style={onBgStyles.onBgHeading}>
                      Required + Optional
                    </ThemedText>
                    <TwelveHourRunComboList
                      plans={fullHorizonByCategory.essentialWithOptional}
                      planningHorizonHours={twelveHourForecast.planningHorizonHours}
                      showAll={showAllRequiredOptional}
                      onToggleShowAll={() => setShowAllRequiredOptional((value) => !value)}
                    />
                  </>
                ) : null}
              </>
            )}

            {twelveHourForecast.partialPlans.length > 0 ? (
              <>
                <ThemedText type="defaultSemiBold" lightColor="#fff" style={comboStyles.sectionTitle}>
                  Partial coverage ({twelveHourForecast.partialPlans.length})
                </ThemedText>
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  These plans fit now but do not cover the full {twelveHourForecast.planningHorizonHours}-hour horizon.
                </ThemedText>
                <TwelveHourRunComboList
                  plans={twelveHourForecast.partialPlans}
                  planningHorizonHours={twelveHourForecast.planningHorizonHours}
                  showAll={showAllPartial}
                  onToggleShowAll={() => setShowAllPartial((value) => !value)}
                />
              </>
            ) : null}
        </View>
      )}
    </OnBgScreen>
  );
}
