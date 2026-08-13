export interface AuthUser {
  sub: string;
  email: string;
  role: string;
}

export type AssistantActionKind =
  | "select_restaurant"
  | "restaurant_confirm"
  | "ride_service"
  | "ride_payment"
  | "select_healthcare_slot"
  | "healthcare_payment"
  | "healthcare_confirm"
  | "food_confirm";

type AssistantActionOf<K extends AssistantActionKind> = {
  id: string;
  kind: K;
  label: string;
};

export type AssistantAction =
  | AssistantActionOf<"select_restaurant">
  | AssistantActionOf<"restaurant_confirm">
  | AssistantActionOf<"ride_service">
  | AssistantActionOf<"ride_payment">
  | AssistantActionOf<"select_healthcare_slot">
  | AssistantActionOf<"healthcare_payment">
  | AssistantActionOf<"healthcare_confirm">
  | AssistantActionOf<"food_confirm">;

export interface AssistantOption {
  name?: string;
  title?: string;
  location?: string;
  cuisine?: string;
  restaurant?: string;
  description?: string;
  doctor?: string;
  department?: string;
  start_time?: string;
  price?: number;
  rating?: number;
}

export interface AssistantRestaurant {
  name: string;
  location?: string;
}

export interface AssistantFacility {
  name?: string;
  address?: string;
}

export interface AssistantAppointment {
  appointment_id?: number;
  doctor_name?: string;
  department?: string;
  start_time?: string;
  price?: number;
  status?: string;
  facility?: AssistantFacility;
}

export interface AssistantPreview {
  subtotal?: number;
  discount?: number;
  cart_version?: number;
  quote_version?: string;
  total?: { amount?: number; currency?: string };
  delivery?: { eta_minutes?: number; fee?: { amount?: number; currency?: string } };
}

interface AssistantItemBase<K extends string> {
  kind: K;
  title: string;
  note?: string;
  question?: string;
}

export interface AssistantRestaurantOptionsItem extends AssistantItemBase<"restaurant_options" | "restaurant_unavailable"> {
  options?: AssistantOption[];
  restaurant?: AssistantRestaurant;
}

export interface AssistantRestaurantConfirmationItem extends AssistantItemBase<"restaurant_confirmation" | "reservation"> {
  restaurant?: AssistantRestaurant;
  reservation_code?: string;
  party_size?: number;
  start_at?: string;
  status?: string;
  expires_at?: string;
}

export interface AssistantRideItem extends AssistantItemBase<"ride_quote" | "ride_booking"> {
  pickup?: string;
  dropoff?: string;
  vehicle?: string;
  amount?: number;
  currency?: string;
  duration_minutes?: number;
  expires_at?: string;
  driver?: string;
  appointment_start_time?: string;
  recommended_departure?: string;
  departure_buffer_minutes?: number;
  scheduled_pickup?: boolean;
  schedule_note?: string;
}

export interface AssistantRideTimingConflictItem extends AssistantItemBase<"ride_timing_conflict"> {
  appointment_start_time?: string;
  recommended_departure?: string;
}

export interface AssistantHealthcareOptionsItem extends AssistantItemBase<"healthcare_options" | "healthcare_no_availability"> {
  options?: AssistantOption[];
  departments?: AssistantOption[];
}

export interface AssistantHealthcareItem extends AssistantItemBase<"appointment" | "healthcare_confirmation" | "appointment_confirmed"> {
  driver?: string;
  doctor?: string;
  department?: string;
  start_time?: string;
  price?: number;
  payment_note?: string;
  appointment_id?: number;
  facility?: AssistantFacility;
  appointment?: AssistantAppointment;
}

export interface AssistantFoodOrder {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  subtotal?: number;
  discount?: number;
  restaurant?: string | AssistantRestaurant;
}

export interface AssistantPayment {
  status?: string;
  amount?: number;
  currency?: string;
}

export interface AssistantFoodItem extends AssistantItemBase<"food_options" | "food_confirmation" | "food_order" | "food_empty"> {
  options?: AssistantOption[];
  order?: AssistantFoodOrder;
  payment?: AssistantPayment;
  preview?: AssistantPreview;
}

export interface AssistantProgressItem extends AssistantItemBase<"progress" | "clarification"> {}

export type KnownAssistantItem =
  | AssistantRestaurantOptionsItem
  | AssistantRestaurantConfirmationItem
  | AssistantRideItem
  | AssistantRideTimingConflictItem
  | AssistantHealthcareOptionsItem
  | AssistantHealthcareItem
  | AssistantFoodItem
  | AssistantProgressItem;

export type UnknownAssistantItem = {
  kind: string;
  title: string;
  note?: string;
  question?: string;
};

export type AssistantItem = KnownAssistantItem | UnknownAssistantItem;

export type KnownAssistantItemKind = KnownAssistantItem["kind"];

export function isKnownAssistantItem(item: AssistantItem): item is KnownAssistantItem {
  return [
    "restaurant_options", "restaurant_unavailable", "restaurant_confirmation", "reservation",
    "ride_quote", "ride_booking", "ride_timing_conflict", "healthcare_options",
    "healthcare_no_availability", "appointment", "healthcare_confirmation", "appointment_confirmed",
    "food_options", "food_confirmation", "food_order", "food_empty", "progress", "clarification",
  ].includes(item.kind as KnownAssistantItemKind);
}

export interface AssistantResponse {
  conversation_id: string;
  message: string;
  items: AssistantItem[];
  actions: AssistantAction[];
  completed: AssistantItem[];
  workflow_status: "IN_PROGRESS" | "COMPLETED" | "PARTIAL_SUCCESS" | "FAILED";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  response?: AssistantResponse;
  requestStatus?: "sending" | "sent" | "error";
  retryText?: string;
  retryAction?: AssistantAction;
}

export interface SessionActivity {
  id: string;
  title: string;
  reference: string;
  status: string;
  detail: string;
  timestamp: string;
}
