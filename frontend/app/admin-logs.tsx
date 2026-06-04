import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AuthScreenBackground, authScreenStyles } from '@/components/auth-screen-background';
import { onBgStyles } from '@/styles/on-bg';
import { useAuth } from '@/contexts/AuthContext';
import { getFirebaseAuthErrorMessage } from '@/lib/firebase-auth-errors';
import {
  ACTION_FILTER_GROUPS,
  ACTION_FILTER_LABELS,
  fetchActivityLogs,
  SYSTEM_POLL_ACTIONS,
  type LogActionFilter,
  type UserActivityLog,
} from '@/lib/admin-logs-api';
import { formatLogTimestamp } from '@/lib/format-log-timestamp';

const PAGE_SIZE = 25;

function actionCategory(action: string): string | null {
  if (action === 'RUN_OPTIMIZATION' || action === 'RUN_FORECAST' || action === 'SELECT_PLAN') {
    return 'Optimization';
  }
  if (action === 'LOGIN' || action === 'LOGOUT' || action === 'REGISTER') {
    return 'Authentication';
  }
  if (action.startsWith('CREATE_') || action.startsWith('UPDATE_') || action.startsWith('DELETE_')) {
    if (action.includes('DEVICE')) {
      return 'Devices';
    }
    return 'Solar settings';
  }
  return null;
}

function metadataPreview(metadata: Record<string, unknown>): string {
  const keys = Object.keys(metadata);
  if (keys.length === 0) {
    return 'No metadata';
  }
  return keys.slice(0, 4).join(', ') + (keys.length > 4 ? '…' : '');
}

