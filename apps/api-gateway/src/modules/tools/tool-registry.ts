import { BadGatewayException, Injectable } from '@nestjs/common';

export type ToolRisk = 'READ' | 'REVERSIBLE_WRITE' | 'FINANCIAL_OR_FINAL';
export type ToolDomain = 'food' | 'ride' | 'restaurant' | 'healthcare';
export type ConfirmationRequirement = 'none' | 'policy-dependent' | 'explicit_gateway_confirmation';
export type IdempotencyRequirement = 'none' | 'required';
export type ToolClassification = 'IMPLEMENTED_AGENT_TOOL' | 'IMPLEMENTED_GATEWAY_ACTION' | 'IMPLEMENTED_DOMAIN_API' | 'LEGACY_COMPAT' | 'DEPRECATED';

export type ToolProposal = {
  tool_name: string;
  /** Kept as a compatibility input only; registry metadata remains authoritative. */
  risk_level?: ToolRisk;
  arguments: Record<string, unknown>;
  workflow_id: string;
  version?: number;
};

export type ToolDefinition = {
  name: string;
  toolName: string;
  domain: ToolDomain;
  version: 2;
  risk: ToolRisk;
  riskLevel: ToolRisk;
  argumentSchema: string;
  resultSchema: string;
  idempotencyRequirement: IdempotencyRequirement;
  confirmationRequirement: ConfirmationRequirement;
  owner: string;
  classification: ToolClassification;
  aliases?: readonly string[];
};

export const TOOL_REGISTRY_COMPATIBILITY = {
  owner: 'gateway-tools',
  expiresOn: '2026-12-31',
  names: new Set([
    'food.menu.get',
    'food.menu_item.get',
    'food.address.list',
    'food.cart.get',
    'food.delivery.quote',
    'food.order.preview',
    'food.order.get',
    'food.order.track',
    'food.order.cancel.preview',
    'food.order.confirm',
    'food.order.cancel',
    'food.refund.execute',
    'healthcare.payment.acknowledge',
  ]),
} as const;

const definition = (
  value: Omit<ToolDefinition, 'toolName' | 'riskLevel' | 'classification'> & { classification?: ToolClassification },
): ToolDefinition => ({
  ...value,
  classification: value.classification ?? 'LEGACY_COMPAT',
  toolName: value.name,
  riskLevel: value.risk,
});

