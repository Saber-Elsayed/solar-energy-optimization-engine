import type { ApiDevice } from '@/lib/device-types';

export type InverterPowerSet = {
  id: string;
  devices: ApiDevice[];
  totalPowerW: number;
  essentialCount: number;
  optionalCount: number;
  summary: string;
};

export type InverterPowerCatalog = {
  essentialOnly: InverterPowerSet[];
  optionalOnly: InverterPowerSet[];
  essentialWithOptional: InverterPowerSet[];
  invalid: InverterPowerSet[];
  tooManyDevices: boolean;
};

export type EnergyCombinationSet = {
  id: string;
  devices: ApiDevice[];
  totalEnergyWh: number;
  essentialCount: number;
  optionalCount: number;
  kind: 'essential_only' | 'optional_only' | 'essential_with_optional' | 'invalid';
  summary: string;
};

export type EnergyCombinationCatalog = {
  essentialOnly: EnergyCombinationSet[];
  optionalOnly: EnergyCombinationSet[];
  essentialWithOptional: EnergyCombinationSet[];
  invalid: EnergyCombinationSet[];
  tooManyDevices: boolean;
  noEnergyAvailable: boolean;
};

export type RunnableCombination = {
  id: string;
  devices: ApiDevice[];
  totalPowerW: number;
  totalEnergyWh: number;
  essentialCount: number;
  optionalCount: number;
  category: 'essential_only' | 'optional_only' | 'essential_with_optional';
  summary: string;
};

export type RunnableCombinationCatalog = {
  essentialOnly: RunnableCombination[];
  optionalOnly: RunnableCombination[];
  essentialWithOptional: RunnableCombination[];
  tooManyDevices: boolean;
  noEnergyAvailable: boolean;
};

export const MAX_INVERTER_ENUM_DEVICES = 14;
export const MAX_ENERGY_ENUM_DEVICES = 14;

export function deviceEnergyWh(device: ApiDevice): number {
  return device.power * (device.duration / 60);
}

export function energyForDuration(device: ApiDevice, durationMinutes: number): number {
  return device.power * (durationMinutes / 60);
}

export function buildDevicesCatalogSignature(devices: ApiDevice[]): string {
  return devices
    .map((device) => `${device.id}:${device.power}:${device.duration}:${device.essential}`)
    .sort()
    .join('|');
}

function combinationTotalPowerW(devices: ApiDevice[]): number {
  return devices.reduce((sum, device) => sum + device.power, 0);
}

function combinationTotalEnergyWh(devices: ApiDevice[]): number {
  return devices.reduce((sum, device) => sum + deviceEnergyWh(device), 0);
}

function passesEssentialOptionalRule(devices: ApiDevice[]): boolean {
  const hasOptional = devices.some((device) => !device.essential);
  if (!hasOptional) {
    return true;
  }
  return devices.some((device) => device.essential);
}

function formatInverterCombinationSummary(devices: ApiDevice[]): string {
  const essentialParts = devices
    .filter((device) => device.essential)
    .map((device) => `${device.name} (${device.power} W)`);
  const optionalParts = devices
    .filter((device) => !device.essential)
    .map((device) => `${device.name} (${device.power} W)`);

  const segments: string[] = [];
  if (essentialParts.length > 0) {
    segments.push(`Required: ${essentialParts.join(', ')}`);
  }
  if (optionalParts.length > 0) {
    segments.push(`Optional: ${optionalParts.join(', ')}`);
  }

  const totalPowerW = combinationTotalPowerW(devices);
  return `${segments.join(' · ')} — ${totalPowerW.toFixed(0)} W`;
}

function formatEnergyCombinationSummary(devices: ApiDevice[]): string {
  const essentialParts = devices
    .filter((device) => device.essential)
    .map((device) => `${device.name} (${device.duration} min, ${deviceEnergyWh(device).toFixed(0)} Wh)`);
  const optionalParts = devices
    .filter((device) => !device.essential)
    .map((device) => `${device.name} (${device.duration} min, ${deviceEnergyWh(device).toFixed(0)} Wh)`);

  const segments: string[] = [];
  if (essentialParts.length > 0) {
    segments.push(`Required: ${essentialParts.join(', ')}`);
  }
  if (optionalParts.length > 0) {
    segments.push(`Optional: ${optionalParts.join(', ')}`);
  }

  const totalEnergyWh = combinationTotalEnergyWh(devices);
  return `${segments.join(' · ')} — ${totalEnergyWh.toFixed(0)} Wh`;
}

