import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppButton } from '@/components/mobile/button';
import { BatteryGauge } from '@/components/mobile/battery-gauge';
import { Card } from '@/components/mobile/card';
import { MobileScreen, ScreenHeader } from '@/components/mobile/screen';
import { StatPill } from '@/components/mobile/stat-pill';
import { BodyText, CaptionText, HeadingText, TitleText } from '@/components/mobile/typography';
import { useAppData } from '@/contexts/AppDataContext';
import { useAuth } from '@/contexts/AuthContext';
import { colors, radius, spacing } from '@/constants/theme';
export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    loading,
    alerts,
    soc,
    voltage,
    current,
    availableEnergyWh,
    batteryCapacityWhValue,
    displayCity,
    weather,
    weatherLoading,
    orBestPlan,
    orBestLoading,
    orBestError,
    selectedRunningPlan,
    selectedPlanSustainability,
    isOrPlanSelected,
    fetchDashboardData,
    runOptimization,
    onSelectOrBestPlan,
  } = useAppData();

  const storedKwh = (availableEnergyWh / 1000).toFixed(1);
  const hoursToEmpty =
    selectedPlanSustainability && selectedPlanSustainability.sustainableHours > 0
      ? `${selectedPlanSustainability.sustainableHours}h`
      : '—';
  const greetingName = user?.email?.split('@')[0] ?? 'User';
  const tempLabel =
    weather?.temperature !== undefined && weather?.temperature !== null
      ? `${weather.temperature}°`
      : '—';

  return (
    <MobileScreen refreshing={loading} onRefresh={() => void fetchDashboardData()}>
      <ScreenHeader>
        <CaptionText>Good morning, {greetingName}</CaptionText>
        <View style={styles.titleRow}>
          <TitleText>Dashboard</TitleText>
          <View style={styles.weatherPill}>
            <Ionicons name="partly-sunny-outline" size={16} color={colors.primary} />
            <CaptionText>
              {tempLabel} · {displayCity}
            </CaptionText>
          </View>
        </View>
      </ScreenHeader>

      {alerts.length > 0 ? (
        <Card highlighted>
          {alerts.map((alert, idx) => (
            <BodyText key={`alert-${idx}`} style={styles.alertText}>
              {alert}
            </BodyText>
          ))}
        </Card>
      ) : null}

      <View style={styles.statRow}>
        <StatPill icon="battery-charging" value={soc !== null ? `${soc.toFixed(0)}%` : '—'} label="Charge" />
        <StatPill icon="flash" value={`${storedKwh} kWh`} label="Stored" />
        <StatPill icon="time-outline" value={hoursToEmpty} label="To Empty" />
      </View>

      <Card>
        <View style={styles.cardHeader}>
          <HeadingText>Battery Status</HeadingText>
          <View style={styles.badge}>
            <CaptionText style={styles.badgeText}>Operational</CaptionText>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <BatteryGauge soc={soc} voltage={voltage} current={current} />
            <View style={styles.energyRow}>
              <CaptionText>Available Energy</CaptionText>
              <HeadingText>{availableEnergyWh.toFixed(0)} Wh</HeadingText>
            </View>
            {batteryCapacityWhValue <= 0 ? (
              <CaptionText>Set battery capacity in Settings → Solar System.</CaptionText>
            ) : null}
          </>
        )}
      </Card>

      <View style={styles.quickActions}>
        <Card onPress={() => router.push('/manage-devices')} style={styles.quickCard}>
          <Ionicons name="construct-outline" size={22} color={colors.primary} />
          <CaptionText>Manage Devices</CaptionText>
        </Card>
        <Card onPress={() => router.push('/solar-system-settings')} style={styles.quickCard}>
          <Ionicons name="sunny-outline" size={22} color={colors.primary} />
          <CaptionText>Solar Settings</CaptionText>
        </Card>
        <Card onPress={() => router.push('/(tabs)/optimize')} style={[styles.quickCard, styles.runCard]}>
          <Ionicons name="play" size={22} color="#fff" />
          <CaptionText style={styles.runLabel}>Run Optimize</CaptionText>
        </Card>
      </View>

      <Card highlighted={isOrPlanSelected}>
        <View style={styles.cardHeader}>
          <HeadingText>Recommended Plan</HeadingText>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
        </View>
        {weatherLoading || orBestLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : orBestError ? (
          <BodyText>{orBestError}</BodyText>
        ) : orBestPlan && orBestPlan.can_run.length > 0 ? (
          <>
            <BodyText>
              {orBestPlan.solver_status} · {orBestPlan.total_power_w.toFixed(0)} W ·{' '}
              {orBestPlan.total_energy_wh.toFixed(0)} Wh · Headroom {orBestPlan.remaining_energy_wh.toFixed(0)} Wh
            </BodyText>
            {orBestPlan.can_run.slice(0, 3).map((device) => (
              <CaptionText key={`home-or-${device.name}`}>
                • {device.name} · {device.power} W · {device.duration} min
              </CaptionText>
            ))}
            <AppButton
              label={isOrPlanSelected ? 'Running OR Plan' : 'Apply Optimal Plan'}
              onPress={onSelectOrBestPlan}
              loading={orBestLoading}
            />
          </>
        ) : selectedRunningPlan ? (
          <>
            <BodyText>{selectedRunningPlan.summary}</BodyText>
            <CaptionText>
              {selectedRunningPlan.totalPowerW.toFixed(0)} W · {selectedRunningPlan.totalEnergyWh.toFixed(0)} Wh
            </CaptionText>
          </>
        ) : (
          <CaptionText>Run optimization to get an OR-Tools recommendation.</CaptionText>
        )}
        <AppButton label="Run Optimization" onPress={runOptimization} loading={orBestLoading} variant="outline" />
      </Card>

      <Card onPress={() => router.push('/(tabs)/forecast')}>
        <View style={styles.cardHeader}>
          <HeadingText>Weather Summary</HeadingText>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
        <BodyText>
          {weather?.condition ?? 'Loading…'} · {displayCity}
        </BodyText>
        {weather?.energy_estimate !== undefined ? (
          <CaptionText>Solar estimate: {weather.energy_estimate.toFixed(0)} Wh</CaptionText>
        ) : null}
      </Card>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  weatherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: { color: colors.success, fontWeight: '700' },
  energyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  runCard: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  runLabel: { color: '#fff', fontWeight: '700' },
  alertText: { color: colors.danger },
});
