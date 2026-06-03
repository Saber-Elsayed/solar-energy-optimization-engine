import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { CaptionText, HeadingText } from '@/components/mobile/typography';
import { colors, radius, spacing } from '@/constants/theme';

type StatPillProps = {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
};

export function StatPill({ icon, value, label }: StatPillProps) {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <HeadingText style={styles.value}>{value}</HeadingText>
      <CaptionText>{label}</CaptionText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  value: {
    fontSize: 16,
  },
});
