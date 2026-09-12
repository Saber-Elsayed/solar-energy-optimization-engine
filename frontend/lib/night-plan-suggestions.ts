import type { ApiDevice } from '@/lib/device-types';
import { deviceNightEnergyWh } from '@/lib/night-plan-catalog';

export type NightProductSuggestion = {
  templateId: string;
  name: string;
  power: number;
  essential: boolean;
  priority: number;
  description: string;
};

export type HomeLightingEstimate = {
  roomCount: number;
  indoorLightPoints: number;
  outdoorLightPoints: number;
};

export type NightSuggestionBundle = {
  homeSqm: number;
  lighting: HomeLightingEstimate;
  suggestions: NightProductSuggestion[];
};

/** Estimate rooms and light points from floor area (minimal night footprint). */
export function estimateHomeLighting(homeSqm: number): HomeLightingEstimate {
  const safeSqm = Math.max(20, Math.min(400, Math.round(homeSqm)));
  const roomCount = Math.max(2, Math.round(safeSqm / 28));
  const indoorLightPoints = Math.max(4, Math.round(roomCount * 1.5 + 2));
  const outdoorLightPoints = safeSqm >= 120 ? 6 : safeSqm >= 80 ? 4 : safeSqm >= 45 ? 2 : 1;
  return { roomCount, indoorLightPoints, outdoorLightPoints };
}

/**
 * Low average power (W) for devices that run through darkness — not every bulb at full power all night.
 */
export function buildNightProductSuggestions(homeSqm: number): NightSuggestionBundle {
  const lighting = estimateHomeLighting(homeSqm);
  const { indoorLightPoints, outdoorLightPoints } = lighting;

  const indoorLightingPower = Math.max(12, Math.round(indoorLightPoints * 7 * 0.35));
  const outdoorLightingPower = Math.max(6, Math.round(outdoorLightPoints * 8 * 0.3));

  const suggestions: NightProductSuggestion[] = [
    {
      templateId: 'night-indoor-lights',
      name: 'Indoor night lighting (minimal)',
      power: indoorLightingPower,
      essential: true,
      priority: 4,
      description: `${indoorLightPoints} points · low LED average for hallway/night use only`,
    },
    {
      templateId: 'night-outdoor-lights',
      name: 'Outdoor security lighting (minimal)',
      power: outdoorLightingPower,
      essential: true,
      priority: 3,
      description: `${outdoorLightPoints} points · entry/path only, not full yard flood`,
    },
    {
      templateId: 'night-fridge',
      name: 'Refrigerator',
      power: 80,
      essential: true,
      priority: 5,
      description: 'Average compressor load (not peak startup)',
    },
    {
      templateId: 'night-router',
      name: 'Router / modem',
      power: 12,
      essential: true,
      priority: 4,
      description: 'Always-on connectivity',
    },
    {
      templateId: 'night-security',
      name: 'Alarm / cameras hub',
      power: 8,
      essential: true,
      priority: 5,
      description: 'Security panel or camera base load',
    },
  ];

  return {
    homeSqm: Math.round(homeSqm),
    lighting,
    suggestions,
  };
}

export function suggestionToDevicePayload(
  suggestion: NightProductSuggestion,
  darknessMinutes: number,
): Omit<ApiDevice, 'id'> {
  const duration = Math.max(60, darknessMinutes);
  return {
    name: suggestion.name,
    power: suggestion.power,
    duration,
    priority: suggestion.priority,
    essential: suggestion.essential,
    start_time: '00:00',
    end_time: '23:59',
  };
}

export function totalNightLoad(
  devices: Array<Pick<ApiDevice, 'power'>>,
  darknessMinutes: number,
): { totalPowerW: number; totalEnergyWh: number } {
  const totalPowerW = devices.reduce((sum, device) => sum + device.power, 0);
  const totalEnergyWh = devices.reduce(
    (sum, device) => sum + deviceNightEnergyWh(device.power, darknessMinutes),
    0,
  );
  return { totalPowerW, totalEnergyWh };
}
