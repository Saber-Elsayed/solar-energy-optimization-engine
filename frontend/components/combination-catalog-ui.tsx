import { Pressable, StyleSheet, Text } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { EnergyCombinationSet, InverterPowerSet, RunnableCombination } from '@/lib/optimization-catalog';
import type { TwelveHourRunPlan } from '@/lib/twelve-hour-run-forecast';

export const INITIAL_INVERTER_COMBOS_SHOWN = 4;
export const INITIAL_ENERGY_COMBOS_SHOWN = 4;
export const INITIAL_RUNNABLE_COMBOS_SHOWN = 4;

type InverterComboListProps = {
  combos: InverterPowerSet[];
  variant: 'valid' | 'invalid';
  inverterMaxPowerW: number;
  showAll: boolean;
  onToggleShowAll: () => void;
};

export function InverterComboList({
  combos,
  variant,
  inverterMaxPowerW,
  showAll,
  onToggleShowAll,
}: InverterComboListProps) {
  if (combos.length === 0) {
    return null;
  }

  const visibleCombos = showAll ? combos : combos.slice(0, INITIAL_INVERTER_COMBOS_SHOWN);
  const hiddenCount = Math.max(0, combos.length - INITIAL_INVERTER_COMBOS_SHOWN);
  const frameStyle = variant === 'valid' ? comboStyles.inverterComboFrameValid : comboStyles.inverterComboFrameInvalid;
  const titleStyle = variant === 'valid' ? comboStyles.inverterValidText : comboStyles.inverterInvalidText;

  return (
    <ThemedView style={comboStyles.comboList}>
      {visibleCombos.map((combo) => (
        <ThemedView key={`${variant}-${combo.id}`} style={frameStyle}>
          <ThemedText type="defaultSemiBold" style={titleStyle}>
            {combo.summary}
          </ThemedText>
          <ThemedText style={comboStyles.muted}>
            {combo.essentialCount} required · {combo.optionalCount} optional · {combo.devices.length} device
            {combo.devices.length === 1 ? '' : 's'}
            {variant === 'valid'
              ? ` · headroom ${(inverterMaxPowerW - combo.totalPowerW).toFixed(0)} W`
              : ` · exceeds by ${(combo.totalPowerW - inverterMaxPowerW).toFixed(0)} W`}
          </ThemedText>
        </ThemedView>
      ))}

      {!showAll && hiddenCount > 0 ? (
        <Pressable
          style={({ pressed }) => [comboStyles.showAllButton, pressed && comboStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={comboStyles.showAllButtonText}>Show all ({hiddenCount} more)</Text>
        </Pressable>
      ) : null}

      {showAll && combos.length > INITIAL_INVERTER_COMBOS_SHOWN ? (
        <Pressable
          style={({ pressed }) => [comboStyles.showAllButton, pressed && comboStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={comboStyles.showAllButtonText}>Show less</Text>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

type EnergyComboListProps = {
  combos: EnergyCombinationSet[];
  variant: 'valid' | 'invalid';
  availableEnergyWh: number;
  showAll: boolean;
  onToggleShowAll: () => void;
};

export function EnergyComboList({
  combos,
  variant,
  availableEnergyWh,
  showAll,
  onToggleShowAll,
}: EnergyComboListProps) {
  if (combos.length === 0) {
    return null;
  }

  const visibleCombos = showAll ? combos : combos.slice(0, INITIAL_ENERGY_COMBOS_SHOWN);
  const hiddenCount = Math.max(0, combos.length - INITIAL_ENERGY_COMBOS_SHOWN);
  const frameStyle = variant === 'valid' ? comboStyles.energyComboFrameValid : comboStyles.energyComboFrameInvalid;
  const titleStyle = variant === 'valid' ? comboStyles.energyValidText : comboStyles.energyInvalidText;

  return (
    <ThemedView style={comboStyles.comboList}>
      {visibleCombos.map((combo) => (
        <ThemedView key={`energy-${variant}-${combo.id}`} style={frameStyle}>
          <ThemedText type="defaultSemiBold" style={titleStyle}>
            {combo.summary}
          </ThemedText>
          <ThemedText style={comboStyles.muted}>
            {combo.essentialCount} required · {combo.optionalCount} optional · {combo.devices.length} device
            {combo.devices.length === 1 ? '' : 's'}
            {variant === 'valid'
              ? ` · headroom ${(availableEnergyWh - combo.totalEnergyWh).toFixed(0)} Wh`
              : ` · exceeds by ${(combo.totalEnergyWh - availableEnergyWh).toFixed(0)} Wh`}
          </ThemedText>
        </ThemedView>
      ))}

      {!showAll && hiddenCount > 0 ? (
        <Pressable
          style={({ pressed }) => [comboStyles.showAllButton, pressed && comboStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={comboStyles.showAllButtonText}>Show all ({hiddenCount} more)</Text>
        </Pressable>
      ) : null}

      {showAll && combos.length > INITIAL_ENERGY_COMBOS_SHOWN ? (
        <Pressable
          style={({ pressed }) => [comboStyles.showAllButton, pressed && comboStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={comboStyles.showAllButtonText}>Show less</Text>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

type RunnableComboListProps = {
  combos: RunnableCombination[];
  selectedId: string | null;
  inverterMaxPowerW: number;
  availableEnergyWh: number;
  showAll: boolean;
  onToggleShowAll: () => void;
  onSelect: (comboId: string) => void;
};

export function RunnableComboList({
  combos,
  selectedId,
  inverterMaxPowerW,
  availableEnergyWh,
  showAll,
  onToggleShowAll,
  onSelect,
}: RunnableComboListProps) {
  if (combos.length === 0) {
    return null;
  }

  const visibleCombos = showAll ? combos : combos.slice(0, INITIAL_RUNNABLE_COMBOS_SHOWN);
  const hiddenCount = Math.max(0, combos.length - INITIAL_RUNNABLE_COMBOS_SHOWN);

  return (
    <ThemedView style={comboStyles.comboList}>
      {visibleCombos.map((combo) => {
        const isSelected = selectedId === combo.id;
        return (
          <Pressable
            key={`runnable-${combo.id}`}
            style={({ pressed }) => [
              comboStyles.runnableComboFrame,
              isSelected && comboStyles.runnableComboFrameSelected,
              pressed && comboStyles.buttonPressed,
            ]}
            onPress={() => onSelect(combo.id)}>
            <ThemedText type="defaultSemiBold" style={comboStyles.runnableComboText}>
              {isSelected ? '✓ ' : ''}
              {combo.summary}
            </ThemedText>
            <ThemedText style={comboStyles.muted}>
              {combo.essentialCount} required · {combo.optionalCount} optional · headroom{' '}
              {(inverterMaxPowerW - combo.totalPowerW).toFixed(0)} W /{' '}
              {(availableEnergyWh - combo.totalEnergyWh).toFixed(0)} Wh
            </ThemedText>
            <Text style={comboStyles.selectComboButtonText}>{isSelected ? 'Selected' : 'Select to run'}</Text>
          </Pressable>
        );
      })}

      {!showAll && hiddenCount > 0 ? (
        <Pressable
          style={({ pressed }) => [comboStyles.showAllButton, pressed && comboStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={comboStyles.showAllButtonText}>Show all ({hiddenCount} more)</Text>
        </Pressable>
      ) : null}

      {showAll && combos.length > INITIAL_RUNNABLE_COMBOS_SHOWN ? (
        <Pressable
          style={({ pressed }) => [comboStyles.showAllButton, pressed && comboStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={comboStyles.showAllButtonText}>Show less</Text>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

type TwelveHourRunComboListProps = {
  plans: TwelveHourRunPlan[];
  planningHorizonHours: number;
  showAll: boolean;
  onToggleShowAll: () => void;
};

export function TwelveHourRunComboList({
  plans,
  planningHorizonHours,
  showAll,
  onToggleShowAll,
}: TwelveHourRunComboListProps) {
  if (plans.length === 0) {
    return null;
  }

  const visiblePlans = showAll ? plans : plans.slice(0, INITIAL_RUNNABLE_COMBOS_SHOWN);
  const hiddenCount = Math.max(0, plans.length - INITIAL_RUNNABLE_COMBOS_SHOWN);

  return (
    <ThemedView style={comboStyles.comboList}>
      {visiblePlans.map((plan) => (
        <ThemedView key={`twelve-hour-${plan.id}`} style={comboStyles.twelveHourComboFrame}>
          <ThemedText type="defaultSemiBold" style={comboStyles.twelveHourComboText}>
            {plan.summary}
          </ThemedText>
          <ThemedText style={comboStyles.muted}>
            {plan.essentialCount} required · {plan.optionalCount} optional · {plan.devices.length} device
            {plan.devices.length === 1 ? '' : 's'} · load {plan.totalPowerW.toFixed(0)} W
          </ThemedText>
          <ThemedText style={comboStyles.muted}>
            {plan.runsFullHorizon
              ? `Runs all ${planningHorizonHours} forecast hours without draining the battery`
              : `Runs ${plan.sustainability.sustainableHours} of ${planningHorizonHours} hours${
                  plan.sustainability.limitingHour ? ` · limit at ${plan.sustainability.limitingHour}` : ''
                }`}
          </ThemedText>
          {!plan.runsFullHorizon && plan.sustainability.lastSustainableHour ? (
            <ThemedText style={comboStyles.muted}>
              Covers continuous load through {plan.sustainability.lastSustainableHour}
            </ThemedText>
          ) : null}
        </ThemedView>
      ))}

      {!showAll && hiddenCount > 0 ? (
        <Pressable
          style={({ pressed }) => [comboStyles.showAllButton, pressed && comboStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={comboStyles.showAllButtonText}>Show all ({hiddenCount} more)</Text>
        </Pressable>
      ) : null}

      {showAll && plans.length > INITIAL_RUNNABLE_COMBOS_SHOWN ? (
        <Pressable
          style={({ pressed }) => [comboStyles.showAllButton, pressed && comboStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={comboStyles.showAllButtonText}>Show less</Text>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

export const comboStyles = StyleSheet.create({
  muted: { opacity: 0.7 },
  comboList: { gap: 10, marginBottom: 4 },
  sectionTitle: { marginTop: 12, marginBottom: 4 },
  inverterComboFrameValid: {
    borderWidth: 2,
    borderColor: '#3d9a52',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inverterComboFrameInvalid: {
    borderWidth: 2,
    borderColor: '#c45c4a',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  energyComboFrameValid: {
    borderWidth: 2,
    borderColor: '#3d7abf',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  energyComboFrameInvalid: {
    borderWidth: 2,
    borderColor: '#c45c4a',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inverterValidText: { color: '#1f5c2e' },
  inverterInvalidText: { color: '#8b3a2a' },
  energyValidText: { color: '#1b4b7a' },
  energyInvalidText: { color: '#8b3a2a' },
  showAllButton: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a7ea4',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  showAllButtonText: { color: '#0a7ea4', fontSize: 14, fontWeight: '600' },
  buttonPressed: { opacity: 0.85 },
  runnableComboFrame: {
    borderWidth: 2,
    borderColor: '#9ad3a6',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
  },
  runnableComboFrameSelected: { borderColor: '#1f7a34', backgroundColor: '#e8f8eb' },
  runnableComboText: { color: '#1f5c2e' },
  selectComboButtonText: { color: '#0a7ea4', fontSize: 13, fontWeight: '700', marginTop: 2 },
  twelveHourComboFrame: {
    borderWidth: 2,
    borderColor: '#6ba3d9',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 6,
  },
  twelveHourComboText: { color: '#1b4b7a' },
});
