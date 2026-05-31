import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EnergyComboList, InverterComboList, comboStyles } from '@/components/combination-catalog-ui';
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
import {
  buildDevicesCatalogSignature,
  buildEnergyCombinationCatalog,
  buildInverterPowerCatalog,
  MAX_ENERGY_ENUM_DEVICES,
  MAX_INVERTER_ENUM_DEVICES,
} from '@/lib/optimization-catalog';
import { useEnabledDevices } from '@/lib/use-enabled-devices';

type EnergyDataItem = { soc?: number };

type SolarSystemProfileResponse = {
  battery_capacity_wh: number;
  inverter_max_power_w: number;
};

export default function ConstraintCombinationsScreen() {
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const activeDevices = useEnabledDevices(devices);
  const [loading, setLoading] = useState(true);
  const [batteryCapacityWhValue, setBatteryCapacityWhValue] = useState(0);
  const batteryCapacityWhRef = useRef(0);
  const [inverterMaxPowerWValue, setInverterMaxPowerWValue] = useState(DEFAULT_INVERTER_MAX_POWER_W);
  const [soc, setSoc] = useState<number | null>(null);

  const [showAllInverterEssentialOnly, setShowAllInverterEssentialOnly] = useState(false);
  const [showAllInverterOptionalOnly, setShowAllInverterOptionalOnly] = useState(false);
  const [showAllInverterEssentialOptional, setShowAllInverterEssentialOptional] = useState(false);
  const [showAllInvalidInverter, setShowAllInvalidInverter] = useState(false);
  const [showAllEnergyEssentialOnly, setShowAllEnergyEssentialOnly] = useState(false);
  const [showAllEnergyOptionalOnly, setShowAllEnergyOptionalOnly] = useState(false);
  const [showAllEnergyEssentialOptional, setShowAllEnergyEssentialOptional] = useState(false);
  const [showAllEnergyInvalid, setShowAllEnergyInvalid] = useState(false);

  const availableEnergyWh = useMemo(() => {
    if (soc !== null) {
      return batteryCapacityWhValue * (soc / 100);
    }
    return batteryCapacityWhValue;
  }, [batteryCapacityWhValue, soc]);

  const inverterPowerCatalog = useMemo(
    () => buildInverterPowerCatalog(activeDevices, inverterMaxPowerWValue),
    [activeDevices, inverterMaxPowerWValue],
  );
  const energyCombinationCatalog = useMemo(
    () => buildEnergyCombinationCatalog(activeDevices, availableEnergyWh),
    [activeDevices, availableEnergyWh],
  );

  const devicesCatalogSignature = useMemo(() => buildDevicesCatalogSignature(activeDevices), [activeDevices]);
  const energyCatalogSignature = useMemo(
    () => `${devicesCatalogSignature}|${availableEnergyWh.toFixed(1)}`,
    [devicesCatalogSignature, availableEnergyWh],
  );

  useEffect(() => {
    setShowAllInverterEssentialOnly(false);
    setShowAllInverterOptionalOnly(false);
    setShowAllInverterEssentialOptional(false);
    setShowAllInvalidInverter(false);
  }, [devicesCatalogSignature, inverterMaxPowerWValue]);

  useEffect(() => {
    setShowAllEnergyEssentialOnly(false);
    setShowAllEnergyOptionalOnly(false);
    setShowAllEnergyEssentialOptional(false);
    setShowAllEnergyInvalid(false);
  }, [energyCatalogSignature]);

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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#0a7ea4" />
        ) : (
          <>
            <ThemedView style={[styles.card, styles.inverterCard]}>
              <ThemedText type="subtitle">Inverter Power Combinations</ThemedText>
              <ThemedText style={comboStyles.muted}>
                Simultaneous load only (max {inverterMaxPowerWValue.toFixed(0)} W). Independent of battery energy.
              </ThemedText>

              {devices.length === 0 ? (
                <ThemedText style={comboStyles.muted}>Add devices to see combinations.</ThemedText>
              ) : inverterPowerCatalog.tooManyDevices ? (
                <ThemedText style={comboStyles.muted}>
                  Too many devices (max {MAX_INVERTER_ENUM_DEVICES}).
                </ThemedText>
              ) : (
                <>
                  <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                    Required only ({inverterPowerCatalog.essentialOnly.length})
                  </ThemedText>
                  {inverterPowerCatalog.essentialOnly.length === 0 ? (
                    <ThemedText style={comboStyles.muted}>No required-only combination fits.</ThemedText>
                  ) : (
                    <InverterComboList
                      combos={inverterPowerCatalog.essentialOnly}
                      variant="valid"
                      inverterMaxPowerW={inverterMaxPowerWValue}
                      showAll={showAllInverterEssentialOnly}
                      onToggleShowAll={() => setShowAllInverterEssentialOnly((p) => !p)}
                    />
                  )}

                  <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                    Optional only ({inverterPowerCatalog.optionalOnly.length})
                  </ThemedText>
                  {inverterPowerCatalog.optionalOnly.length === 0 ? (
                    <ThemedText style={comboStyles.muted}>No optional-only combination fits.</ThemedText>
                  ) : (
                    <InverterComboList
                      combos={inverterPowerCatalog.optionalOnly}
                      variant="valid"
                      inverterMaxPowerW={inverterMaxPowerWValue}
                      showAll={showAllInverterOptionalOnly}
                      onToggleShowAll={() => setShowAllInverterOptionalOnly((p) => !p)}
                    />
                  )}

                  <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                    Required + Optional ({inverterPowerCatalog.essentialWithOptional.length})
                  </ThemedText>
                  {inverterPowerCatalog.essentialWithOptional.length === 0 ? (
                    <ThemedText style={comboStyles.muted}>No required + optional combination fits.</ThemedText>
                  ) : (
                    <InverterComboList
                      combos={inverterPowerCatalog.essentialWithOptional}
                      variant="valid"
                      inverterMaxPowerW={inverterMaxPowerWValue}
                      showAll={showAllInverterEssentialOptional}
                      onToggleShowAll={() => setShowAllInverterEssentialOptional((p) => !p)}
                    />
                  )}

                  <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                    Cannot run together ({inverterPowerCatalog.invalid.length})
                  </ThemedText>
                  {inverterPowerCatalog.invalid.length === 0 ? (
                    <ThemedText style={comboStyles.muted}>All combinations fit the inverter limit.</ThemedText>
                  ) : (
                    <InverterComboList
                      combos={inverterPowerCatalog.invalid}
                      variant="invalid"
                      inverterMaxPowerW={inverterMaxPowerWValue}
                      showAll={showAllInvalidInverter}
                      onToggleShowAll={() => setShowAllInvalidInverter((p) => !p)}
                    />
                  )}
                </>
              )}
            </ThemedView>

            <ThemedView style={[styles.card, styles.energyCard]}>
              <ThemedText type="subtitle">Battery Energy Combinations</ThemedText>
              <ThemedText style={comboStyles.muted}>
                Runtime energy (power × hours). Available: {availableEnergyWh.toFixed(1)} Wh.
              </ThemedText>

              {devices.length === 0 ? (
                <ThemedText style={comboStyles.muted}>Add devices to see combinations.</ThemedText>
              ) : energyCombinationCatalog.noEnergyAvailable ? (
                <ThemedText style={comboStyles.muted}>Configure battery capacity and SOC first.</ThemedText>
              ) : energyCombinationCatalog.tooManyDevices ? (
                <ThemedText style={comboStyles.muted}>Too many devices (max {MAX_ENERGY_ENUM_DEVICES}).</ThemedText>
              ) : (
                <>
                  <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                    Required only ({energyCombinationCatalog.essentialOnly.length})
                  </ThemedText>
                  {energyCombinationCatalog.essentialOnly.length === 0 ? (
                    <ThemedText style={comboStyles.muted}>No required-only combination fits.</ThemedText>
                  ) : (
                    <EnergyComboList
                      combos={energyCombinationCatalog.essentialOnly}
                      variant="valid"
                      availableEnergyWh={availableEnergyWh}
                      showAll={showAllEnergyEssentialOnly}
                      onToggleShowAll={() => setShowAllEnergyEssentialOnly((p) => !p)}
                    />
                  )}

                  <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                    Optional only ({energyCombinationCatalog.optionalOnly.length})
                  </ThemedText>
                  {energyCombinationCatalog.optionalOnly.length === 0 ? (
                    <ThemedText style={comboStyles.muted}>No optional-only combination fits.</ThemedText>
                  ) : (
                    <EnergyComboList
                      combos={energyCombinationCatalog.optionalOnly}
                      variant="valid"
                      availableEnergyWh={availableEnergyWh}
                      showAll={showAllEnergyOptionalOnly}
                      onToggleShowAll={() => setShowAllEnergyOptionalOnly((p) => !p)}
                    />
                  )}

                  <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                    Required + Optional ({energyCombinationCatalog.essentialWithOptional.length})
                  </ThemedText>
                  {energyCombinationCatalog.essentialWithOptional.length === 0 ? (
                    <ThemedText style={comboStyles.muted}>No required + optional combination fits.</ThemedText>
                  ) : (
                    <EnergyComboList
                      combos={energyCombinationCatalog.essentialWithOptional}
                      variant="valid"
                      availableEnergyWh={availableEnergyWh}
                      showAll={showAllEnergyEssentialOptional}
                      onToggleShowAll={() => setShowAllEnergyEssentialOptional((p) => !p)}
                    />
                  )}

                  <ThemedText type="defaultSemiBold" style={comboStyles.sectionTitle}>
                    Cannot run together ({energyCombinationCatalog.invalid.length})
                  </ThemedText>
                  {energyCombinationCatalog.invalid.length === 0 ? (
                    <ThemedText style={comboStyles.muted}>All combinations fit energy rules.</ThemedText>
                  ) : (
                    <EnergyComboList
                      combos={energyCombinationCatalog.invalid}
                      variant="invalid"
                      availableEnergyWh={availableEnergyWh}
                      showAll={showAllEnergyInvalid}
                      onToggleShowAll={() => setShowAllEnergyInvalid((p) => !p)}
                    />
                  )}
                </>
              )}
            </ThemedView>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 28 },
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
  inverterCard: { borderColor: '#d4c4a8', backgroundColor: '#fffaf0' },
  energyCard: { borderColor: '#9ec5f8', backgroundColor: '#f0f6ff' },
});
