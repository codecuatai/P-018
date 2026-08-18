import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CardHeading } from '../ui/CardHeading';
import { DetailRow } from '../ui/DetailRow';
import { ActionButton } from '../ui/ActionButton';
import { theme } from '../../theme';
import { text, dateText, formatMoney } from '../../utils/format';
import type {
  AssistantAction,
  AssistantHealthcareOptionsItem,
  AssistantHealthcareItem,
} from '../../types';

interface HealthcareCardProps {
  item: AssistantHealthcareOptionsItem;
  actions: AssistantAction[];
  onAction: (action: AssistantAction) => void;
  disabledActionId?: string;
}

export function HealthcareCard({
  item,
  actions,
  onAction,
  disabledActionId,
}: HealthcareCardProps) {
  const selectionActions = actions.filter(
    (action) => action.kind === 'select_healthcare_slot'
  );

  return (
    <View style={styles.card}>
      <CardHeading
        icon={<Ionicons name="medkit" size={20} color={theme.colors.healthcare} />}
        iconBg={theme.colors.healthcareBg}
        label="Dịch vụ Y tế & Bác sĩ"
        badge="Chuyên khoa"
        title={item.title}
      />

      {item.options && item.options.length > 0 ? (
        <View style={styles.optionList}>
          {item.options.map((option, index) => {
            const action = selectionActions[index];
            return (
              <View key={`${String(option.doctor)}-${index}`} style={styles.optionRow}>
                <View style={styles.doctorAvatar}>
                  <Ionicons name="person" size={18} color={theme.colors.healthcare} />
                </View>
                
                <View style={styles.optionInfo}>
                  <Text style={styles.optionName}>
                    {text(option.doctor, 'Bác sĩ chuyên khoa')}
                  </Text>
                  
                  <View style={styles.deptRow}>
                    <Text style={styles.deptText}>
                      {text(option.department, 'Khoa Nội')}
                    </Text>
                  </View>

                  <View style={styles.timeRow}>
                    <Ionicons name="time-outline" size={13} color={theme.colors.muted} />
                    <Text style={styles.timeText}>
                      {dateText(option.start_time)}
                    </Text>
                  </View>
                  
                  {option.facility?.name && (
                    <Text style={styles.facilityText} numberOfLines={1}>
                      🏥 {option.facility.name}
                    </Text>
                  )}
                </View>

                {action && (
                  <ActionButton
                    label="Chọn lịch"
                    size="sm"
                    onPress={() => onAction(action)}
                    disabled={Boolean(disabledActionId)}
                    style={styles.selectBtn}
                  />
                )}
              </View>
            );
          })}
        </View>
      ) : item.departments && item.departments.length > 0 ? (
        <View style={styles.optionList}>
          {item.departments.slice(0, 6).map((department, index) => (
            <View key={`${String(department.name)}-${index}`} style={styles.optionRow}>
              <View style={styles.optionInfo}>
                <Text style={styles.optionName}>{text(department.name, 'Khoa khám')}</Text>
                <Text style={styles.deptText}>
                  {text(department.description, 'Hãy nhắn tên khoa để xem lịch trống.')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.note}>Mình đang cập nhật lịch khám phù hợp.</Text>
      )}

      {item.note && <Text style={styles.note}>{text(item.note)}</Text>}
    </View>
  );
}

export function HealthcareAppointmentCard({
  item,
}: {
  item: AssistantHealthcareItem;
}) {
  const appointment = item.appointment;
  const facility = item.facility ?? appointment?.facility;

  return (
    <View style={styles.card}>
      <CardHeading
        icon={<Ionicons name="checkmark-circle" size={20} color={theme.colors.healthcare} />}
        iconBg={theme.colors.healthcareBg}
        label="Phiếu hẹn khám bệnh"
        badge="Đã xác nhận"
        title={item.title}
      />
      <View style={styles.detailContainer}>
        <DetailRow
          label="Bác sĩ phụ trách"
          value={text(item.doctor ?? appointment?.doctor_name, 'Theo lựa chọn')}
        />
        <DetailRow
          label="Chuyên khoa"
          value={text(item.department ?? appointment?.department, 'Đang cập nhật')}
        />
        <DetailRow
          label="Thời gian khám"
          value={dateText(item.start_time ?? appointment?.start_time)}
        />
        <DetailRow
          label="Cơ sở phòng khám"
          value={text(facility?.name, 'X-One Healthcare Center')}
        />
        <DetailRow
          label="Địa chỉ"
          value={text(facility?.address, '12 Nguyễn Trãi, Thanh Xuân, Hà Nội')}
        />
        <DetailRow
          label="Phí khám chuyên khoa"
          value={formatMoney(item.price ?? appointment?.price ?? 500000, 'VND')}
        />
      </View>
      {item.note || item.payment_note ? (
        <Text style={styles.note}>{text(item.note ?? item.payment_note)}</Text>
      ) : null}
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
    borderLeftColor: theme.colors.healthcare,
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
  },
  doctorAvatar: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.healthcareBg,
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
    marginBottom: 2,
  },
  deptRow: {
    marginBottom: 3,
  },
  deptText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.healthcare,
    fontWeight: '700',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  timeText: {
    fontSize: 11,
    color: theme.colors.muted,
  },
  facilityText: {
    fontSize: 10,
    color: theme.colors.mutedLight,
    marginTop: 2,
  },
  selectBtn: {
    backgroundColor: theme.colors.healthcare,
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
