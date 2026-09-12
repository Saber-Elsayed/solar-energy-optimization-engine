import AsyncStorage from '@react-native-async-storage/async-storage';

type Listener = () => void;

const STORAGE_KEY = 'device-disabled-ids';

const disabledDeviceIds = new Set<string>();
const listeners = new Set<Listener>();
let hydratePromise: Promise<void> | null = null;

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

async function persistDisabledDeviceIds(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...disabledDeviceIds]));
  } catch {
    // Ignore persistence errors; in-memory state still applies this session.
  }
}

export function hydrateDeviceEnabledStore(): Promise<void> {
  if (hydratePromise) {
    return hydratePromise;
  }

  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }
      disabledDeviceIds.clear();
      for (const deviceId of parsed) {
        if (typeof deviceId === 'string' && deviceId.length > 0) {
          disabledDeviceIds.add(deviceId);
        }
      }
      notifyListeners();
    } catch {
      // Keep defaults (all devices enabled).
    }
  })();

  return hydratePromise;
}

void hydrateDeviceEnabledStore();

export function isDeviceEnabled(deviceId: string): boolean {
  return !disabledDeviceIds.has(deviceId);
}

export function setDeviceEnabled(deviceId: string, enabled: boolean): void {
  const wasEnabled = isDeviceEnabled(deviceId);
  if (enabled) {
    disabledDeviceIds.delete(deviceId);
  } else {
    disabledDeviceIds.add(deviceId);
  }
  if (wasEnabled !== enabled) {
    void persistDisabledDeviceIds();
    notifyListeners();
  }
}

export function filterEnabledDevices<T extends { id: string }>(devices: T[]): T[] {
  return devices.filter((device) => isDeviceEnabled(device.id));
}

export function pruneDisabledDeviceIds(validDeviceIds: string[]): void {
  if (validDeviceIds.length === 0) {
    return;
  }

  const validIds = new Set(validDeviceIds);
  let changed = false;
  for (const deviceId of disabledDeviceIds) {
    if (!validIds.has(deviceId)) {
      disabledDeviceIds.delete(deviceId);
      changed = true;
    }
  }
  if (changed) {
    void persistDisabledDeviceIds();
    notifyListeners();
  }
}

export function subscribeDeviceEnabled(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
