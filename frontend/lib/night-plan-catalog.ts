import type { ApiDevice } from '@/lib/device-types';
import {
  MAX_INVERTER_ENUM_DEVICES,
  type RunnableCombination,
  type RunnableCombinationCatalog,
} from '@/lib/optimization-catalog';

export type NightWindow = {
  city: string;
  sunset: string;
  sunrise: string;
  darkness_minutes: number;
  is_currently_dark: boolean;
  discharge_only: boolean;
  guidance: string;
};

export type NightDeviceAssessment = {
  device: ApiDevice;
  nightEnergyWh: number;
  fitsInverterAlone: boolean;
  fitsEnergyAlone: boolean;
  canRunAllNight: boolean;
  blockedReason: string | null;
};

export function deviceNightEnergyWh(powerW: number, darknessMinutes: number): number {
  return powerW * (darknessMinutes / 60);
}

export function assessNightDevice(params: {
  device: ApiDevice;
  darknessMinutes: number;
  inverterMaxPowerW: number;
  availableEnergyWh: number;
  runMinutes?: number;
}): NightDeviceAssessment {
  const { device, darknessMinutes, inverterMaxPowerW, availableEnergyWh } = params;
  const runtimeMinutes = params.runMinutes ?? darknessMinutes;
  const nightEnergyWh = deviceNightEnergyWh(device.power, runtimeMinutes);
  const fitsInverterAlone = device.power <= inverterMaxPowerW;
  const fitsEnergyAlone = nightEnergyWh <= availableEnergyWh;
  const canRunAllNight = fitsInverterAlone && fitsEnergyAlone;

  let blockedReason: string | null = null;
  if (!fitsInverterAlone) {
    blockedReason = `Power ${device.power.toFixed(0)} W exceeds inverter limit ${inverterMaxPowerW.toFixed(0)} W.`;
  } else if (!fitsEnergyAlone) {
    blockedReason = `Night use needs ${nightEnergyWh.toFixed(0)} Wh but only ${availableEnergyWh.toFixed(0)} Wh is available (discharge only).`;
  }

  return {
    device,
    nightEnergyWh,
    fitsInverterAlone,
    fitsEnergyAlone,
    canRunAllNight,
    blockedReason,
  };
}

function passesEssentialOptionalRule(devices: ApiDevice[]): boolean {
  const hasOptional = devices.some((device) => !device.essential);
  if (!hasOptional) {
    return true;
  }
  return devices.some((device) => device.essential);
}

function formatNightCombinationSummary(devices: ApiDevice[], darknessMinutes: number): string {
  const names = devices.map((device) => device.name).join(' + ');
  const totalPowerW = devices.reduce((sum, device) => sum + device.power, 0);
  const totalEnergyWh = devices.reduce((sum, device) => sum + deviceNightEnergyWh(device.power, darknessMinutes), 0);
  const hours = (darknessMinutes / 60).toFixed(1);
  return `${names} · ${totalPowerW.toFixed(0)} W · ${totalEnergyWh.toFixed(0)} Wh for ${hours}h darkness`;
}

export function buildNightRunnableCombinationCatalog(
  devices: ApiDevice[],
  inverterMaxPowerW: number,
  availableEnergyWh: number,
  darknessMinutes: number,
  durationOverrides?: Record<string, number>,
): RunnableCombinationCatalog {
  if (devices.length === 0) {
    return {
      essentialOnly: [],
      optionalOnly: [],
      essentialWithOptional: [],
      tooManyDevices: false,
      noEnergyAvailable: availableEnergyWh <= 0,
    };
  }
  if (availableEnergyWh <= 0 || darknessMinutes <= 0) {
    return {
      essentialOnly: [],
      optionalOnly: [],
      essentialWithOptional: [],
      tooManyDevices: false,
      noEnergyAvailable: true,
    };
  }
  if (devices.length > MAX_INVERTER_ENUM_DEVICES) {
    return {
      essentialOnly: [],
      optionalOnly: [],
      essentialWithOptional: [],
      tooManyDevices: true,
      noEnergyAvailable: false,
    };
  }

  const essentialOnly: RunnableCombination[] = [];
  const optionalOnly: RunnableCombination[] = [];
  const essentialWithOptional: RunnableCombination[] = [];
  const subsetCount = 1 << devices.length;

  for (let mask = 1; mask < subsetCount; mask += 1) {
    const subset: ApiDevice[] = [];
    for (let index = 0; index < devices.length; index += 1) {
      if (mask & (1 << index)) {
        subset.push(devices[index]);
      }
    }

    const totalPowerW = subset.reduce((sum, device) => sum + device.power, 0);
    const totalEnergyWh = subset.reduce((sum, device) => {
      const runMinutes = durationOverrides?.[device.id] ?? darknessMinutes;
      return sum + deviceNightEnergyWh(device.power, Math.min(runMinutes, darknessMinutes));
    }, 0);
    const essentialCount = subset.filter((device) => device.essential).length;
    const optionalCount = subset.length - essentialCount;
    const id = subset
      .map((device) => device.id)
      .sort()
      .join('+');

    const fitsInverter = totalPowerW <= inverterMaxPowerW;
    const fitsEnergy = totalEnergyWh <= availableEnergyWh;
    const fitsRules = essentialCount === 0 || passesEssentialOptionalRule(subset);
    if (!fitsInverter || !fitsEnergy || !fitsRules) {
      continue;
    }

    const entry: RunnableCombination = {
      id,
      devices: subset,
      totalPowerW,
      totalEnergyWh,
      essentialCount,
      optionalCount,
      category:
        optionalCount === 0 ? 'essential_only' : essentialCount === 0 ? 'optional_only' : 'essential_with_optional',
      summary: formatNightCombinationSummary(subset, darknessMinutes),
    };

    if (optionalCount === 0) {
      essentialOnly.push(entry);
    } else if (essentialCount === 0) {
      optionalOnly.push(entry);
    } else {
      essentialWithOptional.push(entry);
    }
  }

  const sortCombos = (a: RunnableCombination, b: RunnableCombination) => {
    if (a.devices.length !== b.devices.length) {
      return a.devices.length - b.devices.length;
    }
    return a.totalEnergyWh - b.totalEnergyWh;
  };

  essentialOnly.sort(sortCombos);
  optionalOnly.sort(sortCombos);
  essentialWithOptional.sort(sortCombos);

  return {
    essentialOnly,
    optionalOnly,
    essentialWithOptional,
    tooManyDevices: false,
    noEnergyAvailable: false,
  };
}