export function buildInverterPowerCatalog(devices: ApiDevice[], inverterMaxPowerW: number): InverterPowerCatalog {
  if (devices.length === 0) {
    return {
      essentialOnly: [],
      optionalOnly: [],
      essentialWithOptional: [],
      invalid: [],
      tooManyDevices: false,
    };
  }
  if (devices.length > MAX_INVERTER_ENUM_DEVICES) {
    return {
      essentialOnly: [],
      optionalOnly: [],
      essentialWithOptional: [],
      invalid: [],
      tooManyDevices: true,
    };
  }

  const essentialOnly: InverterPowerSet[] = [];
  const optionalOnly: InverterPowerSet[] = [];
  const essentialWithOptional: InverterPowerSet[] = [];
  const invalid: InverterPowerSet[] = [];
  const subsetCount = 1 << devices.length;

  for (let mask = 1; mask < subsetCount; mask += 1) {
    const subset: ApiDevice[] = [];
    for (let index = 0; index < devices.length; index += 1) {
      if (mask & (1 << index)) {
        subset.push(devices[index]);
      }
    }
    const totalPowerW = combinationTotalPowerW(subset);
    const essentialCount = subset.filter((device) => device.essential).length;
    const optionalCount = subset.length - essentialCount;
    const id = subset
      .map((device) => device.id)
      .sort()
      .join('+');
    const entry: InverterPowerSet = {
      id,
      devices: subset,
      totalPowerW,
      essentialCount,
      optionalCount,
      summary: formatInverterCombinationSummary(subset),
    };

    if (totalPowerW > inverterMaxPowerW) {
      invalid.push(entry);
      continue;
    }

    if (optionalCount === 0) {
      essentialOnly.push(entry);
    } else if (essentialCount === 0) {
      optionalOnly.push(entry);
    } else {
      essentialWithOptional.push(entry);
    }
  }

  const sortBySizeThenPower = (a: InverterPowerSet, b: InverterPowerSet) => {
    if (a.devices.length !== b.devices.length) {
      return a.devices.length - b.devices.length;
    }
    return a.totalPowerW - b.totalPowerW;
  };

  essentialOnly.sort(sortBySizeThenPower);
  optionalOnly.sort(sortBySizeThenPower);
  essentialWithOptional.sort(sortBySizeThenPower);
  invalid.sort((a, b) => b.totalPowerW - a.totalPowerW);

  return {
    essentialOnly,
    optionalOnly,
    essentialWithOptional,
    invalid,
    tooManyDevices: false,
  };
}

