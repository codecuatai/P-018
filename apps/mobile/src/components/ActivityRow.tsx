import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { formatDateTime } from '../utils/format';
import type { SessionActivity } from '../types';

export function ActivityRow({ activity }: { activity: SessionActivity }) {
  const getDomainIcon = () => {
    const text = (activity.title + activity.detail).toLowerCase();
    if (text.includes('xe') || text.includes('ride')) {
      return { name: 'car-sport' as const, color: theme.colors.ride, bg: theme.colors.rideBg };
    }
    if (text.includes('nhà hàng') || text.includes('bàn')) {
      return { name: 'restaurant' as const, color: theme.colors.restaurant, bg: theme.colors.restaurantBg };
    }
    if (text.includes('khám') || text.includes('bác sĩ') || text.includes('y tế')) {
      return { name: 'medkit' as const, color: theme.colors.healthcare, bg: theme.colors.healthcareBg };
    }
    return { name: 'fast-food' as const, color: theme.colors.food, bg: theme.colors.foodBg };
  };

  const domain = getDomainIcon();

  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: domain.bg }]}>
        <Ionicons name={domain.name} size={18} color={domain.color} />
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {activity.title}
          </Text>
          <Text style={styles.timestamp}>{formatDateTime(activity.timestamp)}</Text>
        </View>

        <Text style={styles.detail}>{activity.detail}</Text>

        <View style={styles.metaRow}>
          <View style={styles.refBadge}>
            <Text style={styles.refLabel}>Mã: </Text>
            <Text style={styles.refValue}>{activity.reference}</Text>
          </View>

          <View style={styles.statusBadge}>
            <Ionicons name="checkmark-circle" size={12} color={theme.colors.success} />
            <Text style={styles.statusText}>{activity.status}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: theme.colors.line,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
    color: theme.colors.ink,
    flex: 1,
    marginRight: 8,
  },
  timestamp: {
    fontSize: 10,
    color: theme.colors.muted,
  },
  detail: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.inkSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.xs,
  },
  refLabel: {
    fontSize: 10,
    color: theme.colors.muted,
    fontWeight: '600',
  },
  refValue: {
    fontSize: 10,
    color: theme.colors.primary,
    fontWeight: '800',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.successBg,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: theme.radius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.success,
  },
});
