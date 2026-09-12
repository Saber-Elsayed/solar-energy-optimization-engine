import type { ApiDevice } from '@/lib/device-types';
import { deviceEnergyWh, energyForDuration } from '@/lib/optimization-catalog';

export type DeviceDecision = {
  device: ApiDevice;
  deviceEnergyWh: number;
  reason?: string;
  constraint?: 'inverter_power' | 'available_energy';
  remainingEnergyWhAtBlock?: number;
};

export type AlternativeCombination = {
  id: string;
  blockedDevice: ApiDevice;
  constraint: 'inverter_power' | 'available_energy';
  removeDevices: ApiDevice[];
  addDevices: ApiDevice[];
  summary: string;
};

export type DurationReductionSuggestion = {
  id: string;
  device: ApiDevice;
  originalDurationMinutes: number;
  suggestedDurationMinutes: number;
  reduceByMinutes: number;
  suggestedEnergyWh: number;
  summary: string;
};

function maxRunnableDurationMinutes(device: ApiDevice, availableEnergyWh: number): number {
  if (device.power <= 0 || availableEnergyWh <= 0) return 0;
  return Math.floor((availableEnergyWh / device.power) * 60);
}

function buildDurationReductionSuggestions(blocked: DeviceDecision[]): DurationReductionSuggestion[] {
  const suggestions: DurationReductionSuggestion[] = [];

  for (const item of blocked) {
    if (item.constraint !== 'available_energy') continue;

    const remainingEnergyWh = item.remainingEnergyWhAtBlock ?? 0;
    const originalDurationMinutes = item.device.duration;
    const maxDurationMinutes = maxRunnableDurationMinutes(item.device, remainingEnergyWh);

    if (maxDurationMinutes <= 0) {
      const deficitWh = Math.max(0, item.deviceEnergyWh - remainingEnergyWh);
      suggestions.push({
        id: `${item.device.id}|none`,
        device: item.device,
        originalDurationMinutes,
        suggestedDurationMinutes: 0,
        reduceByMinutes: originalDurationMinutes,
        suggestedEnergyWh: 0,
        summary: `Not enough energy (${deficitWh.toFixed(0)} Wh short) to run even 1 minute.`,
      });
      continue;
    }

    if (maxDurationMinutes >= originalDurationMinutes) continue;

    const reduceByMinutes = originalDurationMinutes - maxDurationMinutes;
    const suggestedEnergyWh = energyForDuration(item.device, maxDurationMinutes);
    suggestions.push({
      id: `${item.device.id}|${maxDurationMinutes}`,
      device: item.device,
      originalDurationMinutes,
      suggestedDurationMinutes: maxDurationMinutes,
      reduceByMinutes,
      suggestedEnergyWh,
      summary: `Reduce usage by ${reduceByMinutes} min (${originalDurationMinutes} → ${maxDurationMinutes} min) to run within available energy (${suggestedEnergyWh.toFixed(0)} Wh).`,
    });
  }

  return suggestions;
}

function getConstraintKind(reason?: string): 'inverter_power' | 'available_energy' | null {
  if (reason?.includes('inverter limit')) return 'inverter_power';
  if (
    reason?.includes('available energy') ||
    reason?.includes('battery capacity') ||
    reason?.includes('Not enough')
  ) {
    return 'available_energy';
  }
  return null;
}

function combinationFits(devices: ApiDevice[], availableEnergyWh: number, inverterMaxPowerW: number): boolean {
  const totalPower = devices.reduce((sum, device) => sum + device.power, 0);
  const totalEnergy = devices.reduce((sum, device) => sum + deviceEnergyWh(device), 0);
  return totalPower <= inverterMaxPowerW && totalEnergy <= availableEnergyWh;
}

function expandBlockedDevicesIntoCombination(
  baseDevices: ApiDevice[],
  blockedPool: ApiDevice[],
  availableEnergyWh: number,
  inverterMaxPowerW: number,
  mustInclude?: ApiDevice,
): ApiDevice[] {
  const added: ApiDevice[] = [];
  let current = [...baseDevices];
  const sortedPool = [...blockedPool].sort((a, b) => deviceEnergyWh(a) - deviceEnergyWh(b));

  if (mustInclude && !current.some((device) => device.id === mustInclude.id)) {
    if (combinationFits([...current, mustInclude], availableEnergyWh, inverterMaxPowerW)) {
      current.push(mustInclude);
      added.push(mustInclude);
    } else {
      return [];
    }
  }

  for (const device of sortedPool) {
    if (current.some((item) => item.id === device.id)) continue;
    if (!combinationFits([...current, device], availableEnergyWh, inverterMaxPowerW)) continue;
    current.push(device);
    added.push(device);
  }

  return added;
}

function formatAlternativeSummary(removeDevices: ApiDevice[], addDevices: ApiDevice[]): string {
  const addNames = addDevices.map((device) => device.name).join(', ');
  if (removeDevices.length === 0) {
    return `You can add: ${addNames}`;
  }
  const removeNames = removeDevices.map((device) => device.name).join(', ');
  return `Remove ${removeNames} to run: ${addNames}`;
}

