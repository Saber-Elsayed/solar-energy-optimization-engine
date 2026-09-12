import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/mobile/card';
import { ScreenHeader } from '@/components/mobile/screen';
import { BodyText, CaptionText, HeadingText, TitleText } from '@/components/mobile/typography';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppData } from '@/contexts/AppDataContext';
import {
  FRIENDLY_AGENT_ERROR,
  mapToolLabel,
  postAgentRecommend,
  type AgentPlan,
  type AgentRecommendResponse,
} from '@/lib/agent-recommend';

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: number;
  plan?: AgentPlan;
  sources?: string[];
  toolsUsed?: string[];
  error?: boolean;
};

const SUGGESTIONS = [
  'What can I run right now?',
  'Why is my battery important?',
  'What does SOC mean?',
  "Why can't I run my washing machine?",
];

function knowledgeTitle(question: string, toolsUsed?: string[]): string | null {
  if (!toolsUsed?.includes('rag')) {
    return null;
  }
  const lower = question.toLowerCase();
  if (lower.includes('soc')) {
    return '🔋 State of Charge';
  }
  if (lower.includes('battery')) {
    return 'Battery';
  }
  if (lower.includes('inverter')) {
    return 'Inverter limit';
  }
  if (lower.includes('optimizer') || lower.includes('or-tools') || lower.includes('or tools')) {
    return 'Energy optimizer';
  }
  return 'Sola Home knowledge';
}

function deviceName(item: { name?: string } | undefined): string {
  return item?.name?.trim() || 'Unnamed device';
}

function formatEnergyKwh(wh: number): string {
  return `${(wh / 1000).toFixed(1)} kWh`;
}

function hasUsefulPlan(plan?: AgentPlan, toolsUsed?: string[]): boolean {
  if (!plan) {
    return false;
  }
  const status = (plan.solver_status || '').toUpperCase();
  if (status === 'NOT_RUN' || status === '') {
    return Boolean(toolsUsed?.includes('or_tools'));
  }
  return true;
}

