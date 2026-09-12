import AsyncStorage from '@react-native-async-storage/async-storage';

import { setDeviceEnabled } from '@/lib/device-enabled-store';
import {
  clearRunningPlanSelection,
  getRunningPlanSelection,
  setNightPlanRunningPlan,
} from '@/lib/feasible-selection-store';

type Listener = () => void;

const MEMBER_STORAGE_KEY = 'night-plan-member-ids';
const DISABLED_STORAGE_KEY = 'night-plan-disabled-ids';
const HOME_SQM_STORAGE_KEY = 'night-plan-home-sqm';
const SETUP_COMPLETE_STORAGE_KEY = 'night-plan-setup-complete';
const DURATION_OVERRIDE_STORAGE_KEY = 'night-plan-duration-overrides';
const MODE_ACTIVE_STORAGE_KEY = 'night-plan-mode-active';

const memberDeviceIds = new Set<string>();
const disabledDeviceIds = new Set<string>();
const nightDurationMinutesByDeviceId: Record<string, number> = {};
let homeSqm: number | null = null;
let setupComplete = false;
let nightPlanModeActive = false;
let lastDarknessMinutes = 12 * 60;
const listeners = new Set<Listener>();
let hydratePromise: Promise<void> | null = null;
let storeHydrated = false;
let isHydrating = false;
let mutatedWhileHydrating = false;

export type EnterNightPlanResult =
  | { ok: true }
  | { ok: false; reason: 'no-members' | 'setup-incomplete' };

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function markStoreMutated(): void {
  if (isHydrating) {
    mutatedWhileHydrating = true;
  }
}

export function isNightPlanStoreHydrated(): boolean {
  return storeHydrated;
}

function syncNightPlanRunningSelection(): void {
  try {
    if (!nightPlanModeActive) {
      return;
    }
    const hasEnabledMember = [...memberDeviceIds].some((id) => !disabledDeviceIds.has(id));
    if (hasEnabledMember) {
      setNightPlanRunningPlan();
      return;
    }
    if (getRunningPlanSelection()?.kind === 'night-plan') {
      clearRunningPlanSelection();
    }
  } catch {
    // Running-plan sync must not block night plan mode.
  }
}

export function getLastNightDarknessMinutes(): number {
  return lastDarknessMinutes;
}

export function setLastNightDarknessMinutes(minutes: number): void {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded === lastDarknessMinutes) {
    return;
  }
  lastDarknessMinutes = rounded;
  notifyListeners();
}

async function persistSets(): Promise<void> {
  try {
    const entries: [string, string][] = [
      [MEMBER_STORAGE_KEY, JSON.stringify([...memberDeviceIds])],
      [DISABLED_STORAGE_KEY, JSON.stringify([...disabledDeviceIds])],
      [SETUP_COMPLETE_STORAGE_KEY, JSON.stringify(setupComplete)],
      [DURATION_OVERRIDE_STORAGE_KEY, JSON.stringify(nightDurationMinutesByDeviceId)],
      [MODE_ACTIVE_STORAGE_KEY, JSON.stringify(nightPlanModeActive)],
    ];
    if (homeSqm !== null) {
      entries.push([HOME_SQM_STORAGE_KEY, JSON.stringify(homeSqm)]);
    }
    await AsyncStorage.multiSet(entries);
  } catch {
    // In-memory state still applies for this session.
  }
}