const definitions: readonly ToolDefinition[] = [
  definition({ name: 'food.search', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodSearchArguments', resultSchema: 'FoodSearchResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['search_food'] }),
  definition({ name: 'food.menu.get', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodMenuArguments', resultSchema: 'FoodMenuResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', aliases: ['view_menu'] }),
  definition({ name: 'food.menu_item.get', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodMenuItemArguments', resultSchema: 'FoodMenuItemResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', aliases: ['view_menu_item'] }),
  definition({ name: 'food.address.list', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodAddressListArguments', resultSchema: 'FoodAddressListResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', aliases: ['list_food_delivery_addresses'] }),
  definition({ name: 'food.cart.get', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodCartArguments', resultSchema: 'FoodCartResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', aliases: ['get_food_cart'] }),
  definition({ name: 'food.delivery.quote', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodDeliveryQuoteArguments', resultSchema: 'FoodDeliveryQuoteResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', aliases: ['quote_delivery'] }),
  definition({ name: 'food.order.preview', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodOrderPreviewArguments', resultSchema: 'FoodOrderPreviewResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', aliases: ['preview_order'] }),
  definition({ name: 'food.order.get', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodOrderArguments', resultSchema: 'FoodOrderResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', aliases: ['get_food_order'] }),
  definition({ name: 'food.order.track', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodOrderArguments', resultSchema: 'FoodTrackingResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', aliases: ['track_food_order'] }),
  definition({ name: 'food.order.cancel.preview', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodOrderArguments', resultSchema: 'FoodCancellationPreviewResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', aliases: ['preview_food_order_cancellation'] }),
  definition({ name: 'food.order.confirm', domain: 'food', version: 2, risk: 'FINANCIAL_OR_FINAL', argumentSchema: 'FoodOrderConfirmationArguments', resultSchema: 'FoodOrderResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'gateway/Core + food-service' }),
  definition({ name: 'food.order.cancel', domain: 'food', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'FoodOrderCancellationArguments', resultSchema: 'FoodOrderResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'gateway/Core + food-service' }),
  definition({ name: 'food.refund.execute', domain: 'food', version: 2, risk: 'FINANCIAL_OR_FINAL', argumentSchema: 'FoodRefundArguments', resultSchema: 'RefundResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'gateway/Core + food-service' }),
  definition({ name: 'ride.quote.create', domain: 'ride', version: 2, risk: 'READ', argumentSchema: 'RideQuoteArguments', resultSchema: 'RideQuoteResult', idempotencyRequirement: 'required', confirmationRequirement: 'none', owner: 'ride-service', classification: 'IMPLEMENTED_AGENT_TOOL' }),
  definition({ name: 'ride.quote.get', domain: 'ride', version: 2, risk: 'READ', argumentSchema: 'RideQuoteGetArguments', resultSchema: 'RideQuoteResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'ride-service', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),
  definition({ name: 'ride.booking.prepare', domain: 'ride', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'RideBookingPrepareArguments', resultSchema: 'RideBookingResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'ride-service + Gateway', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),
  definition({ name: 'ride.booking.get', domain: 'ride', version: 2, risk: 'READ', argumentSchema: 'RideBookingGetArguments', resultSchema: 'RideBookingResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'ride-service + Gateway', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),
  definition({ name: 'ride.booking.confirm', domain: 'ride', version: 2, risk: 'FINANCIAL_OR_FINAL', argumentSchema: 'RideBookingConfirmArguments', resultSchema: 'RideBookingResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'ride-service + Gateway', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),
  definition({ name: 'ride.booking.cancel.prepare', domain: 'ride', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'RideCancellationArguments', resultSchema: 'RideCancellationProposal', idempotencyRequirement: 'none', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'gateway/Core', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),
  definition({ name: 'ride.booking.cancel', domain: 'ride', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'RideCancellationArguments', resultSchema: 'RideBookingResult', idempotencyRequirement: 'required', confirmationRequirement: 'policy-dependent', owner: 'ride-service', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),
  definition({ name: 'restaurant.search', domain: 'restaurant', version: 2, risk: 'READ', argumentSchema: 'RestaurantSearchArguments', resultSchema: 'RestaurantSearchResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'restaurant-service', classification: 'IMPLEMENTED_AGENT_TOOL' }),
  definition({ name: 'restaurant.get', domain: 'restaurant', version: 2, risk: 'READ', argumentSchema: 'RestaurantGetArguments', resultSchema: 'RestaurantResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'restaurant-service', classification: 'IMPLEMENTED_AGENT_TOOL' }),
  definition({ name: 'restaurant.check_availability', domain: 'restaurant', version: 2, risk: 'READ', argumentSchema: 'RestaurantAvailabilityArguments', resultSchema: 'RestaurantAvailabilityResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'restaurant-service', classification: 'IMPLEMENTED_AGENT_TOOL' }),
  definition({ name: 'restaurant.create_hold', domain: 'restaurant', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'RestaurantHoldArguments', resultSchema: 'RestaurantHoldResult', idempotencyRequirement: 'required', confirmationRequirement: 'policy-dependent', owner: 'restaurant-service', classification: 'IMPLEMENTED_AGENT_TOOL' }),
  definition({ name: 'restaurant.create_reservation', domain: 'restaurant', version: 2, risk: 'FINANCIAL_OR_FINAL', argumentSchema: 'RestaurantReservationArguments', resultSchema: 'RestaurantReservationResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'restaurant-service + Gateway', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),
  definition({ name: 'restaurant.update_reservation', domain: 'restaurant', version: 2, risk: 'FINANCIAL_OR_FINAL', argumentSchema: 'RestaurantReservationUpdateArguments', resultSchema: 'RestaurantReservationResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'restaurant-service + Gateway', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),
  definition({ name: 'healthcare.list_departments', domain: 'healthcare', version: 2, risk: 'READ', argumentSchema: 'HealthcareDepartmentArguments', resultSchema: 'HealthcareDepartmentResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'healthcare-service', classification: 'IMPLEMENTED_AGENT_TOOL' }),
  definition({ name: 'healthcare.list_slots', domain: 'healthcare', version: 2, risk: 'READ', argumentSchema: 'HealthcareSlotArguments', resultSchema: 'HealthcareSlotResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'healthcare-service', classification: 'IMPLEMENTED_AGENT_TOOL' }),
  definition({ name: 'healthcare.hold_slot', domain: 'healthcare', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'HealthcareHoldArguments', resultSchema: 'HealthcareAppointmentResult', idempotencyRequirement: 'required', confirmationRequirement: 'policy-dependent', owner: 'healthcare-service', classification: 'IMPLEMENTED_AGENT_TOOL' }),
  definition({ name: 'healthcare.payment.acknowledge', domain: 'healthcare', version: 2, risk: 'FINANCIAL_OR_FINAL', argumentSchema: 'HealthcarePaymentArguments', resultSchema: 'HealthcarePaymentResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'gateway/Core + healthcare-service' }),
  definition({ name: 'healthcare.confirm_appointment', domain: 'healthcare', version: 2, risk: 'FINANCIAL_OR_FINAL', argumentSchema: 'HealthcareAppointmentArguments', resultSchema: 'HealthcareAppointmentResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'healthcare-service + Gateway', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),
  definition({ name: 'healthcare.cancel_appointment', domain: 'healthcare', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'HealthcareAppointmentArguments', resultSchema: 'HealthcareAppointmentResult', idempotencyRequirement: 'required', confirmationRequirement: 'policy-dependent', owner: 'healthcare-service', classification: 'IMPLEMENTED_AGENT_TOOL' }),

  // Canonical v2 names. Legacy names remain aliases or separate compatibility
  // entries while callers migrate; no alias creates a second authority.
  definition({ name: 'food.get_restaurant', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodRestaurantArguments', resultSchema: 'FoodRestaurantResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', classification: 'IMPLEMENTED_DOMAIN_API', aliases: ['get_food_restaurant'] }),
  definition({ name: 'food.list_menu', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodMenuArguments', resultSchema: 'FoodMenuResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['view_menu'] }),
  definition({ name: 'food.get_menu_item', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodMenuItemArguments', resultSchema: 'FoodMenuItemResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['view_menu_item'] }),
  definition({ name: 'food.create_cart', domain: 'food', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'FoodCartCreateArguments', resultSchema: 'FoodCartResult', idempotencyRequirement: 'required', confirmationRequirement: 'policy-dependent', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['create_cart'] }),
  definition({ name: 'food.add_cart_item', domain: 'food', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'FoodCartItemArguments', resultSchema: 'FoodCartResult', idempotencyRequirement: 'required', confirmationRequirement: 'policy-dependent', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['add_to_cart'] }),
  definition({ name: 'food.update_cart_item', domain: 'food', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'FoodCartItemUpdateArguments', resultSchema: 'FoodCartResult', idempotencyRequirement: 'required', confirmationRequirement: 'policy-dependent', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['update_food_cart_item'] }),
  definition({ name: 'food.remove_cart_item', domain: 'food', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'FoodCartItemRemoveArguments', resultSchema: 'FoodCartResult', idempotencyRequirement: 'required', confirmationRequirement: 'policy-dependent', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['remove_food_cart_item'] }),
  definition({ name: 'food.quote_delivery', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodDeliveryQuoteArguments', resultSchema: 'FoodDeliveryQuoteResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['quote_delivery'] }),
  definition({ name: 'food.apply_voucher', domain: 'food', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'FoodVoucherArguments', resultSchema: 'FoodCartResult', idempotencyRequirement: 'required', confirmationRequirement: 'policy-dependent', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['apply_voucher'] }),
  definition({ name: 'food.remove_voucher', domain: 'food', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'FoodCartArguments', resultSchema: 'FoodCartResult', idempotencyRequirement: 'required', confirmationRequirement: 'policy-dependent', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['remove_food_voucher'] }),
  definition({ name: 'food.preview_order', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodOrderPreviewArguments', resultSchema: 'FoodOrderPreviewResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['preview_order'] }),
  definition({ name: 'food.prepare_order', domain: 'food', version: 2, risk: 'FINANCIAL_OR_FINAL', argumentSchema: 'FoodOrderPreviewArguments', resultSchema: 'ConfirmationForm', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'gateway/Core + food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['prepare_food_order_confirmation'] }),
  definition({ name: 'food.get_order', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodOrderArguments', resultSchema: 'FoodOrderResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', classification: 'IMPLEMENTED_DOMAIN_API', aliases: ['get_food_order'] }),
  definition({ name: 'food.list_orders', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodOrderListArguments', resultSchema: 'FoodOrderListResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', classification: 'IMPLEMENTED_DOMAIN_API' }),
  definition({ name: 'food.track_order', domain: 'food', version: 2, risk: 'READ', argumentSchema: 'FoodOrderArguments', resultSchema: 'FoodTrackingResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['track_food_order'] }),
  definition({ name: 'food.prepare_cancel_order', domain: 'food', version: 2, risk: 'FINANCIAL_OR_FINAL', argumentSchema: 'FoodOrderArguments', resultSchema: 'ConfirmationForm', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'gateway/Core + food-service', classification: 'IMPLEMENTED_AGENT_TOOL', aliases: ['prepare_food_order_cancellation_confirmation'] }),
  definition({ name: 'food.cancel_order', domain: 'food', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'FoodOrderCancellationArguments', resultSchema: 'FoodOrderResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'gateway/Core + food-service', classification: 'IMPLEMENTED_GATEWAY_ACTION', aliases: ['execute_food_order_cancellation'] }),

  definition({ name: 'ride.booking.status.get', domain: 'ride', version: 2, risk: 'READ', argumentSchema: 'RideBookingGetArguments', resultSchema: 'RideBookingResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'ride-service + Gateway', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),
  definition({ name: 'ride.booking.list', domain: 'ride', version: 2, risk: 'READ', argumentSchema: 'RideBookingListArguments', resultSchema: 'RideBookingListResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'ride-service + Gateway', classification: 'IMPLEMENTED_DOMAIN_API' }),
  definition({ name: 'ride.tracking.get', domain: 'ride', version: 2, risk: 'READ', argumentSchema: 'RideTrackingArguments', resultSchema: 'RideTrackingResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'ride-service + Gateway', classification: 'IMPLEMENTED_GATEWAY_ACTION' }),

  definition({ name: 'restaurant.get_reservation', domain: 'restaurant', version: 2, risk: 'READ', argumentSchema: 'RestaurantReservationGetArguments', resultSchema: 'RestaurantReservationResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'restaurant-service', classification: 'IMPLEMENTED_DOMAIN_API', aliases: ['get_reservation'] }),
  definition({ name: 'restaurant.list_reservations', domain: 'restaurant', version: 2, risk: 'READ', argumentSchema: 'RestaurantReservationListArguments', resultSchema: 'RestaurantReservationListResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'restaurant-service', classification: 'IMPLEMENTED_DOMAIN_API', aliases: ['list_reservations'] }),
  definition({ name: 'restaurant.cancel_reservation', domain: 'restaurant', version: 2, risk: 'REVERSIBLE_WRITE', argumentSchema: 'RestaurantReservationCancelArguments', resultSchema: 'RestaurantReservationResult', idempotencyRequirement: 'required', confirmationRequirement: 'explicit_gateway_confirmation', owner: 'restaurant-service + Gateway', classification: 'IMPLEMENTED_GATEWAY_ACTION', aliases: ['cancel_reservation'] }),

  definition({ name: 'healthcare.search_facilities', domain: 'healthcare', version: 2, risk: 'READ', argumentSchema: 'HealthcareFacilitySearchArguments', resultSchema: 'HealthcareFacilityListResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'healthcare-service', classification: 'IMPLEMENTED_DOMAIN_API' }),
  definition({ name: 'healthcare.get_facility', domain: 'healthcare', version: 2, risk: 'READ', argumentSchema: 'HealthcareFacilityGetArguments', resultSchema: 'HealthcareFacilityResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'healthcare-service', classification: 'IMPLEMENTED_DOMAIN_API' }),
  definition({ name: 'healthcare.list_doctors', domain: 'healthcare', version: 2, risk: 'READ', argumentSchema: 'HealthcareDoctorArguments', resultSchema: 'HealthcareDoctorListResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'healthcare-service', classification: 'IMPLEMENTED_DOMAIN_API' }),
  definition({ name: 'healthcare.get_appointment', domain: 'healthcare', version: 2, risk: 'READ', argumentSchema: 'HealthcareAppointmentArguments', resultSchema: 'HealthcareAppointmentResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'healthcare-service', classification: 'IMPLEMENTED_DOMAIN_API' }),
  definition({ name: 'healthcare.list_appointments', domain: 'healthcare', version: 2, risk: 'READ', argumentSchema: 'HealthcareAppointmentListArguments', resultSchema: 'HealthcareAppointmentListResult', idempotencyRequirement: 'none', confirmationRequirement: 'none', owner: 'healthcare-service', classification: 'IMPLEMENTED_DOMAIN_API' }),
];

const argumentKeys: Record<string, readonly string[]> = {
  'food.search': ['keyword', 'district', 'category', 'max_price', 'latitude', 'longitude'],
  'food.menu.get': ['restaurant_id'],
  'food.menu_item.get': ['menu_item_id'],
  'food.address.list': ['label'],
  'food.cart.get': ['cart_id'],
  'food.delivery.quote': ['restaurant_id', 'address_id'],
  'food.order.preview': ['cart_id', 'address_id'],
  'food.order.get': ['order_id'],
  'food.order.track': ['order_id'],
  'food.order.cancel.preview': ['order_id'],
  'food.order.confirm': ['cart_id', 'address_id', 'confirmation_id'],
  'food.order.cancel': ['order_id', 'confirmation_id'],
  'food.refund.execute': ['payment_id', 'confirmation_id'],
  'ride.quote.create': ['pickup_address', 'dropoff_address', 'vehicle_type', 'passenger_count', 'promo_code', 'pickup_latitude', 'pickup_longitude', 'dropoff_latitude', 'dropoff_longitude', 'stopovers'],
  'ride.quote.get': ['quote_id'],
  'ride.booking.prepare': ['quote_id'],
  'ride.booking.get': ['booking_id'],
  'ride.booking.confirm': ['booking_id', 'confirmation_id'],
  'ride.booking.cancel.prepare': ['booking_id'],
  'ride.booking.cancel': ['booking_id', 'confirmation_id'],
  'restaurant.search': ['location', 'cuisine_type', 'budget_range', 'limit', 'offset'],
  'restaurant.get': ['restaurant_id'],
  'restaurant.check_availability': ['restaurant_id', 'start_at', 'party_size', 'duration_minutes', 'seating_type'],
  'restaurant.create_hold': ['restaurant_id', 'start_at', 'party_size', 'duration_minutes', 'seating_type'],
  'restaurant.create_reservation': ['restaurant_id', 'party_size', 'start_at', 'duration_minutes', 'special_requests', 'hold_id'],
  'restaurant.update_reservation': ['reservation_id', 'party_size', 'start_at', 'special_requests'],
  'healthcare.list_departments': ['facility_id', 'keyword'],
  'healthcare.list_slots': ['department', 'facility_id', 'date', 'start_at'],
  'healthcare.hold_slot': ['slot_id', 'symptoms'],
  'healthcare.confirm_appointment': ['appointment_id', 'confirmation_id'],
  'healthcare.payment.acknowledge': ['appointment_id'],
  'healthcare.cancel_appointment': ['appointment_id'],
  'food.get_restaurant': ['restaurant_id'],
  'food.list_menu': ['restaurant_id'],
  'food.get_menu_item': ['menu_item_id'],
  'food.create_cart': ['restaurant_id'],
  'food.add_cart_item': ['cart_id', 'menu_item_id', 'quantity', 'selected_options'],
  'food.update_cart_item': ['cart_id', 'cart_item_id', 'quantity'],
  'food.remove_cart_item': ['cart_id', 'cart_item_id'],
  'food.quote_delivery': ['restaurant_id', 'address_id'],
  'food.apply_voucher': ['cart_id', 'code'],
  'food.remove_voucher': ['cart_id'],
  'food.preview_order': ['cart_id', 'address_id'],
  'food.prepare_order': ['cart_id', 'address_id'],
  'food.get_order': ['order_id'],
  'food.list_orders': ['status', 'page', 'page_size'],
  'food.track_order': ['order_id'],
  'food.prepare_cancel_order': ['order_id'],
  'food.cancel_order': ['order_id', 'confirmation_id'],
  'ride.booking.status.get': ['booking_id'],
  'ride.booking.list': ['status', 'page', 'page_size'],
  'ride.tracking.get': ['booking_id'],
  'restaurant.get_reservation': ['reservation_id'],
  'restaurant.list_reservations': ['status', 'from', 'to', 'page', 'page_size'],
  'restaurant.cancel_reservation': ['reservation_id', 'confirmation_id'],
  'healthcare.search_facilities': ['keyword', 'location', 'limit'],
  'healthcare.get_facility': ['facility_id'],
  'healthcare.list_doctors': ['department', 'facility_id', 'date', 'limit'],
  'healthcare.get_appointment': ['appointment_id'],
  'healthcare.list_appointments': ['status', 'from', 'to', 'page', 'page_size'],
};

const authorityKeys = new Set(['id', 'resource_id', 'patient_id', 'price', 'amount', 'currency', 'status', 'available', 'provider_reference', 'success', 'quote_version', 'resource_version', 'confirmation_satisfied']);

const requiredArguments: Record<string, readonly string[]> = {
  'ride.quote.create': ['pickup_address', 'dropoff_address', 'vehicle_type'],
  'ride.quote.get': ['quote_id'],
  'ride.booking.prepare': ['quote_id'],
  'ride.booking.get': ['booking_id'],
  'ride.booking.confirm': ['booking_id'],
  'ride.booking.cancel.prepare': ['booking_id'],
  'ride.booking.cancel': ['booking_id'],
  'restaurant.get': ['restaurant_id'],
  'restaurant.check_availability': ['restaurant_id', 'start_at', 'party_size'],
  'restaurant.create_hold': ['restaurant_id', 'start_at', 'party_size'],
  'restaurant.create_reservation': ['hold_id'],
  'restaurant.update_reservation': ['reservation_id'],
  'healthcare.list_slots': ['department'],
  'healthcare.hold_slot': ['slot_id'],
  'healthcare.confirm_appointment': ['appointment_id'],
  'healthcare.payment.acknowledge': ['appointment_id'],
  'healthcare.cancel_appointment': ['appointment_id'],
  'food.get_restaurant': ['restaurant_id'],
  'food.list_menu': ['restaurant_id'],
  'food.get_menu_item': ['menu_item_id'],
  'food.create_cart': ['restaurant_id'],
  'food.add_cart_item': ['cart_id', 'menu_item_id'],
  'food.update_cart_item': ['cart_id', 'cart_item_id', 'quantity'],
  'food.remove_cart_item': ['cart_id', 'cart_item_id'],
  'food.quote_delivery': ['restaurant_id', 'address_id'],
  'food.apply_voucher': ['cart_id', 'code'],
  'food.remove_voucher': ['cart_id'],
  'food.preview_order': ['cart_id', 'address_id'],
  'food.prepare_order': ['cart_id', 'address_id'],
  'food.get_order': ['order_id'],
  'food.track_order': ['order_id'],
  'food.prepare_cancel_order': ['order_id'],
  'food.cancel_order': ['order_id'],
  'ride.booking.status.get': ['booking_id'],
  'ride.tracking.get': ['booking_id'],
  'restaurant.get_reservation': ['reservation_id'],
  'restaurant.cancel_reservation': ['reservation_id'],
  'healthcare.get_facility': ['facility_id'],
  'healthcare.list_doctors': ['department'],
  'healthcare.get_appointment': ['appointment_id'],
};

@Injectable()
export class ToolRegistry {
  list(): readonly ToolDefinition[] { return definitions; }

  require(proposal: ToolProposal): ToolDefinition {
    const registered = definitions.find((candidate) => candidate.name === proposal.tool_name || candidate.aliases?.includes(proposal.tool_name));
    if (!registered || proposal.version !== undefined && proposal.version !== registered.version || !isNonEmptyString(proposal.workflow_id, 128) || !isRecord(proposal.arguments)) throw new BadGatewayException({ code: 'TOOL_PROPOSAL_INVALID', detail: 'Agent proposed an unsupported tool.', retryable: false });
    if (proposal.risk_level !== undefined && proposal.risk_level !== registered.risk) throw new BadGatewayException({ code: 'TOOL_RISK_MISMATCH', detail: 'Tool risk is owned by the registry.', retryable: false });
    validateArguments(registered, proposal.arguments);
    return registered;
  }
}

function validateArguments(definition_: ToolDefinition, args: Record<string, unknown>): void {
  const allowed = argumentKeys[definition_.name] ?? [];
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key) || authorityKeys.has(key)) throw new BadGatewayException({ code: 'TOOL_ARGUMENTS_INVALID', detail: 'Agent tool arguments contain an unsupported or authoritative field.', retryable: false });
  }
  const required = requiredArguments[definition_.name] ?? [];
  for (const key of required) {
    const value = args[key];
    const validNumber = ['party_size', 'slot_id', 'patient_id', 'appointment_id', 'quantity', 'page', 'page_size', 'limit'].includes(key) && Number.isInteger(value) && Number(value) > 0;
    if (!validNumber && !isNonEmptyString(value, 300)) throw new BadGatewayException({ code: 'TOOL_ARGUMENTS_INVALID', detail: 'Agent tool arguments are incomplete.', retryable: false });
  }
  if (definition_.name === 'ride.quote.create' && !['BIKE', 'CAR_4', 'CAR_7'].includes(String(args.vehicle_type))) throw new BadGatewayException({ code: 'TOOL_ARGUMENTS_INVALID', detail: 'Agent tool arguments are invalid.', retryable: false });
  if (definition_.name === 'ride.quote.create' && args.passenger_count !== undefined && (!Number.isInteger(args.passenger_count) || Number(args.passenger_count) < 1 || Number(args.passenger_count) > 20)) throw new BadGatewayException({ code: 'TOOL_ARGUMENTS_INVALID', detail: 'Agent tool arguments are invalid.', retryable: false });
  if (definition_.name === 'ride.quote.create' && args.stopovers !== undefined && (!Array.isArray(args.stopovers) || args.stopovers.length > 2 || args.stopovers.some((stopover) => !isRecord(stopover) || !isNonEmptyString(stopover.address, 300) || !isCoordinate(stopover.latitude, -90, 90) || !isCoordinate(stopover.longitude, -180, 180)))) throw new BadGatewayException({ code: 'TOOL_ARGUMENTS_INVALID', detail: 'Agent tool arguments are invalid.', retryable: false });
  if (definition_.idempotencyRequirement === 'required' && definition_.risk !== 'READ' && args.idempotency_key !== undefined) throw new BadGatewayException({ code: 'TOOL_ARGUMENTS_INVALID', detail: 'Idempotency is supplied by the request boundary.', retryable: false });
}

function isNonEmptyString(value: unknown, maximumLength: number): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function isCoordinate(value: unknown, minimum: number, maximum: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum; }
