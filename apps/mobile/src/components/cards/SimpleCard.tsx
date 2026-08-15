import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardHeading } from '../ui/CardHeading';
import { BrandLogo } from '../ui/BrandLogo';
import { theme } from '../../theme';
import { text } from '../../utils/format';

interface SimpleCardProps {
  item: {
    title: string;
    question?: string;
    note?: string;
  };
}

export function SimpleCard({ item }: SimpleCardProps) {
  return (
    <View style={styles.card}>
      <CardHeading
        icon={<BrandLogo size={24} rounded />}
        iconBg={theme.colors.primaryLight}
        label="X-One AI Assistant"
        title={item.title}
      />
      {item.question || item.note ? (
        <Text style={styles.text}>{text(item.question ?? item.note)}</Text>
      ) : null}
    </View>
  );
}

export function FallbackCard({ item }: SimpleCardProps) {
  return (
    <View style={styles.card}>
      <CardHeading
        icon={<Ionicons name="information-circle" size={20} color={theme.colors.muted} />}
        iconBg={theme.colors.surfaceSubtle}
        label="X-One Thông Báo"
        title={item.title}
      />
      <Text style={styles.text}>
        {text(
          item.note ?? item.question,
          'Mình đã nhận thông tin mới và sẽ cập nhật ở bước tiếp theo.'
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    marginVertical: 5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  text: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.inkSecondary,
    lineHeight: 22,
    marginTop: 4,
  },
});
