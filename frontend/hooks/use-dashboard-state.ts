import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CITIES_URL,
  DAY_WINDOW_URL,
  DEFAULT_INVERTER_MAX_POWER_W,
  DEVICES_URL,
  ENERGY_LATEST_URL,
  NIGHT_WINDOW_URL,
  OPTIMIZE_BEST_URL,
  OPTIMIZE_URL,
  SOLAR_SYSTEM_URL,
} from "@/lib/api-config";
import type { ApiDevice } from "@/lib/device-types";
import {
  filterEnabledDevices,
  pruneDisabledDeviceIds,
  subscribeDeviceEnabled,
} from "@/lib/device-enabled-store";
import {
  clearRunningPlanSelection,
  getFeasibleSelection,
  getRunningPlanSelection,
  setFeasibleSelection,
  setOrToolsRunningPlan,
  subscribeFeasibleSelection,
} from "@/lib/feasible-selection-store";
import {
  getLastDaylightMinutes,
  hydrateDayPlanStore,
  isDayPlanDeviceEnabled,
  isDayPlanModeActive,
  isDaySetupComplete,
  subscribeDayPlanStore,
} from "@/lib/day-plan-store";
import {
  getLastNightDarknessMinutes,
  hydrateNightPlanStore,
  isNightPlanDeviceEnabled,
  isNightPlanModeActive,
  isNightSetupComplete,
  subscribeNightPlanStore,
} from "@/lib/night-plan-store";
import { hydrateAlwaysOnStore } from "@/lib/always-on-store";
import {
  hydrateDayPlanEssentialsStore,
  isDayBasicDevice,
} from "@/lib/day-plan-essentials-store";
import {
  buildDevicesCatalogSignature,
  buildRunnableCombinationCatalog,
} from "@/lib/optimization-catalog";
import { optimizeDevices } from "@/lib/priority-optimization";
import {
  buildMock12hForecast,
  computePlanSustainabilityHours,
  type ForecastPoint,
} from "@/lib/plan-sustainability";
import {
  type OrBestCombinationResponse,
  resolveSelectedRunningPlan,
} from "@/lib/running-plan";
import { buildTwelveHourRunForecast } from "@/lib/twelve-hour-run-forecast";
import { logUserActivity } from "@/lib/activity-log";
import {
  availableEnergyFromSoc,
  hasControllerSocReport,
  parseControllerSocPercent,
  resolveSocPercent,
} from "@/lib/battery-soc";
import {
  computeTwelveHourOutlook,
  type TwelveHourOutlook,
} from "@/lib/twelve-hour-outlook";
import {
  getFreePlanRemainingMs,
  getFreePlanSessionDeviceIds,
  hydrateFreePlanStore,
  isFreePlanSessionActive,
  subscribeFreePlanStore,
} from "@/lib/free-plan-store";
import { tickPlanOrchestrator } from "@/lib/plan-orchestrator";
import {
  setCachedDayWindow,
  setCachedNightWindow,
  type CachedDayWindow,
  type CachedNightWindow,
} from "@/lib/plan-window-store";
import { useEnabledDevices } from "@/lib/use-enabled-devices";

export type EnergyDataItem = {
  voltage?: number;
  current?: number;
  soc?: number;
  /** Battery temperature (°C) from controller; defaults to 0 when omitted */
  battery_temperature?: number;
};

export type OptimizeWeather = {
  city?: string;
  condition?: string;
  energy_estimate?: number;
  temperature?: number | null;
};

export type CitySuggestion = {
  name: string;
  country: string;
};

type SolarSystemProfileResponse = {
  battery_capacity_wh: number;
  inverter_max_power_w: number;
};

const DASHBOARD_POLL_INTERVAL_MS = 50000;

