import { createContext, useContext, type ReactNode } from 'react';

import { useDashboardState } from '@/hooks/use-dashboard-state';

type AppDataContextValue = ReturnType<typeof useDashboardState>;

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const value = useDashboardState();
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return context;
}
