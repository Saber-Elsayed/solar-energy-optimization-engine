export const MAX_WEATHER_ENERGY_SCORE = 5;
export const PLANNING_HORIZON_HOURS = 12;

export type ForecastPoint = {
  hour: string;
  energy: number;
  is_day?: boolean;
};

export type HourlyBatteryStateRow = {
  hour: string;
  isDay: boolean;
  weatherEnergyScore: number;
  solarRechargeWh: number;
  loadWh: number;
  batteryBeforeWh: number;
  remainingBatteryWh: number;
  batteryCapacityWh: number;
};

export function weatherEnergyToWh(weatherEnergy: number, batteryCapacityWh: number): number {
  if (batteryCapacityWh <= 0 || weatherEnergy <= 0) {
    return 0;
  }
  return (weatherEnergy / MAX_WEATHER_ENERGY_SCORE) * batteryCapacityWh;
}

function parseHourToMinutes(hour: string): number {
  const [hoursStr, minutesStr] = hour.split(':');
  return Number(hoursStr) * 60 + Number(minutesStr);
}

function formatMinutesToHour(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function currentClockHour(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function solarEnergyScoreForClockHour(hour: string): number {
  const hourOfDay = parseHourToMinutes(hour) / 60;
  if (hourOfDay < 6 || hourOfDay >= 20) {
    return 0;
  }
  const daylightFactor = Math.max(0, 1 - Math.abs(hourOfDay - 13) / 7);
  return daylightFactor * MAX_WEATHER_ENERGY_SCORE;
}

export function isDaylightHour(hour: string): boolean {
  return solarEnergyScoreForClockHour(hour) > 0;
}

export function buildMock12hForecast(startHour = currentClockHour()): ForecastPoint[] {
  const startMinutes = parseHourToMinutes(startHour);
  return Array.from({ length: PLANNING_HORIZON_HOURS }, (_, index) => {
    const hour = formatMinutesToHour(startMinutes + index * 60);
    const energy = solarEnergyScoreForClockHour(hour);
    return {
      hour,
      energy,
      is_day: energy > 0,
    };
  });
}

export function buildHourlyBatteryStateRows(params: {
  initialBatteryWh: number;
  batteryCapacityWh: number;
  forecastPoints: ForecastPoint[];
  loadWhPerHour?: number;
}): HourlyBatteryStateRow[] {
  const horizon = Math.min(PLANNING_HORIZON_HOURS, params.forecastPoints.length);
  const loadWhPerHour = params.loadWhPerHour ?? 0;
  let batteryWh = params.initialBatteryWh;
  const rows: HourlyBatteryStateRow[] = [];

  for (let index = 0; index < horizon; index += 1) {
    const point = params.forecastPoints[index];
    const solarWh = weatherEnergyToWh(point.energy, params.batteryCapacityWh);
    const batteryBeforeWh = batteryWh;
    batteryWh = Math.min(params.batteryCapacityWh, Math.max(0, batteryWh + solarWh - loadWhPerHour));

    rows.push({
      hour: point.hour,
      isDay: point.is_day ?? point.energy > 0,
      weatherEnergyScore: point.energy,
      solarRechargeWh: solarWh,
      loadWh: loadWhPerHour,
      batteryBeforeWh,
      remainingBatteryWh: batteryWh,
      batteryCapacityWh: params.batteryCapacityWh,
    });
  }

  return rows;
}

export type PlanSustainabilityResult = {
  sustainableHours: number;
  planningHorizonHours: number;
  lastSustainableHour: string | null;
  limitingHour: string | null;
  finalBatteryWh: number;
  hourlyBreakdown: HourlyBatteryStateRow[];
};

export function computePlanSustainabilityHours(params: {
  totalPowerW: number;
  initialBatteryWh: number;
  batteryCapacityWh: number;
  forecastPoints: ForecastPoint[];
}): PlanSustainabilityResult {
  const horizon = Math.min(PLANNING_HORIZON_HOURS, params.forecastPoints.length);
  const loadWhPerHour = params.totalPowerW;
  const hourlyBreakdown: HourlyBatteryStateRow[] = [];

  if (horizon === 0 || loadWhPerHour <= 0) {
    return {
      sustainableHours: 0,
      planningHorizonHours: horizon,
      lastSustainableHour: null,
      limitingHour: params.forecastPoints[0]?.hour ?? null,
      finalBatteryWh: params.initialBatteryWh,
      hourlyBreakdown: buildHourlyBatteryStateRows({
        initialBatteryWh: params.initialBatteryWh,
        batteryCapacityWh: params.batteryCapacityWh,
        forecastPoints: params.forecastPoints,
        loadWhPerHour: 0,
      }),
    };
  }

  let batteryWh = params.initialBatteryWh;
  let sustainableHours = 0;
  let lastSustainableHour: string | null = null;
  let limitingHour: string | null = null;

  for (let index = 0; index < horizon; index += 1) {
    const point = params.forecastPoints[index];
    const solarWh = weatherEnergyToWh(point.energy, params.batteryCapacityWh);
    const batteryBeforeWh = batteryWh;
    const isDay = point.is_day ?? point.energy > 0;

    if (batteryWh + solarWh < loadWhPerHour) {
      limitingHour = point.hour;
      hourlyBreakdown.push({
        hour: point.hour,
        isDay,
        weatherEnergyScore: point.energy,
        solarRechargeWh: solarWh,
        loadWh: loadWhPerHour,
        batteryBeforeWh,
        remainingBatteryWh: Math.max(0, batteryBeforeWh + solarWh),
        batteryCapacityWh: params.batteryCapacityWh,
      });
      break;
    }

    batteryWh = Math.min(params.batteryCapacityWh, batteryWh + solarWh - loadWhPerHour);
    sustainableHours += 1;
    lastSustainableHour = point.hour;
    hourlyBreakdown.push({
      hour: point.hour,
      isDay,
      weatherEnergyScore: point.energy,
      solarRechargeWh: solarWh,
      loadWh: loadWhPerHour,
      batteryBeforeWh,
      remainingBatteryWh: batteryWh,
      batteryCapacityWh: params.batteryCapacityWh,
    });
  }

  if (sustainableHours === horizon) {
    limitingHour = null;
  }

  return {
    sustainableHours,
    planningHorizonHours: horizon,
    lastSustainableHour,
    limitingHour,
    finalBatteryWh: batteryWh,
    hourlyBreakdown,
  };
}
