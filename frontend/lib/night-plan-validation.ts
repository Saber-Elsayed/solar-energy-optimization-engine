import type { ApiDevice } from '@/lib/device-types';
import { deviceNightEnergyWh } from '@/lib/night-plan-catalog';
import type { NightProductSuggestion } from '@/lib/night-plan-suggestions';

export const MIN_LIMITED_NIGHT_MINUTES = 15;

export type NightPlanFailureKind = 'inverter' | 'energy';

export type NightPlanValidationResult = {
  allowed: boolean;
  reason: string | null;
  failureKind: NightPlanFailureKind | null;
  totalPowerW: number;
  totalEnergyWh: number;
  headroomWh: number;
  inverterHeadroomW: number;
};

export type NightLimitedRunSuggestion = {
  available: boolean;
  maxMinutes: number;
  energyWh: number;
  remainingHeadroomWh: number;
  label: string;
  message: string;
};

export type NightPlanAddValidationResult = NightPlanValidationResult & {
  limitedRun: NightLimitedRunSuggestion | null;
};

export type NightPlanToggleBlock = {
  title: string;
  message: string;
  failureKind: NightPlanFailureKind;
  limitedRun: NightLimitedRunSuggestion | null;
};

export function buildNightPlanToggleBlock(check: NightPlanAddValidationResult): NightPlanToggleBlock | null {
  if (check.allowed || !check.reason || !check.failureKind) {
    return null;
  }

  if (check.failureKind === 'inverter') {
    return {
      title: 'Inverter limit exceeded',
      message: check.reason,
      failureKind: 'inverter',
      limitedRun: null,
    };
  }

  return {
    title: 'Cannot add to night plan',
    message: check.reason,
    failureKind: 'energy',
    limitedRun: check.limitedRun,
  };
}

export function formatNightRuntimeLabel(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (hours > 0 && remainder > 0) {
    return `${hours} h ${remainder} min`;
  }
  if (hours > 0) {
    return `${hours} h`;
  }
  return `${remainder} min`;
}

export function effectiveNightMinutes(
  deviceId: string,
  darknessMinutes: number,
  durationOverrides?: Record<string, number>,
): number {
  const override = durationOverrides?.[deviceId];
  if (override !== undefined && override > 0) {
    return Math.min(Math.round(override), darknessMinutes);
  }
  return darknessMinutes;
}

export function deviceNightEnergyForPlan(
  device: ApiDevice,
  darknessMinutes: number,
  durationOverrides?: Record<string, number>,
): number {
  const minutes = effectiveNightMinutes(device.id, darknessMinutes, durationOverrides);
  return deviceNightEnergyWh(device.power, minutes);
}

export function validateNightPlanLoad(params: {
  activeDevices: ApiDevice[];
  darknessMinutes: number;
  inverterMaxPowerW: number;
  availableEnergyWh: number;
  durationOverrides?: Record<string, number>;
}): NightPlanValidationResult {
  const { activeDevices, darknessMinutes, inverterMaxPowerW, availableEnergyWh, durationOverrides } = params;
  const totalPowerW = activeDevices.reduce((sum, device) => sum + device.power, 0);
  const totalEnergyWh = activeDevices.reduce(
    (sum, device) => sum + deviceNightEnergyForPlan(device, darknessMinutes, durationOverrides),
    0,
  );
  const headroomWh = availableEnergyWh - totalEnergyWh;
  const inverterHeadroomW = inverterMaxPowerW - totalPowerW;

  if (activeDevices.length === 0) {
    return {
      allowed: true,
      reason: null,
      failureKind: null,
      totalPowerW: 0,
      totalEnergyWh: 0,
      headroomWh: availableEnergyWh,
      inverterHeadroomW: inverterMaxPowerW,
    };
  }

  if (totalPowerW > inverterMaxPowerW) {
    return {
      allowed: false,
      failureKind: 'inverter',
      reason: `Combined load ${totalPowerW.toFixed(0)} W exceeds inverter limit ${inverterMaxPowerW.toFixed(0)} W. Running these products together can trip the inverter and cause an immediate power outage. Turn off another product or choose a lower-power device.`,
      totalPowerW,
      totalEnergyWh,
      headroomWh,
      inverterHeadroomW,
    };
  }

  if (totalEnergyWh > availableEnergyWh) {
    return {
      allowed: false,
      failureKind: 'energy',
      reason: `Overnight need ${totalEnergyWh.toFixed(0)} Wh but only ${availableEnergyWh.toFixed(0)} Wh is available. The battery may drain before sunrise and cause a power outage.`,
      totalPowerW,
      totalEnergyWh,
      headroomWh,
      inverterHeadroomW,
    };
  }

  return {
    allowed: true,
    reason: null,
    failureKind: null,
    totalPowerW,
    totalEnergyWh,
    headroomWh,
    inverterHeadroomW,
  };
}