export default function AssistantScreen() {
  const { displayCity } = useAppData();
  const scrollRef = useRef<ScrollView>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [retryPayload, setRetryPayload] = useState<string | null>(null);

  const city = displayCity?.trim() || 'Tel Aviv';

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  };

  const sendMessage = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      createdAt: Date.now(),
    };
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setRetryPayload(null);
    setSending(true);
    scrollToEnd();

    try {
      const response: AgentRecommendResponse = await postAgentRecommend(text, city);
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: (response.explanation || '').trim() || 'I received a recommendation, but it had no explanation text.',
        createdAt: Date.now(),
        plan: response.plan,
        sources: response.rag_sources,
        toolsUsed: response.tools_used,
      };
      setMessages((current) => [...current, assistantMessage]);
    } catch {
      setRetryPayload(text);
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          text: FRIENDLY_AGENT_ERROR,
          createdAt: Date.now(),
          error: true,
        },
      ]);
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  const empty = messages.length === 0 && !sending;

  const lastUserQuestion = useMemo(() => {
    const lastUser = [...messages].reverse().find((item) => item.role === 'user');
    return lastUser?.text ?? '';
  }, [messages]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.column}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.headerBar}>
          <ScreenHeader>
            <TitleText>{'\u{1F916}'} Energy Assistant</TitleText>
            <CaptionText>Your smart solar energy companion</CaptionText>
          </ScreenHeader>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.threadScroll}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (!empty) {
              scrollToEnd();
            }
          }}
        >
          {empty ? (
            <Card>
              <HeadingText>Hi! I'm your Sola Energy Assistant.</HeadingText>
              <BodyText>
                Ask me about your battery, solar energy, appliances, or what you can run.
              </BodyText>
              <CaptionText>Recommendations only — the app does not turn appliances on or off.</CaptionText>
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((question) => (
                  <Pressable
                    key={question}
                    accessibilityRole="button"
                    onPress={() => void sendMessage(question)}
                    style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                  >
                    <CaptionText style={styles.chipText}>{question}</CaptionText>
                  </Pressable>
                ))}
              </View>
            </Card>
          ) : null}

          {messages.map((message, index) => {
            if (message.role === 'user') {
              return (
                <View key={message.id} style={styles.userWrap}>
                  <View style={styles.userBubble}>
                    <BodyText style={styles.userText}>{message.text}</BodyText>
                  </View>
                </View>
              );
            }

            const questionForTitle =
              [...messages.slice(0, index + 1)].reverse().find((item) => item.role === 'user')?.text ??
              lastUserQuestion;
            const title = knowledgeTitle(questionForTitle, message.toolsUsed);
            const showPlan = hasUsefulPlan(message.plan, message.toolsUsed);
            const canRun = message.plan?.can_run ?? [];
            const cannotRun = message.plan?.cannot_run ?? [];

            return (
              <View key={message.id} style={styles.assistantWrap}>
                <Card style={message.error ? styles.errorCard : undefined}>
                  {title ? <HeadingText>{title}</HeadingText> : <CaptionText>Sola Energy Assistant</CaptionText>}
                  <BodyText>{message.text}</BodyText>

                  {showPlan ? (
                    <View style={styles.planBox}>
                      <HeadingText>Energy Recommendation</HeadingText>
                      <CaptionText>Current recommendation — not a full timetable.</CaptionText>

                      <CaptionText style={styles.planLabel}>Can run</CaptionText>
                      {canRun.length === 0 ? (
                        <BodyText>No devices were recommended to run right now.</BodyText>
                      ) : (
                        canRun.map((device, deviceIndex) => (
                          <BodyText key={`can-${deviceIndex}`}>✓ {deviceName(device)}</BodyText>
                        ))
                      )}

                      <CaptionText style={styles.planLabel}>Not recommended</CaptionText>
                      {cannotRun.length === 0 ? (
                        <BodyText>No devices were left out of this recommendation.</BodyText>
                      ) : (
                        cannotRun.map((item, deviceIndex) => (
                          <BodyText key={`no-${deviceIndex}`}>✕ {deviceName(item.device)}</BodyText>
                        ))
                      )}

                      {typeof message.plan?.total_energy_wh === 'number' ? (
                        <CaptionText>Energy used: {formatEnergyKwh(message.plan.total_energy_wh)}</CaptionText>
                      ) : null}
                      {typeof message.plan?.remaining_energy_wh === 'number' ? (
                        <CaptionText>Remaining: {formatEnergyKwh(message.plan.remaining_energy_wh)}</CaptionText>
                      ) : null}
                      {typeof message.plan?.total_power_w === 'number' ? (
                        <CaptionText>Total power: {message.plan.total_power_w.toFixed(0)} W</CaptionText>
                      ) : null}
                      {message.plan?.solver_status ? (
                        <CaptionText>Status: {message.plan.solver_status}</CaptionText>
                      ) : null}
                    </View>
                  ) : null}

                  {message.sources && message.sources.length > 0 ? (
                    <View>
                      <CaptionText style={styles.planLabel}>Sources</CaptionText>
                      {message.sources.map((source) => (
                        <CaptionText key={source}>• {source}</CaptionText>
                      ))}
                    </View>
                  ) : null}

                  {message.toolsUsed && message.toolsUsed.length > 0 ? (
                    <View>
                      <CaptionText style={styles.planLabel}>Analysis</CaptionText>
                      {message.toolsUsed.map((tool) => (
                        <CaptionText key={tool}>✓ {mapToolLabel(tool)}</CaptionText>
                      ))}
                    </View>
                  ) : null}

                  {message.error && retryPayload ? (
                    <Pressable
                      onPress={() => void sendMessage(retryPayload)}
                      style={({ pressed }) => [styles.retry, pressed && styles.chipPressed]}
                    >
                      <CaptionText style={styles.retryText}>Try again</CaptionText>
                    </Pressable>
                  ) : null}
                </Card>
              </View>
            );
          })}

          {sending ? (
            <Card>
              <View style={styles.thinking}>
                <ActivityIndicator color={colors.primary} />
                <BodyText>Sola is thinking...</BodyText>
              </View>
            </Card>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask about energy, battery, or appliances"
            placeholderTextColor={colors.textMuted}
            editable={!sending}
            multiline
            style={styles.input}
            onSubmitEditing={() => void sendMessage(draft)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            onPress={() => void sendMessage(draft)}
            disabled={sending || !draft.trim()}
            style={({ pressed }) => [
              styles.send,
              (sending || !draft.trim()) && styles.sendDisabled,
              pressed && styles.chipPressed,
            ]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  column: {
    flex: 1,
    flexDirection: 'column',
  },
  threadScroll: {
    flex: 1,
    minHeight: 0,
  },
  headerBar: {
    backgroundColor: colors.background,
    paddingTop: spacing.sm,
  },
  thread: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  suggestions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipPressed: { opacity: 0.85 },
  chipText: { color: colors.text },
  userWrap: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '86%',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  userText: { color: '#fff' },
  assistantWrap: { alignItems: 'stretch' },
  errorCard: {
    borderColor: '#FECACA',
    backgroundColor: colors.dangerSoft,
  },
  planBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  planLabel: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  retry: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  retryText: { color: colors.text, fontWeight: '700' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.45 },
});
