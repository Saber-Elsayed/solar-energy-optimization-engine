import { useCallback, useEffect, useState } from 'react';

import { AUTH_TOKEN_MISSING_ERROR, authFetch, isUnauthorized } from '@/lib/api';

type EnergyDataItem = {
  voltage?: number;
  current?: number;
  soc?: number;
};

type UseEnergyPollingParams = {
  energyLatestUrl: string;
  pollMs?: number;
  onUnauthorized: () => Promise<void> | void;
};

export function useEnergyPolling({ energyLatestUrl, pollMs = 5000, onUnauthorized }: UseEnergyPollingParams) {
  const [battery, setBattery] = useState<EnergyDataItem | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLatestEnergy = useCallback(async () => {
    try {
      const response = await authFetch(`${energyLatestUrl}?t=${Date.now()}`);
      if (isUnauthorized(response)) {
        await onUnauthorized();
        return;
      }
      if (!response.ok) return;
      const latest = (await response.json()) as EnergyDataItem;
      setBattery(latest);
    } catch (err) {
      if (err instanceof Error && err.message === AUTH_TOKEN_MISSING_ERROR) {
        await onUnauthorized();
      }
    } finally {
      setLoading(false);
    }
  }, [energyLatestUrl, onUnauthorized]);

  useEffect(() => {
    console.log('POLLING RUNNING', { energyLatestUrl, pollMs });
    void fetchLatestEnergy();
    const intervalId = setInterval(() => {
      void fetchLatestEnergy();
    }, pollMs);
    return () => clearInterval(intervalId);
  }, [fetchLatestEnergy, pollMs]);

  return { battery, loading };
}

