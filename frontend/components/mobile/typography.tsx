import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { colors, typography } from '@/constants/theme';

type TextProps = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export function TitleText({ children, style }: TextProps) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function HeadingText({ children, style }: TextProps) {
  return <Text style={[styles.heading, style]}>{children}</Text>;
}

export function BodyText({ children, style, numberOfLines }: TextProps) {
  return (
    <Text style={[styles.body, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function CaptionText({ children, style, numberOfLines }: TextProps) {
  return (
    <Text style={[styles.caption, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

export function LabelText({ children, style }: TextProps) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: { ...typography.title, color: colors.text },
  heading: { ...typography.heading, color: colors.text },
  body: { ...typography.body, color: colors.text },
  caption: { ...typography.caption, color: colors.textSecondary },
  label: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
});
