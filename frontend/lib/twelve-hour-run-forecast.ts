import type { RunnableCombination } from '@/lib/optimization-catalog';
import {
  buildHourlyBatteryStateRows,
  computePlanSustainabilityHours,
  PLANNING_HORIZON_HOURS,
  type ForecastPoint,
  type HourlyBatteryStateRow,
  type PlanSustainabilityResult,
} from '@/lib/plan-sustainability';

export type TwelveHourRunPlan = RunnableCombination & {
  sustainability: PlanSustainabilityResult;
  runsFullHorizon: boolean;
};

export type TwelveHourRunForecast = {
  fullHorizonPlans: TwelveHourRunPlan[];
  partialPlans: TwelveHourRunPlan[];
  planningHorizonHours: number;
  initialBatteryWh: number;
  forecastPoints: ForecastPoint[];
};

export type HourlySolarForecastRow = HourlyBatteryStateRow;

export function buildHourlySolarForecastRows(
  forecastPoints: ForecastPoint[],
  batteryCapacityWh: number,
  initialBatteryWh: number,
  loadWhPerHour = 0,
): HourlySolarForecastRow[] {
  return buildHourlyBatteryStateRows({
    initialBatteryWh,
    batteryCapacityWh,
    forecastPoints,
    loadWhPerHour,
  });
}

export function buildTwelveHourRunForecast(
  combinations: RunnableCombination[],
  params: {
    initialBatteryWh: number;
    batteryCapacityWh: number;
    forecastPoints: ForecastPoint[];
  },
): TwelveHourRunForecast {
  const planningHorizonHours = Math.min(PLANNING_HORIZON_HOURS, params.forecastPoints.length);

  const evaluated: TwelveHourRunPlan[] = combinations.map((combo) => {
    const sustainability = computePlanSustainabilityHours({
      totalPowerW: combo.totalPowerW,
      initialBatteryWh: params.initialBatteryWh,
      batteryCapacityWh: params.batteryCapacityWh,
      forecastPoints: params.forecastPoints,
    });

    return {
      ...combo,
      sustainability,
      runsFullHorizon:
        planningHorizonHours > 0 && sustainability.sustainableHours >= planningHorizonHours,
    };
  });

  evaluated.sort((a, b) => {
    if (a.runsFullHorizon !== b.runsFullHorizon) {
      return a.runsFullHorizon ? -1 : 1;
    }
    return b.sustainability.sustainableHours - a.sustainability.sustainableHours;
  });

  return {
    fullHorizonPlans: evaluated.filter((plan) => plan.runsFullHorizon),
    partialPlans: evaluated.filter(
      (plan) => !plan.runsFullHorizon && plan.sustainability.sustainableHours > 0,
    ),
    planningHorizonHours,
    initialBatteryWh: params.initialBatteryWh,
    forecastPoints: params.forecastPoints,
  };
}
