import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BrandLogo } from '../components/ui/BrandLogo';
import { useChat } from '../hooks/useChat';
import { ChatMessageItem } from '../components/ChatMessage';
import { WelcomeState } from '../components/WelcomeState';
import { Composer } from '../components/Composer';
import { theme } from '../theme';
import type { AuthUser, SessionActivity, ChatMessage } from '../types';

interface ChatScreenProps {
  user: AuthUser;
  onActivity: (activity: SessionActivity) => void;
}

export function ChatScreen({ user, onActivity }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 0);

  const {
    messages,
    sending,
    activeActionId,
    send,
    handleAction,
    newConversation,
  } = useChat({ user, onActivity });

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const domainPills = [
    { label: 'Chuyến xe', prompt: 'Đặt xe VinFast 4 chỗ', icon: 'car-sport' as const, color: theme.colors.ride, bg: theme.colors.rideBg, border: theme.colors.rideBorder },
    { label: 'Nhà hàng', prompt: 'Tìm nhà hàng 2 người tối nay', icon: 'restaurant' as const, color: theme.colors.restaurant, bg: theme.colors.restaurantBg, border: theme.colors.restaurantBorder },
    { label: 'Lịch khám', prompt: 'Đặt lịch khám chuyên khoa Thần kinh', icon: 'medkit' as const, color: theme.colors.healthcare, bg: theme.colors.healthcareBg, border: theme.colors.healthcareBorder },
    { label: 'Đồ ăn', prompt: 'Tìm phở bò giao tận nơi', icon: 'fast-food' as const, color: theme.colors.food, bg: theme.colors.foodBg, border: theme.colors.foodBorder },
  ];

  const handleSend = (text: string) => {
    void send(text);
  };

  const handleRetry = (text: string) => {
    void send(text);
  };

  return (
    <View style={[styles.safeArea, { paddingTop: safeTop }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Modern Header with App Logo */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <BrandLogo size={38} rounded glow />

            <View style={styles.headerTitleGroup}>
              <View style={styles.titleRow}>
                <Text style={styles.headerTitle}>X-One Concierge</Text>
                <View style={styles.onlineBadge}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlineText}>LIVE</Text>
                </View>
              </View>
              <Text style={styles.headerSubtitle}>Trợ lý điều phối đa dịch vụ</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.newChatButton}
            onPress={newConversation}
            activeOpacity={0.75}
          >
            <Ionicons name="add" size={16} color={theme.colors.primary} />
            <Text style={styles.newChatText}>Đoạn chat mới</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Domain Filter Chips */}
        <View style={styles.chipBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipScroll}
          >
            {domainPills.map((pill, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.domainChip,
                  { backgroundColor: pill.bg, borderColor: pill.border },
                ]}
                onPress={() => handleSend(pill.prompt)}
                activeOpacity={0.75}
              >
                <Ionicons name={pill.icon} size={14} color={pill.color} />
                <Text style={[styles.chipText, { color: pill.color }]}>{pill.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Message Feed */}
        <FlatList<ChatMessage>
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }: { item: ChatMessage }) => (
            <ChatMessageItem
              message={item}
              onAction={handleAction}
              onRetry={handleRetry}
              onRetryAction={handleAction}
              activeActionId={activeActionId}
            />
          )}
          ListEmptyComponent={<WelcomeState onStart={handleSend} />}
          contentContainerStyle={styles.feedContent}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        />

        {/* Composer */}
        <Composer onSend={handleSend} disabled={sending} />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitleGroup: {
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
    color: theme.colors.ink,
    letterSpacing: -0.2,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.successBg,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.radius.full,
  },
  onlineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.success,
  },
  onlineText: {
    fontSize: 9,
    fontWeight: '800',
    color: theme.colors.success,
  },
  headerSubtitle: {
    fontSize: 11,
    color: theme.colors.muted,
    marginTop: 1,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  newChatText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  chipBar: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.lineLight,
    paddingVertical: 8,
  },
  chipScroll: {
    paddingHorizontal: theme.spacing.md,
    gap: 8,
  },
  domainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  feedContent: {
    paddingVertical: theme.spacing.md,
    flexGrow: 1,
  },
});