function buildAlternativeCombinations(
  allowed: DeviceDecision[],
  blocked: DeviceDecision[],
  availableEnergyWh: number,
  inverterMaxPowerW: number,
  activePowerW: number,
  remainingEnergyWh: number,
): AlternativeCombination[] {
  const allowedDevices = allowed.map((item) => item.device);
  const removableOptional = allowedDevices.filter((device) => !device.essential);
  const constraintBlocked = blocked.filter((item) => getConstraintKind(item.reason) !== null);
  const blockedPool = constraintBlocked.map((item) => item.device);

  if (constraintBlocked.length === 0) {
    return [];
  }

  const suggestions: AlternativeCombination[] = [];
  const seen = new Set<string>();

  const pushSuggestion = (
    blockedDevice: ApiDevice,
    constraint: 'inverter_power' | 'available_energy',
    removeDevices: ApiDevice[],
    addDevices: ApiDevice[],
  ) => {
    if (addDevices.length === 0) return;
    const key = [
      blockedDevice.id,
      removeDevices
        .map((device) => device.id)
        .sort()
        .join('+'),
      addDevices
        .map((device) => device.id)
        .sort()
        .join('+'),
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push({
      id: key,
      blockedDevice,
      constraint,
      removeDevices,
      addDevices,
      summary: formatAlternativeSummary(removeDevices, addDevices),
    });
  };

  for (const blockedItem of constraintBlocked) {
    const target = blockedItem.device;
    const constraint = getConstraintKind(blockedItem.reason)!;

    for (const remove of removableOptional) {
      const base = allowedDevices.filter((device) => device.id !== remove.id);
      const addDevices = expandBlockedDevicesIntoCombination(
        base,
        blockedPool,
        availableEnergyWh,
        inverterMaxPowerW,
        target,
      );
      pushSuggestion(target, constraint, [remove], addDevices);
    }

    for (let i = 0; i < removableOptional.length; i += 1) {
      for (let j = i + 1; j < removableOptional.length; j += 1) {
        const removeDevices = [removableOptional[i], removableOptional[j]];
        const removeIds = new Set(removeDevices.map((device) => device.id));
        const base = allowedDevices.filter((device) => !removeIds.has(device.id));
        const addDevices = expandBlockedDevicesIntoCombination(
          base,
          blockedPool,
          availableEnergyWh,
          inverterMaxPowerW,
          target,
        );
        pushSuggestion(target, constraint, removeDevices, addDevices);
      }
    }

    if (target.power <= inverterMaxPowerW - activePowerW && deviceEnergyWh(target) <= remainingEnergyWh) {
      pushSuggestion(target, constraint, [], [target]);
    }
  }

  const powerSlack = inverterMaxPowerW - activePowerW;
  const energySlack = remainingEnergyWh;
  for (const blockedItem of constraintBlocked) {
    const device = blockedItem.device;
    if (device.power > powerSlack || deviceEnergyWh(device) > energySlack) continue;
    if (allowedDevices.some((allowedDevice) => allowedDevice.id === device.id)) continue;
    pushSuggestion(device, getConstraintKind(blockedItem.reason)!, [], [device]);
  }

  return suggestions.slice(0, 12);
}

export function optimizeDevices(devices: ApiDevice[], availableEnergyWh: number, inverterMaxPowerW: number) {
  let remainingEnergyWh = availableEnergyWh;
  let activePowerW = 0;
  const allowed: DeviceDecision[] = [];
  const blocked: DeviceDecision[] = [];
  const priorityFirstDevices = [...devices].sort((a, b) => {
    if (a.essential !== b.essential) {
      return a.essential ? -1 : 1;
    }
    return b.priority - a.priority;
  });
  const mandatoryDevices = priorityFirstDevices.filter((d) => d.essential);
  const optionalDevices = priorityFirstDevices.filter((d) => !d.essential);

  const evaluateDevice = (device: ApiDevice, category: 'mandatory' | 'optional') => {
    const usageHours = device.duration / 60;
    const requiredEnergyWh = device.power * usageHours;
    const projectedPowerW = activePowerW + device.power;

    if (projectedPowerW > inverterMaxPowerW) {
      blocked.push({
        device,
        deviceEnergyWh: requiredEnergyWh,
        reason: `Total active power (${projectedPowerW.toFixed(0)} W) exceeds inverter limit (${inverterMaxPowerW.toFixed(0)} W).`,
        constraint: 'inverter_power',
      });
      return;
    }

    if (requiredEnergyWh > remainingEnergyWh) {
      blocked.push({
        device,
        deviceEnergyWh: requiredEnergyWh,
        reason: device.essential ? 'Not enough available energy' : 'Exceeds remaining battery capacity',
        constraint: 'available_energy',
        remainingEnergyWhAtBlock: remainingEnergyWh,
      });
      return;
    }

    allowed.push({ device, deviceEnergyWh: requiredEnergyWh });
    remainingEnergyWh -= requiredEnergyWh;
    activePowerW += device.power;
  };

  for (const device of mandatoryDevices) {
    evaluateDevice(device, 'mandatory');
  }
  for (const device of optionalDevices) {
    evaluateDevice(device, 'optional');
  }

  const blockedMandatoryCount = blocked.filter((item) => item.device.essential).length;
  const blockedOptionalCount = blocked.filter((item) => !item.device.essential).length;

  return {
    allowed,
    blocked,
    remainingEnergyWh,
    activePowerW,
    blockedMandatoryCount,
    blockedOptionalCount,
    alternatives: buildAlternativeCombinations(
      allowed,
      blocked,
      availableEnergyWh,
      inverterMaxPowerW,
      activePowerW,
      remainingEnergyWh,
    ),
    durationSuggestions: buildDurationReductionSuggestions(blocked),
  };
}
