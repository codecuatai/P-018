import React, { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';
import { text } from '../../utils/format';

interface CardHeadingProps {
  icon: ReactNode;
  label: string;
  title: unknown;
  iconBg?: string;
  iconColor?: string;
  badge?: string;
}

export function CardHeading({
  icon,
  label,
  title,
  iconBg = theme.colors.primaryLight,
  badge,
}: CardHeadingProps) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        {icon}
      </View>
      <View style={styles.textContainer}>
        <View style={styles.topMeta}>
          <Text style={styles.label}>{label.toUpperCase()}</Text>
          {badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {text(title, 'Thông tin mới')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
    marginBottom: theme.spacing.sm,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.muted,
    letterSpacing: 0.8,
  },
  badge: {
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  title: {
    fontSize: theme.fontSize.md,
    fontWeight: '800',
    color: theme.colors.ink,
    marginTop: 2,
    letterSpacing: -0.2,
  },
});
