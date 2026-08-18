import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardHeading } from '../ui/CardHeading';
import { MetricRow } from '../ui/MetricRow';
import { theme } from '../../theme';
import { text, formatMoney } from '../../utils/format';
import type { AssistantFoodItem } from '../../types';

export function FoodCard({ item }: { item: AssistantFoodItem }) {
  const order = item.order;

  return (
    <View style={styles.card}>
      <CardHeading
        icon={<Ionicons name="fast-food" size={20} color={theme.colors.food} />}
        iconBg={theme.colors.foodBg}
        label="Dịch vụ Đồ ăn & Giao hàng"
        badge="Giao tận nơi"
        title={item.title}
      />

      {item.options && item.options.length > 0 ? (
        <View style={styles.optionList}>
          {item.options.map((option, index) => (
            <View key={`${String(option.name)}-${index}`} style={styles.optionRow}>
              <View style={styles.foodIcon}>
                <Ionicons name="restaurant-outline" size={16} color={theme.colors.food} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionName}>{text(option.name, 'Món ăn')}</Text>
                <Text style={styles.optionSub}>
                  {text(
                    option.restaurant,
                    text(option.description, 'Quán ngon được đề xuất')
                  )}
                </Text>
              </View>
              <View style={styles.priceBadge}>
                <Text style={styles.priceText}>{formatMoney(option.price, 'VND')}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.note}>Mình đang lấy danh sách món ăn phù hợp.</Text>
      )}

      {order && (
        <MetricRow
          metrics={[
            { label: 'Mã đơn', value: text(order.id, 'ORD-8899') },
            { label: 'Trạng thái', value: text(order.status, 'Đang chuẩn bị') },
          ]}
        />
      )}

      {(item.note || item.payment) && (
        <View style={styles.paymentNoteRow}>
          <Ionicons name="wallet-outline" size={15} color={theme.colors.food} />
          <Text style={styles.paymentNote}>
            {text(
              item.note,
              item.payment ? 'Thanh toán trực tuyến đã hoàn tất qua Food Service.' : ''
            )}
          </Text>
        </View>
      )}
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
    borderLeftColor: theme.colors.food,
    marginVertical: 5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  optionList: {
    gap: 8,
    marginTop: 4,
  },
  optionRow: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.lineLight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  foodIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.foodBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  optionInfo: {
    flex: 1,
    marginRight: 8,
  },
  optionName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
    color: theme.colors.ink,
  },
  optionSub: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    marginTop: 2,
  },
  priceBadge: {
    backgroundColor: theme.colors.foodBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  priceText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
    color: theme.colors.food,
  },
  paymentNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  paymentNote: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    flex: 1,
  },
  note: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    marginTop: theme.spacing.sm,
    lineHeight: 18,
  },
});
