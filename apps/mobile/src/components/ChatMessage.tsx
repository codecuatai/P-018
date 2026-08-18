import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BrandLogo } from './ui/BrandLogo';
import { WorkflowCards } from './WorkflowCards';
import { ActionButton } from './ui/ActionButton';
import { theme } from '../theme';
import { formatTime } from '../utils/format';
import type { AssistantAction, ChatMessage as ChatMessageType } from '../types';

interface ChatMessageProps {
  message: ChatMessageType;
  onAction: (action: AssistantAction) => void;
  onRetry: (text: string) => void;
  onRetryAction: (action: AssistantAction) => void;
  activeActionId?: string;
}

export function ChatMessageItem({
  message,
  onAction,
  onRetry,
  onRetryAction,
  activeActionId,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isError = message.requestStatus === 'error';
  const isSending = message.requestStatus === 'sending';

  return (
    <View style={[styles.container, isUser && styles.userContainer]}>
      {!isUser && (
        <View style={styles.assistantAvatarBox}>
          <BrandLogo size={32} rounded glow />
        </View>
      )}

      <View style={[styles.bubbleWrapper, isUser && styles.userBubbleWrapper]}>
        <View style={styles.metaRow}>
          <Text style={styles.senderName}>{isUser ? 'Bạn' : 'X-One Concierge'}</Text>
          <Text style={styles.timestamp}>{formatTime(message.timestamp)}</Text>
        </View>

        <View
          style={[
            styles.bubble,
            isUser ? styles.userBubble : styles.assistantBubble,
            isError && styles.errorBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userMessageText : styles.assistantMessageText,
              isError && styles.errorMessageText,
            ]}
          >
            {message.text}
          </Text>

          {isSending && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Đang điều phối các dịch vụ…</Text>
            </View>
          )}
        </View>

        {message.response && (
          <WorkflowCards
            response={message.response}
            onAction={onAction}
            disabledActionId={activeActionId}
          />
        )}

        {isError && message.retryText && (
          <ActionButton
            label="Thử lại"
            icon={<Ionicons name="refresh" size={14} color={theme.colors.danger} />}
            size="sm"
            variant="danger"
            onPress={() => onRetry(message.retryText!)}
            style={styles.retryButton}
          />
        )}

        {isError && message.retryAction && (
          <ActionButton
            label="Thử lại hành động"
            icon={<Ionicons name="refresh" size={14} color={theme.colors.danger} />}
            size="sm"
            variant="danger"
            onPress={() => onRetryAction(message.retryAction!)}
            disabled={Boolean(activeActionId)}
            style={styles.retryButton}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 8,
    paddingHorizontal: theme.spacing.md,
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  assistantAvatarBox: {
    marginRight: 8,
    marginTop: 18,
  },
  bubbleWrapper: {
    maxWidth: '85%',
  },
  userBubbleWrapper: {
    alignItems: 'flex-end',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  senderName: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: theme.colors.muted,
  },
  timestamp: {
    fontSize: 10,
    color: theme.colors.mutedLight,
  },
  bubble: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.radius.xl,
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: theme.radius.xs,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  assistantBubble: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderBottomLeftRadius: theme.radius.xs,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  errorBubble: {
    backgroundColor: theme.colors.dangerBg,
    borderColor: theme.colors.dangerBorder,
  },
  messageText: {
    fontSize: theme.fontSize.sm,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  assistantMessageText: {
    color: theme.colors.ink,
  },
  errorMessageText: {
    color: theme.colors.danger,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  loadingText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    fontWeight: '600',
  },
  retryButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
});
