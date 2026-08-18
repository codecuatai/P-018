import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RestaurantCard, RestaurantConfirmationCard } from './cards/RestaurantCard';
import { RideCard, RideTimingConflictCard } from './cards/RideCard';
import { HealthcareCard, HealthcareAppointmentCard } from './cards/HealthcareCard';
import { FoodCard } from './cards/FoodCard';
import { SimpleCard, FallbackCard } from './cards/SimpleCard';
import { ActionButton } from './ui/ActionButton';
import { theme } from '../theme';
import {
  isKnownAssistantItem,
  type AssistantAction,
  type AssistantItem,
  type AssistantResponse,
} from '../types';

interface AssistantCardsProps {
  response: AssistantResponse;
  onAction: (action: AssistantAction) => void;
  disabledActionId?: string;
}

export function WorkflowCards({
  response,
  onAction,
  disabledActionId,
}: AssistantCardsProps) {
  const secondaryActions = response.actions.filter(
    (action) =>
      action.kind !== 'select_restaurant' &&
      action.kind !== 'select_healthcare_slot'
  );

  return (
    <View style={styles.container}>
      {response.workflow_status !== 'IN_PROGRESS' && (
        <WorkflowStatus status={response.workflow_status} />
      )}

      {response.items.map((item, index) => (
        <CardDispatcher
          key={`${item.kind}-${index}`}
          item={item}
          actions={response.actions}
          onAction={onAction}
          disabledActionId={disabledActionId}
        />
      ))}

      {secondaryActions.length > 0 && (
        <View style={styles.actionList}>
          {secondaryActions.map((action) => (
            <ActionButton
              key={action.id}
              label={action.label}
              variant="glow"
              icon={<Ionicons name="shield-checkmark" size={17} color="#FFFFFF" />}
              onPress={() => onAction(action)}
              disabled={Boolean(disabledActionId)}
              style={styles.actionButton}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function WorkflowStatus({ status }: { status: AssistantResponse['workflow_status'] }) {
  const labels = {
    COMPLETED: 'Tất cả yêu cầu đã hoàn tất thành công',
    PARTIAL_SUCCESS: 'Một phần yêu cầu đã hoàn tất; cần xác nhận thêm',
    FAILED: 'Yêu cầu hiện tại chưa thể hoàn tất',
  } as const;

  if (status === 'IN_PROGRESS') return null;

  const getStatusColor = () => {
    switch (status) {
      case 'COMPLETED':
        return {
          bg: theme.colors.successBg,
          border: theme.colors.successBorder,
          text: theme.colors.success,
          icon: 'checkmark-circle' as const,
        };
      case 'PARTIAL_SUCCESS':
        return {
          bg: theme.colors.warningBg,
          border: theme.colors.warningBorder,
          text: theme.colors.warning,
          icon: 'alert-circle' as const,
        };
      case 'FAILED':
        return {
          bg: theme.colors.dangerBg,
          border: theme.colors.dangerBorder,
          text: theme.colors.danger,
          icon: 'close-circle' as const,
        };
    }
  };

  const config = getStatusColor();

  return (
    <View
      style={[
        styles.statusBadge,
        { backgroundColor: config.bg, borderColor: config.border },
      ]}
    >
      <Ionicons name={config.icon} size={18} color={config.text} />
      <Text style={[styles.statusText, { color: config.text }]}>
        {labels[status]}
      </Text>
    </View>
  );
}

function CardDispatcher({
  item,
  actions,
  onAction,
  disabledActionId,
}: {
  item: AssistantItem;
  actions: AssistantAction[];
  onAction: (action: AssistantAction) => void;
  disabledActionId?: string;
}) {
  if (!isKnownAssistantItem(item)) {
    return <FallbackCard item={item} />;
  }

  switch (item.kind) {
    case 'restaurant_options':
    case 'restaurant_unavailable':
      return (
        <RestaurantCard
          item={item}
          actions={actions}
          onAction={onAction}
          disabledActionId={disabledActionId}
        />
      );
    case 'restaurant_confirmation':
    case 'reservation':
      return <RestaurantConfirmationCard item={item} />;
    case 'ride_quote':
    case 'ride_booking':
      return <RideCard item={item} />;
    case 'ride_timing_conflict':
      return <RideTimingConflictCard item={item} />;
    case 'healthcare_options':
    case 'healthcare_no_availability':
      return (
        <HealthcareCard
          item={item}
          actions={actions}
          onAction={onAction}
          disabledActionId={disabledActionId}
        />
      );
    case 'appointment':
    case 'healthcare_confirmation':
    case 'appointment_confirmed':
      return <HealthcareAppointmentCard item={item} />;
    case 'food_options':
    case 'food_confirmation':
    case 'food_order':
    case 'food_empty':
      return <FoodCard item={item} />;
    case 'progress':
    case 'clarification':
      return <SimpleCard item={item} />;
    default:
      return <FallbackCard item={item} />;
  }
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: 8,
  },
  statusText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
    flex: 1,
  },
  actionList: {
    gap: 8,
    marginTop: 6,
  },
  actionButton: {
    width: '100%',
  },
});
