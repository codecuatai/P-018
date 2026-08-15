import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardHeading } from '../ui/CardHeading';
import { MetricRow } from '../ui/MetricRow';
import { DetailRow } from '../ui/DetailRow';
import { theme } from '../../theme';
import { text, dateText, formatMoney } from '../../utils/format';
import type {
  AssistantRideItem,
  AssistantRideTimingConflictItem,
} from '../../types';

export function RideCard({ item }: { item: AssistantRideItem }) {
  return (
    <View style={styles.card}>
      <CardHeading
        icon={<Ionicons name="car-sport" size={20} color={theme.colors.ride} />}
        iconBg={theme.colors.rideBg}
        label="Dịch vụ di chuyển"
        badge="VinFast Electric"
        title={item.title}
      />

      {/* Visual Timeline Route */}
      <View style={styles.routeContainer}>
        <View style={styles.timelineVisual}>
          <View style={styles.startDot} />
          <View style={styles.timelineLine} />
          <View style={styles.endDot} />
        </View>

        <View style={styles.routePoints}>
          <View style={styles.routePoint}>
            <Text style={styles.routeLabel}>ĐIỂM ĐÓN</Text>
            <Text style={styles.routeName} numberOfLines={1}>
              {text(item.pickup, 'Điểm đón của bạn')}
            </Text>
          </View>

          <View style={styles.routePoint}>
            <Text style={styles.routeLabel}>ĐIỂM ĐẾN</Text>
            <Text style={styles.routeName} numberOfLines={1}>
              {text(item.dropoff, 'Điểm đến của bạn')}
            </Text>
          </View>
        </View>
      </View>

      <MetricRow
        metrics={[
          { label: 'Loại xe', value: text(item.vehicle, 'VF 8 Electric') },
          {
            label: 'Thời gian',
            value: item.duration_minutes ? `${String(item.duration_minutes)} phút` : '25 phút',
          },
          {
            label: 'Ước tính',
            value: formatMoney(item.amount, text(item.currency, 'VND')),
          },
        ]}
      />

      {item.recommended_departure && (
        <View style={styles.detailContainer}>
          <DetailRow
            label="Khung giờ xuất phát lý tưởng"
            value={dateText(item.recommended_departure)}
          />
          <DetailRow
            label="Trạng thái tài xế"
            value={item.driver || 'Đang sẵn sàng nhận cuốc'}
          />
        </View>
      )}

      {item.schedule_note && <Text style={styles.note}>{text(item.schedule_note)}</Text>}
    </View>
  );
}

export function RideTimingConflictCard({
  item,
}: {
  item: AssistantRideTimingConflictItem;
}) {
  return (
    <View style={[styles.card, { borderLeftColor: theme.colors.warning }]}>
      <CardHeading
        icon={<Ionicons name="warning" size={20} color={theme.colors.warning} />}
        iconBg={theme.colors.warningBg}
        label="Cảnh báo lịch trình"
        badge="Xung đột giờ"
        title={item.title}
      />
      {item.appointment_start_time && (
        <View style={styles.detailContainer}>
          <DetailRow label="Giờ hẹn khám" value={dateText(item.appointment_start_time)} />
          {item.recommended_departure && (
            <DetailRow label="Giờ cần xuất phát" value={dateText(item.recommended_departure)} />
          )}
        </View>
      )}
      <Text style={styles.warningNote}>
        {text(
          item.note,
          'Thời gian di chuyển có thể làm bạn muộn giờ hẹn. Bạn có muốn đổi lịch sang khung giờ sau?'
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
    borderLeftColor: theme.colors.ride,
    marginVertical: 5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.lineLight,
  },
  timelineVisual: {
    alignItems: 'center',
    marginRight: theme.spacing.md,
    height: 60,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  startDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.ride,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.colors.line,
    marginVertical: 2,
  },
  endDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  routePoints: {
    flex: 1,
    height: 60,
    justifyContent: 'space-between',
  },
  routePoint: {},
  routeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: theme.colors.muted,
    letterSpacing: 0.5,
  },
  routeName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.ink,
    marginTop: 1,
  },
  detailContainer: {
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginTop: theme.spacing.xs,
  },
  note: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.muted,
    marginTop: theme.spacing.sm,
    lineHeight: 18,
  },
  warningNote: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.warning,
    marginTop: theme.spacing.sm,
    lineHeight: 18,
  },
});