export function suggestLimitedNightRun(params: {
  device: ApiDevice;
  currentActive: ApiDevice[];
  darknessMinutes: number;
  inverterMaxPowerW: number;
  availableEnergyWh: number;
  durationOverrides?: Record<string, number>;
  minUsefulMinutes?: number;
}): NightLimitedRunSuggestion | null {
  const {
    device,
    currentActive,
    darknessMinutes,
    inverterMaxPowerW,
    availableEnergyWh,
    durationOverrides,
  } = params;
  const minUsefulMinutes = params.minUsefulMinutes ?? MIN_LIMITED_NIGHT_MINUTES;

  if (device.power <= 0 || darknessMinutes <= 0) {
    return null;
  }

  if (device.power > inverterMaxPowerW) {
    return null;
  }

  const projectedPowerW = currentActive.reduce((sum, item) => sum + item.power, 0) + device.power;
  if (projectedPowerW > inverterMaxPowerW) {
    return null;
  }

  const othersEnergyWh = currentActive.reduce(
    (sum, item) => sum + deviceNightEnergyForPlan(item, darknessMinutes, durationOverrides),
    0,
  );
  const headroomWh = availableEnergyWh - othersEnergyWh;
  if (headroomWh <= 0) {
    return null;
  }

  const maxMinutes = Math.min(darknessMinutes, Math.floor((headroomWh * 60) / device.power));
  if (maxMinutes < minUsefulMinutes) {
    return null;
  }

  const energyWh = deviceNightEnergyWh(device.power, maxMinutes);
  const remainingHeadroomWh = headroomWh - energyWh;
  const label = formatNightRuntimeLabel(maxMinutes);

  return {
    available: true,
    maxMinutes,
    energyWh,
    remainingHeadroomWh,
    label,
    message: `You can run this for up to ${label} tonight (~${energyWh.toFixed(0)} Wh). About ${Math.max(0, remainingHeadroomWh).toFixed(0)} Wh stays available for your other night products until morning.`,
  };
}

export function validateAddingDeviceToNightPlan(params: {
  device: ApiDevice;
  currentActive: ApiDevice[];
  darknessMinutes: number;
  inverterMaxPowerW: number;
  availableEnergyWh: number;
  durationOverrides?: Record<string, number>;
  runMinutesForDevice?: number;
}): NightPlanAddValidationResult {
  const overrides = { ...params.durationOverrides };
  if (params.runMinutesForDevice !== undefined) {
    overrides[params.device.id] = params.runMinutesForDevice;
  }

  const alreadyActive = params.currentActive.some((item) => item.id === params.device.id);
  const nextActive = alreadyActive
    ? params.currentActive
    : [...params.currentActive, params.device];

  const othersActive = params.currentActive.filter((item) => item.id !== params.device.id);
  const othersPowerW = othersActive.reduce((sum, item) => sum + item.power, 0);
  const projectedPowerW = othersPowerW + params.device.power;
  const inverterHeadroomForDevice = params.inverterMaxPowerW - othersPowerW;

  if (params.device.power > params.inverterMaxPowerW) {
    return {
      allowed: false,
      failureKind: 'inverter',
      reason: `This product needs ${params.device.power.toFixed(0)} W but the inverter limit is ${params.inverterMaxPowerW.toFixed(0)} W. It cannot run on this system — use a lower-power device.`,
      totalPowerW: projectedPowerW,
      totalEnergyWh: 0,
      headroomWh: params.availableEnergyWh,
      inverterHeadroomW: inverterHeadroomForDevice,
      limitedRun: null,
    };
  }

  if (projectedPowerW > params.inverterMaxPowerW) {
    const exceedBy = projectedPowerW - params.inverterMaxPowerW;
    const headroomText =
      inverterHeadroomForDevice > 0
        ? ` Only ${inverterHeadroomForDevice.toFixed(0)} W inverter headroom remains with current night products.`
        : ' There is no inverter headroom left with current night products.';
    return {
      allowed: false,
      failureKind: 'inverter',
      reason: `Adding this product would reach ${projectedPowerW.toFixed(0)} W total, which is ${exceedBy.toFixed(0)} W above the ${params.inverterMaxPowerW.toFixed(0)} W inverter limit. Shorter run time does not lower inverter load — turn off another product or pick a lower-power one.${headroomText}`,
      totalPowerW: projectedPowerW,
      totalEnergyWh: 0,
      headroomWh: params.availableEnergyWh,
      inverterHeadroomW: inverterHeadroomForDevice,
      limitedRun: null,
    };
  }

  const result = validateNightPlanLoad({
    activeDevices: nextActive,
    darknessMinutes: params.darknessMinutes,
    inverterMaxPowerW: params.inverterMaxPowerW,
    availableEnergyWh: params.availableEnergyWh,
    durationOverrides: overrides,
  });

  const limitedRun =
    result.allowed || result.failureKind === 'inverter'
      ? null
      : suggestLimitedNightRun({
          device: params.device,
          currentActive: othersActive,
          darknessMinutes: params.darknessMinutes,
          inverterMaxPowerW: params.inverterMaxPowerW,
          availableEnergyWh: params.availableEnergyWh,
          durationOverrides: params.durationOverrides,
        });

  return { ...result, limitedRun };
}

export function validateSuggestionSelection(params: {
  selected: NightProductSuggestion[];
  darknessMinutes: number;
  inverterMaxPowerW: number;
  availableEnergyWh: number;
}): NightPlanValidationResult {
  const asDevices = params.selected.map((item) => ({
    id: item.templateId,
    name: item.name,
    power: item.power,
    duration: params.darknessMinutes,
    priority: item.priority,
    essential: item.essential,
    start_time: '00:00',
    end_time: '23:59',
  }));
  return validateNightPlanLoad({
    activeDevices: asDevices,
    darknessMinutes: params.darknessMinutes,
    inverterMaxPowerW: params.inverterMaxPowerW,
    availableEnergyWh: params.availableEnergyWh,
  });
}
