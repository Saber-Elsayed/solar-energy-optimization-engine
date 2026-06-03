import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppButton } from '@/components/mobile/button';
import { Card } from '@/components/mobile/card';
import { MobileScreen, ScreenHeader } from '@/components/mobile/screen';
import { BodyText, CaptionText, HeadingText, TitleText } from '@/components/mobile/typography';
import { useAppData } from '@/contexts/AppDataContext';
import { colors, radius, spacing } from '@/constants/theme';

const PREVIEW_COUNT = 5;

export default function OptimizeScreen() {
  const router = useRouter();
  const {
    allRunnableCombinations,
    feasibleSelectionId,
    isOrPlanSelected,
    orBestPlan,
    orBestLoading,
    orBestError,
    optimization,
    selectedRunningPlan,
    runOptimization,
    onSelectOrBestPlan,
    selectFeasiblePlan,
    fetchDashboardData,
    loading,
  } = useAppData();

  const previewCombinations = allRunnableCombinations.slice(0, PREVIEW_COUNT);

  return (
    <MobileScreen refreshing={loading} onRefresh={() => void fetchDashboardData()}>
      <ScreenHeader>
        <TitleText>Optimize</TitleText>
        <CaptionText>OR-Tools plans and feasible device combinations</CaptionText>
      </ScreenHeader>

      <AppButton label="Run Optimization" onPress={runOptimization} loading={orBestLoading} />

      <Card highlighted={isOrPlanSelected}>
        <View style={styles.cardHeader}>
          <HeadingText>OR-Tools Recommended</HeadingText>
          {isOrPlanSelected ? (
            <View style={styles.activeBadge}>
              <CaptionText style={styles.activeBadgeText}>Active</CaptionText>
            </View>
          ) : null}
        </View>
        {orBestLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : orBestError ? (
          <BodyText>{orBestError}</BodyText>
        ) : orBestPlan && orBestPlan.can_run.length > 0 ? (
          <>
            <BodyText>
              {orBestPlan.solver_status} · Score {orBestPlan.objective_score} · {orBestPlan.total_power_w.toFixed(0)} W ·{' '}
              {orBestPlan.total_energy_wh.toFixed(0)} Wh
            </BodyText>
            {orBestPlan.can_run.map((device) => (
              <CaptionText key={`opt-or-${device.name}`}>
                • {device.name} ({device.essential ? 'Required' : 'Optional'}) · {device.power} W
              </CaptionText>
            ))}
            <AppButton
              label={isOrPlanSelected ? 'Running this plan' : 'Select & run this plan'}
              onPress={onSelectOrBestPlan}
            />
          </>
        ) : (
          <CaptionText>Run optimization or enable devices to compute a plan.</CaptionText>
        )}
      </Card>

      {selectedRunningPlan ? (
        <Card>
          <HeadingText>Selected Running Plan</HeadingText>
          <BodyText>{selectedRunningPlan.summary}</BodyText>
          <CaptionText>
            {selectedRunningPlan.totalPowerW.toFixed(0)} W · {selectedRunningPlan.totalEnergyWh.toFixed(0)} Wh
          </CaptionText>
        </Card>
      ) : null}

      <View style={styles.sectionHeader}>
        <HeadingText>Feasible Combinations</HeadingText>
        <View style={styles.countBadge}>
          <CaptionText style={styles.countText}>{allRunnableCombinations.length} options</CaptionText>
        </View>
      </View>

      {previewCombinations.length === 0 ? (
        <Card>
          <CaptionText>No feasible combinations under current inverter and energy limits.</CaptionText>
        </Card>
      ) : (
        previewCombinations.map((combo) => {
          const selected = feasibleSelectionId === combo.id;
          return (
            <Pressable key={combo.id} onPress={() => selectFeasiblePlan(combo.id)}>
              <Card highlighted={selected} style={styles.comboCard}>
                <View style={styles.comboTop}>
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selected ? colors.primary : colors.textMuted}
                  />
                  <View style={styles.comboInfo}>
                    <BodyText style={styles.comboTitle}>{combo.summary}</BodyText>
                    <CaptionText>
                      {combo.totalPowerW.toFixed(0)} W load · {combo.totalEnergyWh.toFixed(0)} Wh total
                    </CaptionText>
                  </View>
                  {selected ? (
                    <View style={styles.activeBadge}>
                      <CaptionText style={styles.activeBadgeText}>Active</CaptionText>
                    </View>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          );
        })
      )}

      <AppButton
        label="Browse all combinations"
        onPress={() => router.push('/feasible-combinations')}
        variant="outline"
      />

      <Card>
        <HeadingText>Automatic Schedule</HeadingText>
        <CaptionText>
          Inverter limit · Active load {optimization.activePowerW.toFixed(0)} W · Allowed{' '}
          {optimization.allowed.length} · Blocked {optimization.blocked.length}
        </CaptionText>
      </Card>

      {optimization.alternatives.length > 0 ? (
        <Card>
          <HeadingText>Swap Suggestions</HeadingText>
          {optimization.alternatives.slice(0, 4).map((option) => (
            <CaptionText key={option.id}>{option.summary}</CaptionText>
          ))}
        </Card>
      ) : null}
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  activeBadgeText: { color: colors.primaryDark, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countBadge: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  countText: { fontWeight: '700' },
  comboCard: { marginBottom: 0 },
  comboTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  comboInfo: { flex: 1, gap: spacing.xs },
  comboTitle: { fontWeight: '600' },
});
