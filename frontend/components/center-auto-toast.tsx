import { useCallback, useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export type CenterToastFeedback = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

const DEFAULT_DURATION_MS = 3500;

type CenterAutoToastProps = {
  feedback: CenterToastFeedback | null;
  durationMs?: number;
  onDismiss: () => void;
};

export function CenterAutoToast({ feedback, durationMs = DEFAULT_DURATION_MS, onDismiss }: CenterAutoToastProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!feedback) return undefined;
    const handle = setTimeout(() => onDismissRef.current(), durationMs);
    return () => clearTimeout(handle);
  }, [feedback, durationMs]);

  const dismiss = useCallback(() => {
    if (feedback) {
      onDismissRef.current();
    }
  }, [feedback]);

  if (!feedback) {
    return null;
  }

  const surfaceStyle =
    feedback.kind === 'success'
      ? styles.surfaceSuccess
      : feedback.kind === 'error'
        ? styles.surfaceError
        : styles.surfaceInfo;
  const messageStyle =
    feedback.kind === 'success'
      ? styles.messageSuccess
      : feedback.kind === 'error'
        ? styles.messageError
        : styles.messageInfo;

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss message">
        <View style={styles.centerWrap} pointerEvents="box-none">
          <Pressable onPress={(e) => e.stopPropagation()} accessibilityRole="text" accessibilityLiveRegion="polite">
            <View style={[styles.surface, surfaceStyle]}>
              <Text style={[styles.message, messageStyle]}>{feedback.message}</Text>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 35, 0.45)',
    paddingHorizontal: 28,
  },
  centerWrap: {
    maxWidth: 340,
    width: '100%',
  },
  surface: {
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  surfaceSuccess: {
    backgroundColor: '#e8f7ef',
    borderColor: '#7bc49a',
  },
  surfaceError: {
    backgroundColor: '#fdecea',
    borderColor: '#e09890',
  },
  surfaceInfo: {
    backgroundColor: '#e8f2fc',
    borderColor: '#7dafe0',
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  messageSuccess: { color: '#14532d' },
  messageError: { color: '#7f1d1d' },
  messageInfo: { color: '#0d3c61' },
});
