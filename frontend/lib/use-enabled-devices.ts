import { useEffect, useMemo, useState } from 'react';

import type { ApiDevice } from '@/lib/device-types';
import {
  filterEnabledDevices,
  subscribeDeviceEnabled,
} from '@/lib/device-enabled-store';

export function useEnabledDevices(allDevices: ApiDevice[]): ApiDevice[] {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    return subscribeDeviceEnabled(() => setRevision((value) => value + 1));
  }, []);

  return useMemo(() => filterEnabledDevices(allDevices), [allDevices, revision]);
}
