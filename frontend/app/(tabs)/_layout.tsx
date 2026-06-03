import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { AppDataProvider } from '@/contexts/AppDataContext';
import { colors } from '@/constants/theme';

export default function TabLayout() {
  return (
    <AppDataProvider>
      <View style={styles.shell}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarStyle: styles.tabBar,
            tabBarLabelStyle: styles.tabLabel,
            tabBarButton: HapticTab,
            sceneStyle: styles.scene,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="devices"
            options={{
              title: 'Devices',
              tabBarIcon: ({ color, size }) => <Ionicons name="hardware-chip-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="optimize"
            options={{
              title: 'Optimize',
              tabBarIcon: ({ color, size }) => <Ionicons name="flash-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="forecast"
            options={{
              title: 'Forecast',
              tabBarIcon: ({ color, size }) => <Ionicons name="sunny-outline" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
            }}
          />
        </Tabs>
      </View>
    </AppDataProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scene: {
    backgroundColor: colors.background,
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