export function useDashboardState() {
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const activeDevices = useEnabledDevices(devices);
  const [battery, setBattery] = useState<EnergyDataItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<string[]>([]);

  const [city, setCity] = useState("Tel Aviv");
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [selectedCity, setSelectedCity] = useState<CitySuggestion | null>(null);
  const [weather, setWeather] = useState<OptimizeWeather | null>(null);
  const [batteryCapacityWhValue, setBatteryCapacityWhValue] = useState(0);
  const batteryCapacityWhRef = useRef(0);
  const [inverterMaxPowerWValue, setInverterMaxPowerWValue] = useState(
    DEFAULT_INVERTER_MAX_POWER_W,
  );
  const inverterMaxPowerWRef = useRef(DEFAULT_INVERTER_MAX_POWER_W);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [forecastPoints, setForecastPoints] = useState<ForecastPoint[]>(() =>
    buildMock12hForecast(),
  );
  const [runningPlanSelection, setRunningPlanSelection] = useState(() =>
    getRunningPlanSelection(),
  );
  const [feasibleSelectionId, setFeasibleSelectionId] = useState<string | null>(
    () => getFeasibleSelection(),
  );
  const [orBestPlan, setOrBestPlan] =
    useState<OrBestCombinationResponse | null>(null);
  const [orBestLoading, setOrBestLoading] = useState(false);
  const [orBestError, setOrBestError] = useState<string | null>(null);
  const [nightPlanUiRevision, setNightPlanUiRevision] = useState(0);
  const [dayPlanUiRevision, setDayPlanUiRevision] = useState(0);
  const [freePlanUiRevision, setFreePlanUiRevision] = useState(0);
  const cityRef = useRef(city);
  cityRef.current = city;
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const orBestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forecastDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nightPlanCardHint = useMemo(() => {
    if (!isNightSetupComplete()) {
      return "Set up home size and essential products · discharge only until sunrise";
    }
    if (isNightPlanModeActive()) {
      return "Night plan active (auto after sunset) · Tap to manage";
    }
    return "Tap to configure night plan · runs automatically after sunset";
  }, [nightPlanUiRevision]);

  const dayPlanCardHint = useMemo(() => {
    if (!isDaySetupComplete()) {
      return "Set up home size and daytime products · sunrise to sunset with solar charging";
    }
    if (isDayPlanModeActive()) {
      return "Day plan active (auto in daylight) · Tap to manage loads";
    }
    return "Tap to configure day plan · runs automatically sunrise–sunset";
  }, [dayPlanUiRevision]);

  const rawSoc =
    typeof battery?.soc === "number" ? battery.soc : null;
  const soc = resolveSocPercent(rawSoc);
  const socFromController = hasControllerSocReport(rawSoc);
  const voltage = typeof battery?.voltage === "number" ? battery.voltage : 0;
  const current = typeof battery?.current === "number" ? battery.current : 0;
  const batteryTemperature =
    typeof battery?.battery_temperature === "number" &&
    !Number.isNaN(battery.battery_temperature)
      ? battery.battery_temperature
      : 0;
  const availableEnergyWh = useMemo(
    () =>
      availableEnergyFromSoc(
        parseControllerSocPercent(rawSoc),
        batteryCapacityWhValue,
      ),
    [rawSoc, batteryCapacityWhValue],
  );

  const optimization = useMemo(
    () =>
      optimizeDevices(activeDevices, availableEnergyWh, inverterMaxPowerWValue),
    [activeDevices, availableEnergyWh, inverterMaxPowerWValue],
  );
  const optimizationRef = useRef(optimization);
  optimizationRef.current = optimization;
  const didInitialOrFetchRef = useRef(false);

  const runnableCombinationCatalog = useMemo(
    () =>
      buildRunnableCombinationCatalog(
        activeDevices,
        inverterMaxPowerWValue,
        availableEnergyWh,
      ),
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

  const daylightMinutes = getLastDaylightMinutes();
  const activeFreePlanDevices = useMemo(() => {
    void freePlanUiRevision;
    if (!isFreePlanSessionActive()) {
      return [];
    }
    const ids = new Set(getFreePlanSessionDeviceIds());
    return devices.filter((device) => ids.has(device.id));
  }, [devices, freePlanUiRevision]);

  const activeDayPlanDevices = useMemo(() => {
    void dayPlanUiRevision;
    if (!isDayPlanModeActive()) {
      return [];
    }
    const enabled = devices.filter((device) => isDayPlanDeviceEnabled(device.id));
    return [...enabled].sort((a, b) => {
      const aBasic = isDayBasicDevice(a.id) ? 1 : 0;
      const bBasic = isDayBasicDevice(b.id) ? 1 : 0;
      if (aBasic !== bBasic) {
        return bBasic - aBasic;
      }
      return (b.priority ?? 0) - (a.priority ?? 0);
    });
  }, [devices, dayPlanUiRevision]);

  const selectedRunningPlan = useMemo(
    () =>
      resolveSelectedRunningPlan({
        selection: runningPlanSelection,
        allRunnableCombinations,
        orBestPlan,
        activeDevices,
        nightPlanDevices: activeNightPlanDevices,
        nightDarknessMinutes,
        dayPlanDevices: activeDayPlanDevices,
        daylightMinutes,
        freePlanDevices: activeFreePlanDevices,
      }),
    [
      runningPlanSelection,
      allRunnableCombinations,
      orBestPlan,
      activeDevices,
      activeNightPlanDevices,
      nightDarknessMinutes,
      activeDayPlanDevices,
      daylightMinutes,
      activeFreePlanDevices,
      nightPlanUiRevision,
      dayPlanUiRevision,
      freePlanUiRevision,
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
  }, [
    selectedRunningPlan,
    batteryCapacityWhValue,
    availableEnergyWh,
    forecastPoints,
  ]);

  /** Always-on dashboard metric: hourly solar recharge + SOC, 12h horizon */
  const twelveHourOutlook = useMemo((): TwelveHourOutlook => {
    const loadW = selectedRunningPlan?.totalPowerW ?? 0;
    return computeTwelveHourOutlook({
      totalPowerW: loadW,
      initialBatteryWh: availableEnergyWh,
      batteryCapacityWh: batteryCapacityWhValue,
      forecastPoints,
    });
  }, [
    selectedRunningPlan,
    availableEnergyWh,
    batteryCapacityWhValue,
    forecastPoints,
  ]);

  const twelveHourRunForecast = useMemo(
    () =>
      buildTwelveHourRunForecast(allRunnableCombinations, {
        initialBatteryWh: availableEnergyWh,
        batteryCapacityWh: batteryCapacityWhValue,
        forecastPoints,
      }),
    [
      allRunnableCombinations,
      availableEnergyWh,
      batteryCapacityWhValue,
      forecastPoints,
    ],
  );

  const isOrPlanSelected = runningPlanSelection?.kind === "or-tools";
  const isFreePlanActive = useMemo(() => {
    void freePlanUiRevision;
    return isFreePlanSessionActive();
  }, [freePlanUiRevision]);
  const freePlanRemainingMs = isFreePlanActive ? getFreePlanRemainingMs() : 0;
  const displayCity = weather?.city ?? selectedCity?.name ?? city;

  useFocusEffect(
    useCallback(() => {
      setRunningPlanSelection(getRunningPlanSelection());
      setFeasibleSelectionId(getFeasibleSelection());
    }, []),
  );

  useEffect(() => {
    void (async () => {
      await Promise.all([
        hydrateNightPlanStore(),
        hydrateDayPlanStore(),
        hydrateAlwaysOnStore(),
        hydrateDayPlanEssentialsStore(),
      ]);
      await hydrateFreePlanStore();
      setRunningPlanSelection(getRunningPlanSelection());
      setFreePlanUiRevision((v) => v + 1);
      tickPlanOrchestrator();
    })();
    const unsubNight = subscribeNightPlanStore(() => {
      setNightPlanUiRevision((value) => value + 1);
      setRunningPlanSelection(getRunningPlanSelection());
    });
    const unsubDay = subscribeDayPlanStore(() => {
      setDayPlanUiRevision((value) => value + 1);
      setRunningPlanSelection(getRunningPlanSelection());
    });
    return () => {
      unsubNight();
      unsubDay();
    };
  }, []);

  useEffect(() => {
    return subscribeFeasibleSelection(() => {
      setFeasibleSelectionId(getFeasibleSelection());
      setRunningPlanSelection(getRunningPlanSelection());
    });
  }, []);

  useEffect(() => {
    if (runningPlanSelection?.kind !== "feasible") {
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
    if (runningPlanSelection?.kind !== "or-tools") {
      return;
    }
    const orPlanValid =
      orBestPlan &&
      orBestPlan.can_run.length > 0 &&
      (orBestPlan.solver_status === "OPTIMAL" ||
        orBestPlan.solver_status === "FEASIBLE");
    if (!orPlanValid) {
      clearRunningPlanSelection();
      setRunningPlanSelection(null);
    }
  }, [runningPlanSelection, orBestPlan]);

  const fetchOrBestCombination = async (
    deviceList: ApiDevice[],
    targetCity: string,
  ) => {
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
        devices: deviceList.map(
          ({
            name,
            power,
            duration,
            priority,
            essential,
            start_time,
            end_time,
          }) => ({
            name,
            power,
            duration,
            priority,
            essential,
            start_time: start_time ?? "00:00",
            end_time: end_time ?? "23:59",
          }),
        ),
      };
      const res = await fetch(OPTIMIZE_BEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setOrBestPlan(null);
        setOrBestError(
          `OR request failed (${res.status}). Restart the backend after installing ortools.`,
        );
        return;
      }
      const data = (await res.json()) as OrBestCombinationResponse;
      setOrBestPlan(data);
    } catch {
      setOrBestPlan(null);
      setOrBestError(
        "Could not reach OR-Tools endpoint. Check that the backend is running.",
      );
    } finally {
      setOrBestLoading(false);
    }
  };

  const evaluateAlerts = (
    latestSoc: number | undefined,
    latestAvailableEnergyWh: number,
    deviceList: ApiDevice[],
  ) => {
    const dynamicAlerts: string[] = [];
    const controllerSoc = parseControllerSocPercent(latestSoc);
    const nextHourUsageWh = deviceList.reduce(
      (sum, d) => sum + d.power * (d.duration / 60),
      0,
    );

    if (controllerSoc !== null && controllerSoc < 25) {
      dynamicAlerts.push("Low battery level");
    }
    if (
      controllerSoc !== null &&
      controllerSoc < 35 &&
      nextHourUsageWh > latestAvailableEnergyWh
    ) {
      dynamicAlerts.push("High usage may drain battery soon");
    }
    if (
      controllerSoc !== null &&
      latestAvailableEnergyWh > 0 &&
      nextHourUsageWh > latestAvailableEnergyWh
    ) {
      dynamicAlerts.push("Risk of battery depletion");
    }
    const opt = optimizationRef.current;
    if (opt.blockedMandatoryCount > 0) {
      dynamicAlerts.push("Not enough energy for required devices");
    }
    if (opt.blockedOptionalCount > 0) {
      dynamicAlerts.push("Optional devices limited due to energy constraints");
    }
    const blockedByInverter = opt.blocked.some((item) =>
      item.reason?.includes("exceeds inverter limit"),
    );
    if (blockedByInverter) {
      dynamicAlerts.push("Some devices blocked due to inverter power limit");
    }
    setAlerts(dynamicAlerts);
  };

  const fetchForecastPoints = async (
    deviceList: ApiDevice[],
    targetCity: string,
  ) => {
    try {
      const payload = {
        city: targetCity,
        devices: deviceList.map(
          ({
            name,
            power,
            duration,
            priority,
            essential,
            start_time,
            end_time,
          }) => ({
            name,
            power,
            duration,
            priority,
            essential,
            start_time: start_time ?? "00:00",
            end_time: end_time ?? "23:59",
          }),
        ),
      };
      const res = await fetch(OPTIMIZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (
        Array.isArray(data.forecast_points) &&
        data.forecast_points.length > 0
      ) {
        setForecastPoints(data.forecast_points);
      }
    } catch {
      // Keep mock forecast when backend is unavailable.
    }
  };

  const fetchDashboardDataRef = useRef<() => Promise<void>>(async () => {});

  fetchDashboardDataRef.current = async () => {
    try {
      await hydrateFreePlanStore();
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
          capacityWhForCalc =
            !Number.isNaN(parsedCapacity) && parsedCapacity > 0
              ? parsedCapacity
              : 0;
          inverterMaxPowerWForCalc =
            !Number.isNaN(parsedInverter) && parsedInverter > 0
              ? parsedInverter
              : DEFAULT_INVERTER_MAX_POWER_W;
        }
      } catch {
        capacityWhForCalc = batteryCapacityWhRef.current;
        inverterMaxPowerWForCalc = inverterMaxPowerWRef.current;
      }

      batteryCapacityWhRef.current = capacityWhForCalc;
      inverterMaxPowerWRef.current = inverterMaxPowerWForCalc;
      setBatteryCapacityWhValue((prev) =>
        prev === capacityWhForCalc ? prev : capacityWhForCalc,
      );
      setInverterMaxPowerWValue((prev) =>
        prev === inverterMaxPowerWForCalc ? prev : inverterMaxPowerWForCalc,
      );

      let latestDevices: ApiDevice[] = [];
      let devicesRes: Response | null = null;
      let energyRes: Response | null = null;
      try {
        [devicesRes, energyRes] = await Promise.all([
          fetch(`${DEVICES_URL}?t=${Date.now()}`),
          fetch(`${ENERGY_LATEST_URL}?t=${Date.now()}`),
        ]);
      } catch {
        devicesRes = null;
        energyRes = null;
      }
      if (devicesRes?.ok) {
        const devicesData = (await devicesRes.json()) as ApiDevice[];
        if (Array.isArray(devicesData)) {
          latestDevices = devicesData;
          pruneDisabledDeviceIds(devicesData.map((device) => device.id));
          const nextSignature = buildDevicesCatalogSignature(devicesData);
          setDevices((prev) =>
            buildDevicesCatalogSignature(prev) === nextSignature
              ? prev
              : devicesData,
          );
        }
      }
      if (energyRes?.ok) {
        const latest = (await energyRes.json()) as EnergyDataItem;
        const latestRawSoc =
          typeof latest?.soc === "number" ? latest.soc : null;
        const latestAvailableEnergyWh = availableEnergyFromSoc(
          parseControllerSocPercent(latestRawSoc),
          capacityWhForCalc,
        );
        setBattery(latest);
        evaluateAlerts(
          latestRawSoc ?? undefined,
          latestAvailableEnergyWh,
          filterEnabledDevices(latestDevices),
        );
      }

      const targetCity = cityRef.current.trim() || "Tel Aviv";
      try {
        const [dayRes, nightRes] = await Promise.all([
          fetch(
            `${DAY_WINDOW_URL}?city=${encodeURIComponent(targetCity)}&t=${Date.now()}`,
          ),
          fetch(
            `${NIGHT_WINDOW_URL}?city=${encodeURIComponent(targetCity)}&t=${Date.now()}`,
          ),
        ]);
        if (dayRes.ok) {
          setCachedDayWindow((await dayRes.json()) as CachedDayWindow);
        }
        if (nightRes.ok) {
          setCachedNightWindow((await nightRes.json()) as CachedNightWindow);
        }
      } catch {
        // keep cached windows
      }

      const enabledDevices = filterEnabledDevices(latestDevices);
      if (forecastDebounceRef.current) {
        clearTimeout(forecastDebounceRef.current);
      }
      forecastDebounceRef.current = setTimeout(() => {
        void fetchForecastPoints(enabledDevices, targetCity);
      }, 800);

      if (!didInitialOrFetchRef.current && enabledDevices.length > 0) {
        didInitialOrFetchRef.current = true;
        void fetchOrBestCombination(enabledDevices, targetCity);
      }

      const tickResult = tickPlanOrchestrator();
      if (tickResult.type === "free_plan_ended") {
        setAlerts((prev) => [
          ...prev,
          "Free plan finished — devices turned off. Previous plan resumed when applicable.",
        ]);
        setFreePlanUiRevision((v) => v + 1);
      }
      if (
        tickResult.type !== "idle" &&
        tickResult.type !== "free_plan_active"
      ) {
        setNightPlanUiRevision((v) => v + 1);
        setDayPlanUiRevision((v) => v + 1);
      }
      setRunningPlanSelection(getRunningPlanSelection());
    } catch {
      // Network unreachable.
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = useCallback(async () => {
    await fetchDashboardDataRef.current();
  }, []);

  const runOptimization = useCallback(() => {
    const targetCity = city.trim() || "Tel Aviv";
    void fetchOrBestCombination(activeDevices, targetCity);
    void fetchForecastPoints(activeDevices, targetCity);
  }, [activeDevices, city]);

  const onSelectOrBestPlan = useCallback(() => {
    if (
      !orBestPlan ||
      orBestPlan.can_run.length === 0 ||
      (orBestPlan.solver_status !== "OPTIMAL" &&
        orBestPlan.solver_status !== "FEASIBLE")
    ) {
      return;
    }
    const allowedCount = orBestPlan.can_run.length;
    setOrToolsRunningPlan();
    setRunningPlanSelection({ kind: "or-tools" });
    logUserActivity({
      action: "SELECT_PLAN",
      entity_type: "plan",
      entity_id: "or-tools",
      metadata: {
        strategy: "or_tools",
        soc: soc ?? undefined,
        available_energy_wh: availableEnergyWh,
        inverter_limit_w: inverterMaxPowerWValue,
        allowed_devices_count: allowedCount,
        blocked_devices_count: Math.max(0, activeDevices.length - allowedCount),
        solver_status: orBestPlan.solver_status,
        total_power_w: orBestPlan.total_power_w,
      },
    });
  }, [
    orBestPlan,
    soc,
    availableEnergyWh,
    inverterMaxPowerWValue,
    activeDevices.length,
  ]);

  const selectFeasiblePlan = useCallback(
    (combinationId: string) => {
      const combo = allRunnableCombinations.find(
        (item) => item.id === combinationId,
      );
      const allowedCount = combo?.devices.length ?? 0;
      setFeasibleSelection(combinationId);
      setFeasibleSelectionId(combinationId);
      setRunningPlanSelection(getRunningPlanSelection());
      logUserActivity({
        action: "SELECT_PLAN",
        entity_type: "plan",
        entity_id: combinationId,
        metadata: {
          strategy: "feasible_combination",
          soc: soc ?? undefined,
          available_energy_wh: availableEnergyWh,
          inverter_limit_w: inverterMaxPowerWValue,
          allowed_devices_count: allowedCount,
          blocked_devices_count: Math.max(
            0,
            activeDevices.length - allowedCount,
          ),
          source: "feasible_combination",
        },
      });
    },
    [
      allRunnableCombinations,
      soc,
      availableEnergyWh,
      inverterMaxPowerWValue,
      activeDevices.length,
    ],
  );

  const onSelectCity = useCallback(
    (item: CitySuggestion) => {
      setSelectedCity(item);
      setCity(item.name);
      setCitySuggestions([]);
      setWeatherLoading(true);
      void fetchForecastPoints(activeDevices, item.name).finally(() =>
        setWeatherLoading(false),
      );
    },
    [activeDevices],
  );

  useEffect(() => {
    return subscribeDeviceEnabled(() => {
      if (orBestDebounceRef.current) {
        clearTimeout(orBestDebounceRef.current);
      }
      orBestDebounceRef.current = setTimeout(() => {
        const enabledDevices = filterEnabledDevices(devicesRef.current);
        const targetCity = cityRef.current.trim() || "Tel Aviv";
        void fetchOrBestCombination(enabledDevices, targetCity);
        void fetchForecastPoints(enabledDevices, targetCity);
      }, 1500);
    });
  }, []);

  useEffect(() => {
    return subscribeFreePlanStore((event) => {
      if (event === "selection_changed") {
        return;
      }
      const tickResult = tickPlanOrchestrator();
      setFreePlanUiRevision((v) => v + 1);
      setDayPlanUiRevision((v) => v + 1);
      setNightPlanUiRevision((v) => v + 1);
      setRunningPlanSelection(getRunningPlanSelection());
      if (tickResult.type === "free_plan_ended") {
        setAlerts((prev) => [
          ...prev,
          "Free plan finished — devices turned off. Previous plan resumed when applicable.",
        ]);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (orBestDebounceRef.current) {
        clearTimeout(orBestDebounceRef.current);
      }
      if (forecastDebounceRef.current) {
        clearTimeout(forecastDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void fetchDashboardData();
    const pollId = setInterval(() => {
      void fetchDashboardData();
    }, DASHBOARD_POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollId);
    };
  }, []);

  useEffect(() => {
    const query = city.trim();
    if (query.length < 2) {
      setCitySuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${CITIES_URL}?query=${encodeURIComponent(query)}`,
        );
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
      } catch {
        setCitySuggestions([]);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [city]);

  return {
    devices,
    activeDevices,
    battery,
    loading,
    alerts,
    city,
    setCity,
    citySuggestions,
    selectedCity,
    onSelectCity,
    weather,
    weatherLoading,
    batteryCapacityWhValue,
    inverterMaxPowerWValue,
    availableEnergyWh,
    soc,
    socFromController,
    voltage,
    current,
    batteryTemperature,
    optimization,
    runnableCombinationCatalog,
    allRunnableCombinations,
    selectedRunningPlan,
    selectedPlanSustainability,
    twelveHourOutlook,
    twelveHourRunForecast,
    forecastPoints,
    runningPlanSelection,
    feasibleSelectionId,
    orBestPlan,
    orBestLoading,
    orBestError,
    isOrPlanSelected,
    displayCity,
    nightPlanCardHint,
    dayPlanCardHint,
    fetchDashboardData,
    runOptimization,
    onSelectOrBestPlan,
    selectFeasiblePlan,
    isFreePlanActive,
    freePlanRemainingMs,
  };
}