export function hydrateNightPlanStore(): Promise<void> {
  if (hydratePromise) {
    return hydratePromise;
  }

  isHydrating = true;
  mutatedWhileHydrating = false;

  hydratePromise = (async () => {
    try {
      const pairs = await AsyncStorage.multiGet([
        MEMBER_STORAGE_KEY,
        DISABLED_STORAGE_KEY,
        HOME_SQM_STORAGE_KEY,
        SETUP_COMPLETE_STORAGE_KEY,
        DURATION_OVERRIDE_STORAGE_KEY,
        MODE_ACTIVE_STORAGE_KEY,
      ]);
      const memberRaw = pairs.find(([key]) => key === MEMBER_STORAGE_KEY)?.[1];
      const disabledRaw = pairs.find(([key]) => key === DISABLED_STORAGE_KEY)?.[1];
      const homeSqmRaw = pairs.find(([key]) => key === HOME_SQM_STORAGE_KEY)?.[1];
      const setupRaw = pairs.find(([key]) => key === SETUP_COMPLETE_STORAGE_KEY)?.[1];

      if (mutatedWhileHydrating) {
        notifyListeners();
        syncNightPlanRunningSelection();
        return;
      }

      memberDeviceIds.clear();
      if (memberRaw) {
        const parsed = JSON.parse(memberRaw) as unknown;
        if (Array.isArray(parsed)) {
          for (const deviceId of parsed) {
            if (typeof deviceId === 'string' && deviceId.length > 0) {
              memberDeviceIds.add(deviceId);
            }
          }
        }
      }

      disabledDeviceIds.clear();
      if (disabledRaw) {
        const parsed = JSON.parse(disabledRaw) as unknown;
        if (Array.isArray(parsed)) {
          for (const deviceId of parsed) {
            if (typeof deviceId === 'string' && deviceId.length > 0) {
              disabledDeviceIds.add(deviceId);
            }
          }
        }
      }
      homeSqm = null;
      if (homeSqmRaw) {
        const parsedSqm = JSON.parse(homeSqmRaw) as unknown;
        if (typeof parsedSqm === 'number' && parsedSqm > 0) {
          homeSqm = parsedSqm;
        }
      }

      setupComplete = false;
      if (setupRaw) {
        const parsedSetup = JSON.parse(setupRaw) as unknown;
        setupComplete = parsedSetup === true;
      }

      const durationRaw = pairs.find(([key]) => key === DURATION_OVERRIDE_STORAGE_KEY)?.[1];
      for (const key of Object.keys(nightDurationMinutesByDeviceId)) {
        delete nightDurationMinutesByDeviceId[key];
      }
      if (durationRaw) {
        const parsedDuration = JSON.parse(durationRaw) as unknown;
        if (parsedDuration && typeof parsedDuration === 'object') {
          for (const [deviceId, minutes] of Object.entries(parsedDuration)) {
            if (typeof minutes === 'number' && minutes > 0) {
              nightDurationMinutesByDeviceId[deviceId] = Math.round(minutes);
            }
          }
        }
      }

      const modeRaw = pairs.find(([key]) => key === MODE_ACTIVE_STORAGE_KEY)?.[1];
      nightPlanModeActive = false;
      if (modeRaw) {
        const parsedMode = JSON.parse(modeRaw) as unknown;
        nightPlanModeActive = parsedMode === true;
      }

      if (nightPlanModeActive && memberDeviceIds.size > 0) {
        setAllNightPlanMembersEnabled(true);
      }

      notifyListeners();
      syncNightPlanRunningSelection();
    } catch {
      // Defaults: no night plan members.
    } finally {
      isHydrating = false;
      storeHydrated = true;
    }
  })();

  return hydratePromise;
}

void hydrateNightPlanStore();

export function isNightPlanMember(deviceId: string): boolean {
  return memberDeviceIds.has(deviceId);
}

export function setNightPlanMember(deviceId: string, member: boolean): void {
  markStoreMutated();
  if (member) {
    memberDeviceIds.add(deviceId);
  } else {
    memberDeviceIds.delete(deviceId);
    disabledDeviceIds.delete(deviceId);
    delete nightDurationMinutesByDeviceId[deviceId];
  }
  void persistSets();
  notifyListeners();
  syncNightPlanRunningSelection();
}

export function getNightDurationOverrides(): Readonly<Record<string, number>> {
  return nightDurationMinutesByDeviceId;
}

export function getNightRunMinutes(deviceId: string, darknessMinutes: number): number {
  const override = nightDurationMinutesByDeviceId[deviceId];
  if (override !== undefined && override > 0) {
    return Math.min(Math.round(override), darknessMinutes);
  }
  return darknessMinutes;
}

export function setNightRunMinutes(deviceId: string, minutes: number): void {
  markStoreMutated();
  const rounded = Math.max(1, Math.round(minutes));
  nightDurationMinutesByDeviceId[deviceId] = rounded;
  void persistSets();
  notifyListeners();
  syncNightPlanRunningSelection();
}

export function clearNightRunMinutes(deviceId: string): void {
  markStoreMutated();
  if (deviceId in nightDurationMinutesByDeviceId) {
    delete nightDurationMinutesByDeviceId[deviceId];
    void persistSets();
    notifyListeners();
  }
}

export function isNightPlanDeviceEnabled(deviceId: string): boolean {
  return memberDeviceIds.has(deviceId) && !disabledDeviceIds.has(deviceId);
}

