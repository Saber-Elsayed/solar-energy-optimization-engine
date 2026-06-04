import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { onBgStyles } from '@/styles/on-bg';
import { ThemedText } from '@/components/themed-text';
import { comboStyles } from '@/components/combination-catalog-ui';
import { getHomeSqm, resetNightPlanHomeProfile, setHomeSqm } from '@/lib/night-plan-store';
import { clearDayPlanEssentials } from '@/lib/day-plan-essentials-store';
import { setDaySetupComplete } from '@/lib/day-plan-store';

type HomeSqmEditorProps = {
  onUpdated?: () => void;
  /** Reset day plan wizard when home size changes */
  resetDaySetup?: boolean;
};

export function HomeSqmEditor({ onUpdated, resetDaySetup = true }: HomeSqmEditorProps) {
  const current = getHomeSqm();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(current ? String(current) : '');
  const [message, setMessage] = useState<string | null>(null);

  const startEdit = () => {
    setInput(current ? String(current) : '');
    setEditing(true);
    setMessage(null);
  };

  const save = () => {
    const parsed = Number(input.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed <= 0) {
      setMessage('Enter a valid home size in m².');
      return;
    }
    setHomeSqm(parsed);
    if (resetDaySetup) {
      clearDayPlanEssentials();
      setDaySetupComplete(false);
    }
    setEditing(false);
    setMessage(`Home size updated to ${Math.round(parsed)} m². Re-run product suggestions if needed.`);
    onUpdated?.();
  };

  const reset = () => {
    resetNightPlanHomeProfile();
    if (resetDaySetup) {
      clearDayPlanEssentials();
      setDaySetupComplete(false);
    }
    setEditing(false);
    setInput('');
    setMessage('Home size cleared. Complete Step 1 again in Day or Night plan.');
    onUpdated?.();
  };

  return (
    <View style={onBgStyles.onBgPanel}>
      <ThemedText type="subtitle" lightColor="#fff">
        Home size (m²)
      </ThemedText>
      <ThemedText lightColor="#fff" style={comboStyles.muted}>
        Shared by Day plan and Night plan · stored on this device
      </ThemedText>
      {!editing ? (
        <>
          <ThemedText type="defaultSemiBold" lightColor="#fff">
            {current ? `${current} m²` : 'Not set yet'}
          </ThemedText>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <Pressable style={onBgStyles.onBgActionButton} onPress={startEdit}>
              <Text style={onBgStyles.onBgActionButtonText}>Update home size</Text>
            </Pressable>
            {current ? (
              <Pressable style={onBgStyles.onBgActionButton} onPress={reset}>
                <Text style={onBgStyles.onBgActionButtonText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : (
        <>
          <TextInput
            style={onBgStyles.onBgInput}
            keyboardType="numeric"
            placeholder="e.g. 85"
            value={input}
            onChangeText={setInput}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable style={onBgStyles.onBgActionButton} onPress={save}>
              <Text style={onBgStyles.onBgActionButtonText}>Save</Text>
            </Pressable>
            <Pressable style={onBgStyles.onBgActionButton} onPress={() => setEditing(false)}>
              <Text style={onBgStyles.onBgActionButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      )}
      {message ? (
        <ThemedText lightColor="#bbf7d0" style={{ marginTop: 8 }}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}
