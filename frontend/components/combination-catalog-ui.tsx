import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { onBgStyles } from '@/styles/on-bg';
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
    <View style={comboStyles.comboList}>
      {visibleCombos.map((combo) => (
        <View key={`${variant}-${combo.id}`} style={frameStyle}>
          <ThemedText type="defaultSemiBold" lightColor="#fff" style={titleStyle}>
            {combo.summary}
          </ThemedText>
          <ThemedText lightColor="#fff" style={comboStyles.muted}>
            {combo.essentialCount} required · {combo.optionalCount} optional · {combo.devices.length} device
            {combo.devices.length === 1 ? '' : 's'}
            {variant === 'valid'
              ? ` · headroom ${(inverterMaxPowerW - combo.totalPowerW).toFixed(0)} W`
              : ` · exceeds by ${(combo.totalPowerW - inverterMaxPowerW).toFixed(0)} W`}
          </ThemedText>
        </View>
      ))}

      {!showAll && hiddenCount > 0 ? (
        <Pressable
          style={({ pressed }) => [onBgStyles.onBgOutlineButton, pressed && onBgStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={onBgStyles.onBgOutlineButtonText}>Show all ({hiddenCount} more)</Text>
        </Pressable>
      ) : null}

      {showAll && combos.length > INITIAL_INVERTER_COMBOS_SHOWN ? (
        <Pressable
          style={({ pressed }) => [onBgStyles.onBgOutlineButton, pressed && onBgStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={onBgStyles.onBgOutlineButtonText}>Show less</Text>
        </Pressable>
      ) : null}
    </View>
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
    <View style={comboStyles.comboList}>
      {visibleCombos.map((combo) => (
        <View key={`energy-${variant}-${combo.id}`} style={frameStyle}>
          <ThemedText type="defaultSemiBold" lightColor="#fff" style={titleStyle}>
            {combo.summary}
          </ThemedText>
          <ThemedText lightColor="#fff" style={comboStyles.muted}>
            {combo.essentialCount} required · {combo.optionalCount} optional · {combo.devices.length} device
            {combo.devices.length === 1 ? '' : 's'}
            {variant === 'valid'
              ? ` · headroom ${(availableEnergyWh - combo.totalEnergyWh).toFixed(0)} Wh`
              : ` · exceeds by ${(combo.totalEnergyWh - availableEnergyWh).toFixed(0)} Wh`}
          </ThemedText>
        </View>
      ))}

      {!showAll && hiddenCount > 0 ? (
        <Pressable
          style={({ pressed }) => [onBgStyles.onBgOutlineButton, pressed && onBgStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={onBgStyles.onBgOutlineButtonText}>Show all ({hiddenCount} more)</Text>
        </Pressable>
      ) : null}

      {showAll && combos.length > INITIAL_ENERGY_COMBOS_SHOWN ? (
        <Pressable
          style={({ pressed }) => [onBgStyles.onBgOutlineButton, pressed && onBgStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={onBgStyles.onBgOutlineButtonText}>Show less</Text>
        </Pressable>
      ) : null}
    </View>
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
    <View style={comboStyles.comboList}>
      {visibleCombos.map((combo) => {
        const isSelected = selectedId === combo.id;
        return (
          <Pressable
            key={`runnable-${combo.id}`}
            style={({ pressed }) => [
              comboStyles.runnableComboFrame,
              isSelected && comboStyles.runnableComboFrameSelected,
              pressed && onBgStyles.buttonPressed,
            ]}
            onPress={() => onSelect(combo.id)}>
            <ThemedText type="defaultSemiBold" lightColor="#fff" style={comboStyles.runnableComboText}>
              {isSelected ? '✓ ' : ''}
              {combo.summary}
            </ThemedText>
            <ThemedText lightColor="#fff" style={comboStyles.muted}>
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
          style={({ pressed }) => [onBgStyles.onBgOutlineButton, pressed && onBgStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={onBgStyles.onBgOutlineButtonText}>Show all ({hiddenCount} more)</Text>
        </Pressable>
      ) : null}

      {showAll && combos.length > INITIAL_RUNNABLE_COMBOS_SHOWN ? (
        <Pressable
          style={({ pressed }) => [onBgStyles.onBgOutlineButton, pressed && onBgStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={onBgStyles.onBgOutlineButtonText}>Show less</Text>
        </Pressable>
      ) : null}
    </View>
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
    <View style={comboStyles.comboList}>
      {visiblePlans.map((plan) => (
        <View key={`twelve-hour-${plan.id}`} style={comboStyles.twelveHourComboFrame}>
          <ThemedText type="defaultSemiBold" lightColor="#fff" style={comboStyles.twelveHourComboText}>
            {plan.summary}
          </ThemedText>
          <ThemedText lightColor="#fff" style={comboStyles.muted}>
            {plan.essentialCount} required · {plan.optionalCount} optional · {plan.devices.length} device
            {plan.devices.length === 1 ? '' : 's'} · load {plan.totalPowerW.toFixed(0)} W
          </ThemedText>
          <ThemedText lightColor="#fff" style={comboStyles.muted}>
            {plan.runsFullHorizon
              ? `Runs all ${planningHorizonHours} forecast hours without draining the battery`
              : `Runs ${plan.sustainability.sustainableHours} of ${planningHorizonHours} hours${
                  plan.sustainability.limitingHour ? ` · limit at ${plan.sustainability.limitingHour}` : ''
                }`}
          </ThemedText>
          {!plan.runsFullHorizon && plan.sustainability.lastSustainableHour ? (
            <ThemedText lightColor="#fff" style={comboStyles.muted}>
              Covers continuous load through {plan.sustainability.lastSustainableHour}
            </ThemedText>
          ) : null}
        </View>
      ))}

      {!showAll && hiddenCount > 0 ? (
        <Pressable
          style={({ pressed }) => [onBgStyles.onBgOutlineButton, pressed && onBgStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={onBgStyles.onBgOutlineButtonText}>Show all ({hiddenCount} more)</Text>
        </Pressable>
      ) : null}

      {showAll && plans.length > INITIAL_RUNNABLE_COMBOS_SHOWN ? (
        <Pressable
          style={({ pressed }) => [onBgStyles.onBgOutlineButton, pressed && onBgStyles.buttonPressed]}
          onPress={onToggleShowAll}>
          <Text style={onBgStyles.onBgOutlineButtonText}>Show less</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const comboFrameBase = {
  borderWidth: 2,
  borderRadius: 10,
  padding: 12,
  gap: 6,
  backgroundColor: 'rgba(0, 0, 0, 0.12)',
} as const;

export const comboStyles = StyleSheet.create({
  muted: onBgStyles.onBgMuted,
  comboList: { gap: 10, marginBottom: 4 },
  sectionTitle: {
    ...onBgStyles.onBgSectionTitle,
    marginTop: 12,
    marginBottom: 4,
  },
  inverterComboFrameValid: {
    ...comboFrameBase,
    borderColor: 'rgba(187, 247, 208, 0.95)',
  },
  inverterComboFrameInvalid: {
    ...comboFrameBase,
    borderColor: '#ffb4a8',
  },
  energyComboFrameValid: {
    ...comboFrameBase,
    borderColor: 'rgba(191, 219, 254, 0.95)',
  },
  energyComboFrameInvalid: {
    ...comboFrameBase,
    borderColor: '#ffb4a8',
  },
  inverterValidText: onBgStyles.onBgHighlight,
  inverterInvalidText: onBgStyles.onBgBody,
  energyValidText: onBgStyles.onBgHighlight,
  energyInvalidText: onBgStyles.onBgBody,
  runnableComboFrame: {
    ...comboFrameBase,
    borderColor: 'rgba(187, 247, 208, 0.9)',
  },
  runnableComboFrameSelected: {
    borderColor: '#bbf7d0',
    backgroundColor: 'rgba(31, 122, 52, 0.25)',
  },
  runnableComboText: onBgStyles.onBgHighlight,
  selectComboButtonText: {
    color: '#e0f2fe',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  twelveHourComboFrame: {
    ...comboFrameBase,
    borderColor: 'rgba(191, 219, 254, 0.95)',
  },
  twelveHourComboText: onBgStyles.onBgHighlight,
});