export function setNightPlanDeviceEnabled(deviceId: string, enabled: boolean): void {
  markStoreMutated();
  if (!memberDeviceIds.has(deviceId)) {
    return;
  }
  const wasEnabled = isNightPlanDeviceEnabled(deviceId);
  if (enabled) {
    disabledDeviceIds.delete(deviceId);
  } else {
    disabledDeviceIds.add(deviceId);
  }
  if (wasEnabled !== enabled) {
    void persistSets();
    notifyListeners();
    syncNightPlanRunningSelection();
  }
}

export function pruneNightPlanDeviceIds(validDeviceIds: string[]): void {
  const validIds = new Set(validDeviceIds);
  let changed = false;
  for (const deviceId of memberDeviceIds) {
    if (!validIds.has(deviceId)) {
      memberDeviceIds.delete(deviceId);
      changed = true;
    }
  }
  for (const deviceId of disabledDeviceIds) {
    if (!validIds.has(deviceId)) {
      disabledDeviceIds.delete(deviceId);
      changed = true;
    }
  }
  for (const deviceId of Object.keys(nightDurationMinutesByDeviceId)) {
    if (!validIds.has(deviceId)) {
      delete nightDurationMinutesByDeviceId[deviceId];
      changed = true;
    }
  }
  if (changed) {
    if (memberDeviceIds.size === 0 && setupComplete) {
      setupComplete = false;
      nightPlanModeActive = false;
      if (getRunningPlanSelection()?.kind === 'night-plan') {
        clearRunningPlanSelection();
      }
    }
    void persistSets();
    notifyListeners();
  }
}

export function getHomeSqm(): number | null {
  return homeSqm;
}

export function setHomeSqm(sqm: number): void {
  markStoreMutated();
  const rounded = Math.round(sqm);
  if (rounded <= 0) {
    return;
  }
  homeSqm = rounded;
  setupComplete = false;
  void persistSets();
  notifyListeners();
}

export function resetNightPlanHomeProfile(): void {
  markStoreMutated();
  homeSqm = null;
  setupComplete = false;
  void persistSets();
  notifyListeners();
}

export function isNightSetupComplete(): boolean {
  return setupComplete;
}

export function setNightSetupComplete(complete: boolean): void {
  markStoreMutated();
  setupComplete = complete;
  if (!complete) {
    nightPlanModeActive = false;
  }
  void persistSets();
  notifyListeners();
}

export function isNightPlanModeActive(): boolean {
  return nightPlanModeActive;
}

export function setNightPlanModeActive(active: boolean): void {
  markStoreMutated();
  nightPlanModeActive = active;
  void persistSets();
  notifyListeners();
}

/** Turn all night-plan products on or off (Active tonight + dashboard catalog). */
export function setAllNightPlanMembersEnabled(enabled: boolean): void {
  markStoreMutated();
  if (enabled) {
    disabledDeviceIds.clear();
  } else {
    for (const deviceId of memberDeviceIds) {
      disabledDeviceIds.add(deviceId);
    }
  }
  for (const deviceId of memberDeviceIds) {
    setDeviceEnabled(deviceId, enabled);
  }
  void persistSets();
  notifyListeners();
  if (nightPlanModeActive && enabled) {
    syncNightPlanRunningSelection();
  }
}

/** @deprecated Use setAllNightPlanMembersEnabled(true) */
export function enableAllNightPlanMembers(): void {
  setAllNightPlanMembersEnabled(true);
}

/** @deprecated Use setAllNightPlanMembersEnabled(false) */
export function disableAllNightPlanMembers(): void {
  setAllNightPlanMembersEnabled(false);
}

export function getNightPlanMemberIds(): string[] {
  return [...memberDeviceIds];
}

/** Turn on night plan mode (dashboard uses night discharge rules). */
export function enterNightPlanMode(): EnterNightPlanResult {
  markStoreMutated();
  if (memberDeviceIds.size === 0) {
    return { ok: false, reason: 'no-members' };
  }
  if (!setupComplete) {
    setupComplete = true;
  }
  nightPlanModeActive = true;
  setAllNightPlanMembersEnabled(true);
  syncNightPlanRunningSelection();
  return { ok: true };
}

/** Leave night plan mode; turn off all night products and remove them from the running plan. */
export function exitNightPlanMode(): void {
  markStoreMutated();
  nightPlanModeActive = false;
  setAllNightPlanMembersEnabled(false);
  if (getRunningPlanSelection()?.kind === 'night-plan') {
    clearRunningPlanSelection();
  }
  void persistSets();
  notifyListeners();
}

export function subscribeNightPlanStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
