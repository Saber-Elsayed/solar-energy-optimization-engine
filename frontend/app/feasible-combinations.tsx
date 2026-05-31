import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RunnableComboList, comboStyles } from '@/components/combination-catalog-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#0a7ea4" />
        ) : (
          <ThemedView style={[styles.card, styles.runnableCard]}>
            <ThemedText type="subtitle">Feasible Combinations (Inverter & Energy)</ThemedText>
            <ThemedText style={comboStyles.muted}>
              Combinations that satisfy inverter power ({inverterMaxPowerWValue.toFixed(0)} W), battery energy (
              {availableEnergyWh.toFixed(1)} Wh), and required/optional rules. Tap to select a running plan.
            </ThemedText>

            {devices.length === 0 ? (
              <ThemedText style={comboStyles.muted}>Add devices to see feasible combinations.</ThemedText>
            ) : runnableCombinationCatalog.noEnergyAvailable ? (
              <ThemedText style={comboStyles.muted}>
                Configure battery capacity and SOC to calculate feasible combinations.
              </ThemedText>
            ) : runnableCombinationCatalog.tooManyDevices ? (
              <ThemedText style={comboStyles.muted}>
                Too many devices to list all combinations (max {MAX_INVERTER_ENUM_DEVICES}).
              </ThemedText>
            ) : allRunnableCombinations.length === 0 ? (
              <ThemedText style={comboStyles.muted}>
                No combination satisfies both inverter and energy limits at the same time.
              </ThemedText>
            ) : (
              <>
                <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                  Required only ({runnableCombinationCatalog.essentialOnly.length})
                </ThemedText>
                {runnableCombinationCatalog.essentialOnly.length === 0 ? (
                  <ThemedText style={comboStyles.muted}>No required-only feasible combination.</ThemedText>
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

                <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                  Optional only ({runnableCombinationCatalog.optionalOnly.length})
                </ThemedText>
                {runnableCombinationCatalog.optionalOnly.length === 0 ? (
                  <ThemedText style={comboStyles.muted}>No optional-only feasible combination.</ThemedText>
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

                <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                  Required + Optional ({runnableCombinationCatalog.essentialWithOptional.length})
                </ThemedText>
                {runnableCombinationCatalog.essentialWithOptional.length === 0 ? (
                  <ThemedText style={comboStyles.muted}>No required + optional feasible combination.</ThemedText>
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
          </ThemedView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 28 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  runnableCard: {
    borderColor: '#7fb87f',
    backgroundColor: '#f2faf2',
  },
});
