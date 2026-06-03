import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { RunnableComboList, comboStyles } from '@/components/combination-catalog-ui';
import { OnBgScreen } from '@/components/on-bg-screen';
import { ThemedText } from '@/components/themed-text';
import { onBgStyles } from '@/styles/on-bg';
import {
  DEFAULT_INVERTER_MAX_POWER_W,
  DEVICES_URL,
  ENERGY_LATEST_URL,
  SOLAR_SYSTEM_URL,
} from '@/lib/api-config';
import type { ApiDevice } from '@/lib/device-types';
import { pruneDisabledDeviceIds } from '@/lib/device-enabled-store';
import { getFeasibleSelection, setFeasibleSelection } from '@/lib/feasible-selection-store';
import {
  buildDevicesCatalogSignature,
  buildRunnableCombinationCatalog,
  MAX_INVERTER_ENUM_DEVICES,
} from '@/lib/optimization-catalog';
import { useEnabledDevices } from '@/lib/use-enabled-devices';

type EnergyDataItem = { soc?: number };

type SolarSystemProfileResponse = {
  battery_capacity_wh: number;
  inverter_max_power_w: number;
};

export default function FeasibleCombinationsScreen() {
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const activeDevices = useEnabledDevices(devices);
  const [loading, setLoading] = useState(true);
  const [batteryCapacityWhValue, setBatteryCapacityWhValue] = useState(0);
  const batteryCapacityWhRef = useRef(0);
  const [inverterMaxPowerWValue, setInverterMaxPowerWValue] = useState(DEFAULT_INVERTER_MAX_POWER_W);
  const [soc, setSoc] = useState<number | null>(null);
  const [selectedCombinationId, setSelectedCombinationId] = useState<string | null>(() => getFeasibleSelection());

  const [showAllEssentialOnly, setShowAllEssentialOnly] = useState(false);
  const [showAllOptionalOnly, setShowAllOptionalOnly] = useState(false);
  const [showAllEssentialOptional, setShowAllEssentialOptional] = useState(false);

  const availableEnergyWh = useMemo(() => {
    if (soc !== null) {
      return batteryCapacityWhValue * (soc / 100);
    }
    return batteryCapacityWhValue;
  }, [batteryCapacityWhValue, soc]);

  const runnableCombinationCatalog = useMemo(
    () => buildRunnableCombinationCatalog(activeDevices, inverterMaxPowerWValue, availableEnergyWh),
    [activeDevices, inverterMaxPowerWValue, availableEnergyWh],
  );

  const allRunnableCombinations = useMemo(
    () => [
      ...runnableCombinationCatalog.essentialOnly,
      ...runnableCombinationCatalog.optionalOnly,
      ...runnableCombinationCatalog.essentialWithOptional,
    ],
    [runnableCombinationCatalog],
  );

  const devicesCatalogSignature = useMemo(() => buildDevicesCatalogSignature(activeDevices), [activeDevices]);
  const runnableCatalogSignature = useMemo(
    () => `${devicesCatalogSignature}|${availableEnergyWh.toFixed(1)}|inv:${inverterMaxPowerWValue.toFixed(0)}`,
    [devicesCatalogSignature, availableEnergyWh, inverterMaxPowerWValue],
  );

  useEffect(() => {
    setShowAllEssentialOnly(false);
    setShowAllOptionalOnly(false);
    setShowAllEssentialOptional(false);
  }, [runnableCatalogSignature]);

  useEffect(() => {
    if (!selectedCombinationId) {
      return;
    }
    const stillExists = allRunnableCombinations.some((combo) => combo.id === selectedCombinationId);
    if (!stillExists) {
      setSelectedCombinationId(null);
      setFeasibleSelection(null);
    }
  }, [allRunnableCombinations, selectedCombinationId]);

  useEffect(() => {
    const load = async () => {
      try {
        let capacityWh = batteryCapacityWhRef.current;
        let inverterMaxPowerW = DEFAULT_INVERTER_MAX_POWER_W;

        const solarRes = await fetch(`${SOLAR_SYSTEM_URL}?t=${Date.now()}`);
        if (solarRes.ok) {
          const solar = (await solarRes.json()) as SolarSystemProfileResponse;
          capacityWh = solar.battery_capacity_wh ?? 0;
          inverterMaxPowerW = solar.inverter_max_power_w ?? DEFAULT_INVERTER_MAX_POWER_W;
          batteryCapacityWhRef.current = capacityWh;
          setBatteryCapacityWhValue(capacityWh);
          setInverterMaxPowerWValue(inverterMaxPowerW);
        }

        const energyRes = await fetch(`${ENERGY_LATEST_URL}?t=${Date.now()}`);
        if (energyRes.ok) {
          const energy = (await energyRes.json()) as EnergyDataItem;
          if (typeof energy.soc === 'number') {
            setSoc(energy.soc);
          }
        }

        const devicesRes = await fetch(`${DEVICES_URL}?t=${Date.now()}`);
        if (devicesRes.ok) {
          const data = (await devicesRes.json()) as ApiDevice[];
          if (Array.isArray(data)) {
            pruneDisabledDeviceIds(data.map((device) => device.id));
            setDevices(data);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const handleSelectCombination = (comboId: string) => {
    const nextId = selectedCombinationId === comboId ? null : comboId;
    setSelectedCombinationId(nextId);
    setFeasibleSelection(nextId);
  };

  return (
    <OnBgScreen variant="solar">
      {loading ? (
        <ActivityIndicator size="large" color="#ffffff" />
      ) : (
        <View style={onBgStyles.onBgPanel}>
          <ThemedText type="subtitle" lightColor="#fff" style={onBgStyles.onBgTitle}>
            Feasible Combinations (Inverter & Energy)
          </ThemedText>
          <ThemedText lightColor="#fff" style={comboStyles.muted}>
              Combinations that satisfy inverter power ({inverterMaxPowerWValue.toFixed(0)} W), battery energy (
              {availableEnergyWh.toFixed(1)} Wh), and required/optional rules. Tap to select a running plan.
            </ThemedText>

          {devices.length === 0 ? (
            <ThemedText lightColor="#fff" style={comboStyles.muted}>
              Add devices to see feasible combinations.
            </ThemedText>
          ) : runnableCombinationCatalog.noEnergyAvailable ? (
            <ThemedText lightColor="#fff" style={comboStyles.muted}>
              Configure battery capacity and SOC to calculate feasible combinations.
            </ThemedText>
          ) : runnableCombinationCatalog.tooManyDevices ? (
            <ThemedText lightColor="#fff" style={comboStyles.muted}>
              Too many devices to list all combinations (max {MAX_INVERTER_ENUM_DEVICES}).
            </ThemedText>
          ) : allRunnableCombinations.length === 0 ? (
            <ThemedText lightColor="#fff" style={comboStyles.muted}>
              No combination satisfies both inverter and energy limits at the same time.
            </ThemedText>
          ) : (
            <>
              <ThemedText type="defaultSemiBold" lightColor="#fff" style={comboStyles.sectionTitle}>
                  Required only ({runnableCombinationCatalog.essentialOnly.length})
                </ThemedText>
                {runnableCombinationCatalog.essentialOnly.length === 0 ? (
                  <ThemedText lightColor="#fff" style={comboStyles.muted}>
                    No required-only feasible combination.
                  </ThemedText>
                ) : (
                  <RunnableComboList
                    combos={runnableCombinationCatalog.essentialOnly}
                    selectedId={selectedCombinationId}
                    inverterMaxPowerW={inverterMaxPowerWValue}
                    availableEnergyWh={availableEnergyWh}
                    showAll={showAllEssentialOnly}
                    onToggleShowAll={() => setShowAllEssentialOnly((prev) => !prev)}
                    onSelect={handleSelectCombination}
                  />
                )}

              <ThemedText type="defaultSemiBold" lightColor="#fff" style={comboStyles.sectionTitle}>
                Optional only ({runnableCombinationCatalog.optionalOnly.length})
              </ThemedText>
              {runnableCombinationCatalog.optionalOnly.length === 0 ? (
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  No optional-only feasible combination.
                </ThemedText>
                ) : (
                  <RunnableComboList
                    combos={runnableCombinationCatalog.optionalOnly}
                    selectedId={selectedCombinationId}
                    inverterMaxPowerW={inverterMaxPowerWValue}
                    availableEnergyWh={availableEnergyWh}
                    showAll={showAllOptionalOnly}
                    onToggleShowAll={() => setShowAllOptionalOnly((prev) => !prev)}
                    onSelect={handleSelectCombination}
                  />
                )}

              <ThemedText type="defaultSemiBold" lightColor="#fff" style={comboStyles.sectionTitle}>
                Required + Optional ({runnableCombinationCatalog.essentialWithOptional.length})
              </ThemedText>
              {runnableCombinationCatalog.essentialWithOptional.length === 0 ? (
                <ThemedText lightColor="#fff" style={comboStyles.muted}>
                  No required + optional feasible combination.
                </ThemedText>
                ) : (
                  <RunnableComboList
                    combos={runnableCombinationCatalog.essentialWithOptional}
                    selectedId={selectedCombinationId}
                    inverterMaxPowerW={inverterMaxPowerWValue}
                    availableEnergyWh={availableEnergyWh}
                    showAll={showAllEssentialOptional}
                    onToggleShowAll={() => setShowAllEssentialOptional((prev) => !prev)}
                    onSelect={handleSelectCombination}
                  />
                )}
            </>
          )}
        </View>
      )}
    </OnBgScreen>
  );
}
