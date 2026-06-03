import { StyleSheet, View } from 'react-native';

import { CaptionText, LabelText } from '@/components/mobile/typography';
import { weatherEnergyToWh, type ForecastPoint } from '@/lib/plan-sustainability';
import { colors, radius, spacing } from '@/constants/theme';

type ForecastChartProps = {
  points: ForecastPoint[];
  batteryCapacityWh: number;
  loadWhPerHour?: number;
};

export function ForecastChart({ points, batteryCapacityWh, loadWhPerHour = 0 }: ForecastChartProps) {
  const slice = points.slice(0, 12);
  if (slice.length === 0) {
    return <CaptionText>No forecast data yet.</CaptionText>;
  }

  const solarValues = slice.map((p) => weatherEnergyToWh(p.energy, batteryCapacityWh));
  const maxSolar = Math.max(...solarValues, 1);
  const maxLoad = Math.max(loadWhPerHour, 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.chart}>
        {slice.map((point, index) => {
          const solarH = (solarValues[index] / maxSolar) * 72;
          const loadH = (loadWhPerHour / maxLoad) * 72;
          return (
            <View key={`${point.hour}-${index}`} style={styles.barCol}>
              <View style={styles.barStack}>
                <View style={[styles.solarBar, { height: Math.max(4, solarH) }]} />
                <View style={[styles.loadDot, { marginTop: 72 - loadH }]} />
              </View>
              <CaptionText style={styles.hourLabel}>{point.hour?.slice(0, 5) ?? ''}</CaptionText>
            </View>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.chartSolar }]} />
          <LabelText style={styles.legendText}>Solar</LabelText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.chartLoad }]} />
          <LabelText style={styles.legendText}>Load</LabelText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 100,
    paddingTop: spacing.sm,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  barStack: {
    height: 72,
    width: '70%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  solarBar: {
    width: '100%',
    backgroundColor: colors.chartSolar,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    opacity: 0.85,
  },
  loadDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.chartLoad,
    right: -2,
  },
  hourLabel: { fontSize: 10 },
  legend: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  legendText: { textTransform: 'none', fontSize: 12 },
});
