import type { ApiDevice } from '@/lib/device-types';
import type { RunningPlanSelection } from '@/lib/feasible-selection-store';
import { deviceNightEnergyWh } from '@/lib/night-plan-catalog';
import { getNightRunMinutes } from '@/lib/night-plan-store';
import { deviceEnergyWh, type RunnableCombination } from '@/lib/optimization-catalog';

export type OrBestCombinationResponse = {
  can_run: Array<{
    name: string;
    power: number;
    duration: number;
    priority: number;
    essential: boolean;
    start_time: string;
    end_time: string;
  }>;
  total_power_w: number;
  total_energy_wh: number;
  remaining_energy_wh: number;
  objective_score: number;
  solver_status: string;
};

export type SelectedRunningPlan = {
  source: 'feasible' | 'or-tools' | 'night-plan';
  summary: string;
  devices: ApiDevice[];
  totalPowerW: number;
  totalEnergyWh: number;
};

export function buildNightRunningPlan(
  activeNightDevices: ApiDevice[],
  darknessMinutes: number,
): SelectedRunningPlan | null {
  if (activeNightDevices.length === 0) {
    return null;
  }

  const totalPowerW = activeNightDevices.reduce((sum, device) => sum + device.power, 0);
  const totalEnergyWh = activeNightDevices.reduce((sum, device) => {
    const runMinutes = getNightRunMinutes(device.id, darknessMinutes);
    return sum + deviceNightEnergyWh(device.power, runMinutes);
  }, 0);

  const names = activeNightDevices.map((device) => device.name).join(' + ');
  const hoursLabel = (darknessMinutes / 60).toFixed(1);

  return {
    source: 'night-plan',
    summary: `${names} · ${totalPowerW.toFixed(0)} W · ${totalEnergyWh.toFixed(0)} Wh (night ${hoursLabel}h)`,
    devices: activeNightDevices,
    totalPowerW,
    totalEnergyWh,
  };
}

export function mapOrPlanDevices(orPlan: OrBestCombinationResponse, devices: ApiDevice[]): ApiDevice[] {
  return orPlan.can_run.map((orDevice) => {
    const match = devices.find((device) => device.name === orDevice.name && device.power === orDevice.power);
    if (match) {
      return match;
    }
    return {
      id: `or-${orDevice.name}-${orDevice.power}`,
      name: orDevice.name,
      power: orDevice.power,
      duration: orDevice.duration,
      priority: orDevice.priority,
      essential: orDevice.essential,
      start_time: orDevice.start_time,
      end_time: orDevice.end_time,
    };
  });
}

export function buildOrPlanSummary(devices: ApiDevice[]): string {
  if (devices.length === 0) {
    return 'No devices selected';
  }
  const names = devices.map((device) => device.name).join(' + ');
  const totalPowerW = devices.reduce((sum, device) => sum + device.power, 0);
  const totalEnergyWh = devices.reduce((sum, device) => sum + deviceEnergyWh(device), 0);
  return `${names} · ${totalPowerW.toFixed(0)} W · ${totalEnergyWh.toFixed(0)} Wh energy`;
}

export function resolveSelectedRunningPlan(params: {
  selection: RunningPlanSelection | null;
  allRunnableCombinations: RunnableCombination[];
  orBestPlan: OrBestCombinationResponse | null;
  activeDevices: ApiDevice[];
  nightPlanDevices?: ApiDevice[];
  nightDarknessMinutes?: number;
}): SelectedRunningPlan | null {
  const { selection, allRunnableCombinations, orBestPlan, activeDevices, nightPlanDevices, nightDarknessMinutes } =
    params;

  if (selection?.kind === 'night-plan' && nightPlanDevices && nightDarknessMinutes) {
    return buildNightRunningPlan(nightPlanDevices, nightDarknessMinutes);
  }

  if (selection?.kind === 'feasible') {
    const combo = allRunnableCombinations.find((item) => item.id === selection.combinationId);
    if (!combo) {
      return null;
    }
    return {
      source: 'feasible',
      summary: combo.summary,
      devices: combo.devices,
      totalPowerW: combo.totalPowerW,
      totalEnergyWh: combo.totalEnergyWh,
    };
  }

  if (
    selection?.kind === 'or-tools' &&
    orBestPlan &&
    orBestPlan.can_run.length > 0 &&
    (orBestPlan.solver_status === 'OPTIMAL' || orBestPlan.solver_status === 'FEASIBLE')
  ) {
    const orDevices = mapOrPlanDevices(orBestPlan, activeDevices);
    return {
      source: 'or-tools',
      summary: buildOrPlanSummary(orDevices),
      devices: orDevices,
      totalPowerW: orBestPlan.total_power_w,
      totalEnergyWh: orBestPlan.total_energy_wh,
    };
  }

  return null;
}
