import { StyleSheet, View } from 'react-native';

import { BodyText, CaptionText, HeadingText } from '@/components/mobile/typography';
import { colors, spacing } from '@/constants/theme';

type BatteryGaugeProps = {
  soc: number | null;
  voltage: number;
  current: number;
  batteryTemperature?: number;
};

export function BatteryGauge({
  soc,
  voltage,
  current,
  batteryTemperature = 0,
}: BatteryGaugeProps) {
  const pct = soc !== null ? Math.max(0, Math.min(100, soc)) : 0;
  return (
    <View style={styles.row}>
      <View style={styles.ringOuter}>
        <View style={[styles.ringFill, { height: `${pct}%` }]} />
        <View style={styles.ringCenter}>
          <HeadingText>{soc !== null ? `${pct.toFixed(0)}%` : 'N/A'}</HeadingText>
          <CaptionText>SOC</CaptionText>
        </View>
      </View>
      <View style={styles.metrics}>
        <View>
          <CaptionText>Voltage</CaptionText>
          <BodyText>{voltage > 0 ? `${voltage.toFixed(1)} V` : 'N/A'}</BodyText>
        </View>
        <View>
          <CaptionText>Current</CaptionText>
          <BodyText>{current > 0 ? `${current.toFixed(2)} A` : 'N/A'}</BodyText>
        </View>
        <View>
          <CaptionText>Temperature</CaptionText>
          <BodyText>{batteryTemperature.toFixed(1)} °C</BodyText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  ringOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 3,
    borderColor: colors.border,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  ringFill: {
    width: '100%',
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metrics: {
    flex: 1,
    gap: spacing.md,
  },
});