export function buildEnergyCombinationCatalog(
  devices: ApiDevice[],
  availableEnergyWh: number,
): EnergyCombinationCatalog {
  if (devices.length === 0) {
    return {
      essentialOnly: [],
      optionalOnly: [],
      essentialWithOptional: [],
      invalid: [],
      tooManyDevices: false,
      noEnergyAvailable: availableEnergyWh <= 0,
    };
  }
  if (availableEnergyWh <= 0) {
    return {
      essentialOnly: [],
      optionalOnly: [],
      essentialWithOptional: [],
      invalid: [],
      tooManyDevices: false,
      noEnergyAvailable: true,
    };
  }
  if (devices.length > MAX_ENERGY_ENUM_DEVICES) {
    return {
      essentialOnly: [],
      optionalOnly: [],
      essentialWithOptional: [],
      invalid: [],
      tooManyDevices: true,
      noEnergyAvailable: false,
    };
  }

  const essentialOnly: EnergyCombinationSet[] = [];
  const optionalOnly: EnergyCombinationSet[] = [];
  const essentialWithOptional: EnergyCombinationSet[] = [];
  const invalid: EnergyCombinationSet[] = [];
  const subsetCount = 1 << devices.length;

  for (let mask = 1; mask < subsetCount; mask += 1) {
    const subset: ApiDevice[] = [];
    for (let index = 0; index < devices.length; index += 1) {
      if (mask & (1 << index)) {
        subset.push(devices[index]);
      }
    }

    const totalEnergyWh = combinationTotalEnergyWh(subset);
    const essentialCount = subset.filter((device) => device.essential).length;
    const optionalCount = subset.length - essentialCount;
    const id = subset
      .map((device) => device.id)
      .sort()
      .join('+');
    const fitsEnergy = totalEnergyWh <= availableEnergyWh;
    const fitsEssentialRule = passesEssentialOptionalRule(subset);

    if (!fitsEnergy) {
      const reasons: string[] = [
        `exceeds available energy by ${(totalEnergyWh - availableEnergyWh).toFixed(0)} Wh`,
      ];
      if (optionalCount > 0 && essentialCount > 0 && !fitsEssentialRule) {
        reasons.push('optional devices must run with at least one required device');
      }
      invalid.push({
        id,
        devices: subset,
        totalEnergyWh,
        essentialCount,
        optionalCount,
        kind: 'invalid',
        summary: `${formatEnergyCombinationSummary(subset)} (${reasons.join('; ')})`,
      });
      continue;
    }

    if (optionalCount > 0 && essentialCount > 0 && !fitsEssentialRule) {
      invalid.push({
        id,
        devices: subset,
        totalEnergyWh,
        essentialCount,
        optionalCount,
        kind: 'invalid',
        summary: `${formatEnergyCombinationSummary(subset)} (optional devices must run with at least one required device)`,
      });
      continue;
    }

    const kind: EnergyCombinationSet['kind'] =
      optionalCount === 0
        ? 'essential_only'
        : essentialCount === 0
          ? 'optional_only'
          : 'essential_with_optional';

    const entry: EnergyCombinationSet = {
      id,
      devices: subset,
      totalEnergyWh,
      essentialCount,
      optionalCount,
      kind,
      summary: formatEnergyCombinationSummary(subset),
    };

    if (optionalCount === 0) {
      essentialOnly.push(entry);
    } else if (essentialCount === 0) {
      optionalOnly.push(entry);
    } else {
      essentialWithOptional.push(entry);
    }
  }

  const sortEnergySets = (a: EnergyCombinationSet, b: EnergyCombinationSet) => {
    if (a.devices.length !== b.devices.length) {
      return a.devices.length - b.devices.length;
    }
    return a.totalEnergyWh - b.totalEnergyWh;
  };

  essentialOnly.sort(sortEnergySets);
  optionalOnly.sort(sortEnergySets);
  essentialWithOptional.sort(sortEnergySets);
  invalid.sort((a, b) => b.totalEnergyWh - a.totalEnergyWh);

  return {
    essentialOnly,
    optionalOnly,
    essentialWithOptional,
    invalid,
    tooManyDevices: false,
    noEnergyAvailable: false,
  };
}

function formatRunnableCombinationSummary(devices: ApiDevice[]): string {
  const powerSummary = formatInverterCombinationSummary(devices);
  const totalEnergyWh = combinationTotalEnergyWh(devices);
  return `${powerSummary} · ${totalEnergyWh.toFixed(0)} Wh energy`;
}

export function buildRunnableCombinationCatalog(
  devices: ApiDevice[],
  inverterMaxPowerW: number,
  availableEnergyWh: number,
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
  if (availableEnergyWh <= 0) {
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

    const totalPowerW = combinationTotalPowerW(subset);
    const totalEnergyWh = combinationTotalEnergyWh(subset);
    const essentialCount = subset.filter((device) => device.essential).length;
    const optionalCount = subset.length - essentialCount;
    const id = subset
      .map((device) => device.id)
      .sort()
      .join('+');

    const fitsInverter = totalPowerW <= inverterMaxPowerW;
    const fitsEnergyLimit = totalEnergyWh <= availableEnergyWh;
    const fitsEnergyRules =
      fitsEnergyLimit && (essentialCount === 0 || passesEssentialOptionalRule(subset));
    if (!fitsInverter || !fitsEnergyRules) {
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
        optionalCount === 0
          ? 'essential_only'
          : essentialCount === 0
            ? 'optional_only'
            : 'essential_with_optional',
      summary: formatRunnableCombinationSummary(subset),
    };

    if (optionalCount === 0) {
      essentialOnly.push(entry);
    } else if (essentialCount === 0) {
      optionalOnly.push(entry);
    } else {
      essentialWithOptional.push(entry);
    }
  }

  const sortRunnable = (a: RunnableCombination, b: RunnableCombination) => {
    if (a.devices.length !== b.devices.length) {
      return a.devices.length - b.devices.length;
    }
    return a.totalEnergyWh - b.totalEnergyWh;
  };

  essentialOnly.sort(sortRunnable);
  optionalOnly.sort(sortRunnable);
  essentialWithOptional.sort(sortRunnable);

  return {
    essentialOnly,
    optionalOnly,
    essentialWithOptional,
    tooManyDevices: false,
    noEnergyAvailable: false,
  };
}
