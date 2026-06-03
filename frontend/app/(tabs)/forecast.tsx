import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ForecastChart } from '@/components/mobile/forecast-chart';
import { AppButton } from '@/components/mobile/button';
import { Card } from '@/components/mobile/card';
import { MobileScreen, ScreenHeader } from '@/components/mobile/screen';
import { BodyText, CaptionText, HeadingText, TitleText } from '@/components/mobile/typography';
import { useAppData } from '@/contexts/AppDataContext';
import { NIGHT_WINDOW_URL } from '@/lib/api-config';
import { colors, spacing } from '@/constants/theme';

type NightWindow = {
  city?: string;
  sunset?: string;
  sunrise?: string;
  darkness_minutes?: number;
};

export default function ForecastScreen() {
  const router = useRouter();
  const {
    city,
    displayCity,
    batteryCapacityWhValue,
    availableEnergyWh,
    forecastPoints,
    twelveHourRunForecast,
    selectedRunningPlan,
    selectedPlanSustainability,
    nightPlanCardHint,
    fetchDashboardData,
    loading,
  } = useAppData();

  const [nightWindow, setNightWindow] = useState<NightWindow | null>(null);
  const [nightLoading, setNightLoading] = useState(false);
  const [nightError, setNightError] = useState<string | null>(null);

  const loadWhPerHour = selectedRunningPlan?.totalPowerW ?? 0;
  const targetSoc = 25;
  const estRuntimeHours =
    nightWindow?.darkness_minutes !== undefined
      ? `${(nightWindow.darkness_minutes / 60).toFixed(1)}h`
      : '—';

  useEffect(() => {
    const targetCity = city.trim() || 'Tel Aviv';
    setNightLoading(true);
    setNightError(null);
    void (async () => {
      try {
        const res = await fetch(`${NIGHT_WINDOW_URL}?city=${encodeURIComponent(targetCity)}&t=${Date.now()}`);
        if (!res.ok) {
          setNightWindow(null);
          setNightError(`Could not load night window (${res.status})`);
          return;
        }
        setNightWindow((await res.json()) as NightWindow);
      } catch {
        setNightWindow(null);
        setNightError('Could not reach weather service.');
      } finally {
        setNightLoading(false);
      }
    })();
  }, [city]);

  return (
    <MobileScreen refreshing={loading} onRefresh={() => void fetchDashboardData()}>
      <ScreenHeader>
        <TitleText>Forecast</TitleText>
        <CaptionText>12-hour solar outlook and night discharge</CaptionText>
      </ScreenHeader>

      <Card>
        <View style={styles.cardHeader}>
          <HeadingText>12-Hour Forecast</HeadingText>
          <Ionicons name="sunny-outline" size={20} color={colors.primary} />
        </View>
        <ForecastChart
          points={forecastPoints}
          batteryCapacityWh={batteryCapacityWhValue}
          loadWhPerHour={loadWhPerHour}
        />
        <CaptionText>
          {twelveHourRunForecast.fullHorizonPlans.length} full-horizon plan(s) · {availableEnergyWh.toFixed(0)} Wh now
        </CaptionText>
        <AppButton
          label="Open detailed 12h forecast"
          onPress={() =>
            router.push({
              pathname: '/twelve-hour-forecast',
              params: { city: city.trim() || 'Tel Aviv' },
            })
          }
          variant="outline"
        />
      </Card>

      {selectedPlanSustainability ? (
        <Card>
          <HeadingText>Plan Sustainability</HeadingText>
          <BodyText>
            {selectedPlanSustainability.sustainableHours} of {selectedPlanSustainability.planningHorizonHours} hours
            without draining
          </BodyText>
          <CaptionText>
            Projected battery after horizon: {selectedPlanSustainability.finalBatteryWh.toFixed(0)} Wh
          </CaptionText>
        </Card>
      ) : null}

      <Card>
        <View style={styles.cardHeader}>
          <HeadingText>Night Discharge</HeadingText>
          <View style={styles.scheduledBadge}>
            <CaptionText style={styles.scheduledText}>Scheduled</CaptionText>
          </View>
        </View>
        {nightLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : nightError ? (
          <CaptionText>{nightError}</CaptionText>
        ) : (
          <View style={styles.nightGrid}>
            <View style={styles.nightItem}>
              <CaptionText>Start</CaptionText>
              <BodyText>{nightWindow?.sunset ?? '—'}</BodyText>
            </View>
            <View style={styles.nightItem}>
              <CaptionText>Target SOC</CaptionText>
              <BodyText>{targetSoc}%</BodyText>
            </View>
            <View style={styles.nightItem}>
              <CaptionText>Est. Runtime</CaptionText>
              <BodyText>{estRuntimeHours}</BodyText>
            </View>
          </View>
        )}
        <CaptionText>{nightPlanCardHint}</CaptionText>
        <AppButton
          label="Night Discharge Plan"
          onPress={() =>
            router.push({
              pathname: '/night-plan',
              params: { city: city.trim() || 'Tel Aviv' },
            })
          }
        />
      </Card>

      <CaptionText style={styles.disclaimer}>
        Night recommendations use Open-Meteo sunset/sunrise for {displayCity}. Maintain minimum charge until sunrise.
      </CaptionText>
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduledBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  scheduledText: { color: colors.primaryDark, fontWeight: '700' },
  nightGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  nightItem: { flex: 1, gap: spacing.xs },
  disclaimer: { fontStyle: 'italic', textAlign: 'center' },
});
