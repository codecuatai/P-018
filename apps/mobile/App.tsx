import 'react-native-gesture-handler';
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BrandLogo } from './src/components/ui/BrandLogo';
import { useAuth } from './src/hooks/useAuth';
import { AuthScreen } from './src/screens/AuthScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { theme } from './src/theme';
import type { SessionActivity } from './src/types';

type Tab = 'chat' | 'activity' | 'account';

function MainApp() {
  const insets = useSafeAreaInsets();
  const { currentUser, authLoading, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [activities, setActivities] = useState<SessionActivity[]>([]);

  const handleNewActivity = (activity: SessionActivity) => {
    setActivities((current) => [
      activity,
      ...current.filter((item) => item.id !== activity.id),
    ].slice(0, 40));
  };

  if (authLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="dark" />
        <View style={styles.brandContainer}>
          <BrandLogo size={64} rounded glow />
        </View>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Đang khởi động X-One Concierge…</Text>
      </View>
    );
  }

  if (!currentUser) {
    return (
      <>
        <StatusBar style="dark" />
        {/* Authentication always goes through the public Gateway. */}
        <AuthScreen onLogin={login} />
      </>
    );
  }

  const safeBottomNavPadding = Math.max(insets.bottom, 10);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* Main Tab Content */}
      <View style={styles.tabContent}>
        <View style={[styles.screen, activeTab !== 'chat' && styles.hiddenScreen]}>
          <ChatScreen user={currentUser} onActivity={handleNewActivity} />
        </View>
        <View style={[styles.screen, activeTab !== 'activity' && styles.hiddenScreen]}>
          <ActivityScreen
            activities={activities}
            onOpenChat={() => setActiveTab('chat')}
          />
        </View>
        <View style={[styles.screen, activeTab !== 'account' && styles.hiddenScreen]}>
          <AccountScreen user={currentUser} onLogout={logout} />
        </View>
      </View>

      {/* Luxury Bottom Floating Navigation Bar */}
      <View style={[styles.bottomNavContainer, { paddingBottom: safeBottomNavPadding }]}>
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={[styles.navItem, activeTab === 'chat' && styles.navItemActive]}
            onPress={() => setActiveTab('chat')}
            activeOpacity={0.75}
          >
            <View style={[styles.navIconBox, activeTab === 'chat' && styles.navIconBoxActive]}>
              <Ionicons
                name={activeTab === 'chat' ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                size={20}
                color={activeTab === 'chat' ? theme.colors.primary : theme.colors.muted}
              />
            </View>
            <Text
              style={[
                styles.navLabel,
                activeTab === 'chat' && styles.navLabelActive,
              ]}
            >
              Trợ lý
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navItem, activeTab === 'activity' && styles.navItemActive]}
            onPress={() => setActiveTab('activity')}
            activeOpacity={0.75}
          >
            <View style={[styles.navIconBox, activeTab === 'activity' && styles.navIconBoxActive]}>
              <Ionicons
                name={activeTab === 'activity' ? 'receipt' : 'receipt-outline'}
                size={20}
                color={activeTab === 'activity' ? theme.colors.primary : theme.colors.muted}
              />
              {activities.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{activities.length}</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.navLabel,
                activeTab === 'activity' && styles.navLabelActive,
              ]}
            >
              Hoạt động
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navItem, activeTab === 'account' && styles.navItemActive]}
            onPress={() => setActiveTab('account')}
            activeOpacity={0.75}
          >
            <View style={[styles.navIconBox, activeTab === 'account' && styles.navIconBoxActive]}>
              <Ionicons
                name={activeTab === 'account' ? 'person' : 'person-outline'}
                size={20}
                color={activeTab === 'account' ? theme.colors.primary : theme.colors.muted}
              />
            </View>
            <Text
              style={[
                styles.navLabel,
                activeTab === 'account' && styles.navLabelActive,
              ]}
            >
              Tài khoản
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    gap: 14,
  },
  brandContainer: {
    marginBottom: 8,
  },
  loadingText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  hiddenScreen: {
    display: 'none',
  },
  bottomNavContainer: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomNav: {
    flexDirection: 'row',
    height: 56,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  navItemActive: {},
  navIconBox: {
    padding: 3,
    borderRadius: theme.radius.full,
  },
  navIconBoxActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.muted,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  navLabelActive: {
    color: theme.colors.primary,
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -8,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.full,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
});
