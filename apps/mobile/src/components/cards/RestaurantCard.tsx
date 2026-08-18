import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardHeading } from '../ui/CardHeading';
import { DetailRow } from '../ui/DetailRow';
import { ActionButton } from '../ui/ActionButton';
import { theme } from '../../theme';
import { text, dateText } from '../../utils/format';
import type {
  AssistantAction,
  AssistantRestaurantOptionsItem,
  AssistantRestaurantConfirmationItem,
} from '../../types';

interface RestaurantCardProps {
  item: AssistantRestaurantOptionsItem;
  actions: AssistantAction[];
  onAction: (action: AssistantAction) => void;
  disabledActionId?: string;
}

export function RestaurantCard({
  item,
  actions,
  onAction,
  disabledActionId,
}: RestaurantCardProps) {
  const selectionActions = actions.filter(
    (action) => action.kind === 'select_restaurant'
  );

  return (
    <View style={styles.card}>
      <CardHeading
        icon={<Ionicons name="restaurant" size={20} color={theme.colors.restaurant} />}
        iconBg={theme.colors.restaurantBg}
        label="Khám phá nhà hàng"
        badge="Ẩm thực"
        title={item.title}
      />

      {item.options && item.options.length > 0 ? (
        <View style={styles.optionList}>
          {item.options.map((option, index) => {
            const action = selectionActions[index];
            return (
              <View key={`${String(option.name)}-${index}`} style={styles.optionRow}>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionName}>
                    {text(option.name, 'Nhà hàng')}
                  </Text>
                  
                  <View style={styles.badgeRow}>
                    {option.rating !== undefined && (
                      <View style={styles.ratingBadge}>
                        <Ionicons name="star" size={11} color="#D97706" />
                        <Text style={styles.ratingText}>{String(option.rating)}</Text>
                      </View>
                    )}
                    <View style={styles.cuisineBadge}>
                      <Text style={styles.cuisineText} numberOfLines={1}>
                        {text(option.cuisine, 'Ẩm thực')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.locationRow}>
                    <Ionicons name="location-sharp" size={13} color={theme.colors.muted} />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {text(option.location, 'Hà Nội')}
                    </Text>
                  </View>
                </View>

                {action && (
                  <ActionButton
                    label="Đặt bàn"
                    size="sm"
                    icon={<Ionicons name="calendar-outline" size={13} color="#FFFFFF" />}
                    onPress={() => onAction(action)}
                    disabled={Boolean(disabledActionId)}
                    style={styles.selectBtn}
                  />
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.note}>
          {text(item.note, 'Chưa có lựa chọn nhà hàng phù hợp.')}
        </Text>
      )}

      {item.note && <Text style={styles.note}>{text(item.note)}</Text>}
    </View>
  );
}

export function RestaurantConfirmationCard({
  item,
}: {
  item: AssistantRestaurantConfirmationItem;
}) {
  return (
    <View style={styles.card}>
      <CardHeading
        icon={<Ionicons name="checkmark-circle" size={20} color={theme.colors.restaurant} />}
        iconBg={theme.colors.restaurantBg}
        label="Xác nhận đặt bàn"
        badge="Đã giữ chỗ"
        title={item.title}
      />
      <View style={styles.detailContainer}>
        <DetailRow label="Nhà hàng" value={text(item.restaurant?.name, 'Nhà hàng đã chọn')} />
        <DetailRow label="Địa chỉ" value={text(item.restaurant?.location, 'Đang cập nhật')} />
        <DetailRow label="Mã xác nhận" value={text(item.reservation_code, 'GIA-8899')} />
        <DetailRow label="Thời gian đến" value={dateText(item.start_at)} />
        <DetailRow
          label="Số lượng khách"
          value={item.party_size ? `${String(item.party_size)} người lớn` : '2 người'}
        />
      </View>
      {item.note ? <Text style={styles.note}>{text(item.note)}</Text> : null}
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
    borderLeftColor: theme.colors.restaurant,
    marginVertical: 5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  optionList: {
    gap: 10,
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
  optionInfo: {
    flex: 1,
    marginRight: 10,
  },
  optionName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
    color: theme.colors.ink,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.warningBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.xs,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.warning,
  },
  cuisineBadge: {
    backgroundColor: theme.colors.restaurantBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.xs,
  },
  cuisineText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.restaurant,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  locationText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
  },
  selectBtn: {
    backgroundColor: theme.colors.restaurant,
    borderColor: 'transparent',
  },
  detailContainer: {
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginTop: 4,
  },
  note: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    marginTop: theme.spacing.sm,
    lineHeight: 18,
  },
});