export default function AdminLogsScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<UserActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [showSystemLogs, setShowSystemLogs] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchActivityLogs({
        page,
        limit: PAGE_SIZE,
        action: actionFilter || undefined,
        userEmail: emailFilter || undefined,
        excludeActions:
          !actionFilter && !showSystemLogs ? [...SYSTEM_POLL_ACTIONS] : undefined,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      Alert.alert('Failed to load logs', getFirebaseAuthErrorMessage(err, 'Unable to load activity logs.'));
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, emailFilter, showSystemLogs]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    void load();
  }, [isAdmin, load, reloadKey]);

  const applyFilters = () => {
    setPage(1);
    setReloadKey((key) => key + 1);
  };

  if (!isAdmin) {
    return (
      <AuthScreenBackground>
        <View style={authScreenStyles.form}>
          <Text style={authScreenStyles.title}>Admin access required</Text>
          <Pressable style={authScreenStyles.button} onPress={() => router.replace('/login')}>
            <Text style={authScreenStyles.buttonText}>Back to login</Text>
          </Pressable>
        </View>
      </AuthScreenBackground>
    );
  }

  return (
    <AuthScreenBackground variant="page">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={authScreenStyles.title}>User Activity Logs</Text>
          <Text style={styles.mutedOnDark}>
            {total} total · page {page} of {totalPages} · times shown in Israel (Asia/Jerusalem)
          </Text>
          <View style={styles.headerRow}>
            <Pressable style={authScreenStyles.secondaryButton} onPress={() => router.back()}>
              <Text style={authScreenStyles.secondaryButtonText}>Back</Text>
            </Pressable>
            <Pressable style={authScreenStyles.secondaryButton} onPress={() => void load()} disabled={loading}>
              <Text style={authScreenStyles.secondaryButtonText}>Refresh</Text>
            </Pressable>
          </View>
        </View>

        <View style={onBgStyles.onBgPanel}>
          <Text style={styles.filterHint}>
            Default list hides automatic optimization polling so LOGIN, LOGOUT, and device events stay visible.
          </Text>
          <Pressable
            style={[styles.chip, styles.showSystemChip, showSystemLogs && styles.chipActive]}
            onPress={() => {
              setShowSystemLogs((value) => !value);
              setPage(1);
              setReloadKey((key) => key + 1);
            }}
          >
            <Text style={styles.chipText}>
              {showSystemLogs ? 'Showing all logs (incl. system)' : 'Show system poll logs too'}
            </Text>
          </Pressable>

          <Text style={styles.filterLabel}>Filter by action</Text>
          <View style={styles.chipWrap}>
            <Pressable
              style={[styles.chip, !actionFilter && styles.chipActive]}
              onPress={() => {
                setActionFilter('');
                setPage(1);
                setReloadKey((key) => key + 1);
              }}
            >
              <Text style={styles.chipText}>All user actions</Text>
            </Pressable>
          </View>

          {ACTION_FILTER_GROUPS.map((group) => (
            <View key={group.title} style={styles.filterGroup}>
              <Text style={styles.filterGroupTitle}>{group.title}</Text>
              <View style={styles.chipWrap}>
                {group.actions.map((action) => (
                  <Pressable
                    key={action}
                    style={[styles.chip, actionFilter === action && styles.chipActive]}
                    onPress={() => {
                      setActionFilter(action);
                      setPage(1);
                      setReloadKey((key) => key + 1);
                    }}
                  >
                    <Text style={styles.chipText}>
                      {ACTION_FILTER_LABELS[action as LogActionFilter] ?? action}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          <Text style={[styles.filterLabel, styles.emailFilterLabel]}>Filter by user email</Text>
          <TextInput
            style={authScreenStyles.input}
            value={emailFilter}
            onChangeText={setEmailFilter}
            placeholder="user@example.com"
            placeholderTextColor="rgba(255,255,255,0.5)"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Pressable style={authScreenStyles.button} onPress={applyFilters}>
            <Text style={authScreenStyles.buttonText}>Apply filters</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#e0f2fe" />
            <Text style={styles.mutedOnDark}>Loading logs…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={onBgStyles.onBgPanel}>
            <Text style={authScreenStyles.message}>No logs match your filters.</Text>
          </View>
        ) : (
          items.map((row) => {
            const expanded = expandedId === row.id;
            return (
              <Pressable
                key={row.id}
                style={onBgStyles.onBgPanel}
                onPress={() => setExpandedId(expanded ? null : row.id)}
              >
                <Text style={authScreenStyles.email}>{row.user_email || row.user_id || '—'}</Text>
                <View style={styles.logActionRow}>
                  <Text style={styles.logAction}>{row.action}</Text>
                  {actionCategory(row.action) ? (
                    <Text style={styles.logCategory}>{actionCategory(row.action)}</Text>
                  ) : null}
                </View>
                <Text style={authScreenStyles.muted}>{formatLogTimestamp(row.created_at)}</Text>
                <Text style={authScreenStyles.muted}>Metadata: {metadataPreview(row.metadata)}</Text>
                {expanded ? (
                  <View style={styles.metadataBox}>
                    <Text style={styles.metadataJson}>{JSON.stringify(row.metadata, null, 2)}</Text>
                    {row.entity_type ? (
                      <Text style={authScreenStyles.muted}>
                        Entity: {row.entity_type}
                        {row.entity_id ? ` · ${row.entity_id}` : ''}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.expandHint}>Tap to expand metadata</Text>
                )}
              </Pressable>
            );
          })
        )}

        <View style={styles.pagination}>
          <Pressable
            style={[authScreenStyles.secondaryButton, page <= 1 && styles.disabled]}
            disabled={page <= 1 || loading}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
          >
            <Text style={authScreenStyles.secondaryButtonText}>Previous</Text>
          </Pressable>
          <Pressable
            style={[authScreenStyles.secondaryButton, page >= totalPages && styles.disabled]}
            disabled={page >= totalPages || loading}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <Text style={authScreenStyles.secondaryButtonText}>Next</Text>
          </Pressable>
        </View>
      </ScrollView>
    </AuthScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 32 },
  header: { gap: 6, marginBottom: 4 },
  headerRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 },
  mutedOnDark: { color: '#e2e8f0' },
  filterHint: { color: '#cbd5e1', fontSize: 12, lineHeight: 18, marginBottom: 8 },
  showSystemChip: { alignSelf: 'flex-start', marginBottom: 10 },
  filterLabel: { color: '#fff', fontWeight: '700', marginTop: 4 },
  emailFilterLabel: { marginTop: 12 },
  filterGroup: { marginTop: 10, gap: 6 },
  filterGroupTitle: {
    color: '#bae6fd',
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 4,
    width: '100%',
  },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    maxWidth: '100%',
  },
  chipActive: { backgroundColor: '#0a7ea4', borderColor: '#7dd3fc' },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  loadingBox: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10 },
  logActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  logAction: { color: '#fde68a', fontWeight: '800', fontSize: 15 },
  logCategory: {
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metadataBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
    gap: 6,
  },
  metadataJson: { color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12 },
  expandHint: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  pagination: { flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 8 },
  disabled: { opacity: 0.45 },
});
