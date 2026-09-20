export type UserRole = "admin" | "manager" | "provider" | "user" | "customer";

export interface AuthUser {
  id?: string;
  sub: string;
  email: string;
  role: UserRole | string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  language?: string;
  timezone?: string;
  onboarding_completed_at?: string;
  status?: string;
  session_id?: string;
  authentication_kind?: "real" | "demo";
  provider_type?: string;
  tenant_id?: string;
}


export interface SavedAddress {
  id: string;
  label: string;
  address_text: string;
  city?: string;
  district?: string;
  ward?: string;
  latitude?: number;
  longitude?: number;
  provider?: string;
  source: 'manual' | 'geocoded' | 'imported';
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeviceCurrentLocation {
  latitude: number;
  longitude: number;
  address_text?: string;
  accuracy_meters?: number;
  captured_at: string;
  source: "device";
}

export interface HealthcarePatient {
  id: number;
  name: string;
  phone: string;
  relationship: "self" | "child" | "parent" | "dependent";
  is_default: boolean;
}

export interface GeocodeCandidate {
  address_text: string;
  latitude: number | null;
  longitude: number | null;
  confidence: number;
}

export interface GeocodeResult {
  provider: string;
  status: "RESOLVED" | "NEEDS_CONFIRMATION";
  query: string;
  candidates: GeocodeCandidate[];
  retryable?: boolean;
}

export interface RouteResult {
  provider: string;
  status: "RESOLVED" | "ESTIMATED";
  distance_km: number;
  duration_minutes: number;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  route_distance_meters?: number;
  route_duration_seconds?: number;
  route_polyline?: string | null;
  route_geometry?: Array<{ latitude: number; longitude: number }> | null;
  route_snapshot_hash?: string;
  retryable?: boolean;
}

export type ServiceKey = "food" | "ride" | "restaurant" | "healthcare";

export interface ServiceCatalogItem {
  key: ServiceKey;
  label: string;
  description: string;
  accent: ServiceKey;
}

export interface RideTracking {
  booking_id: string;
  status: "AWAITING_CONFIRMATION" | "SEARCHING_DRIVER" | "DRIVER_ASSIGNED" | "DRIVER_TO_PICKUP" | "DRIVER_ARRIVED" | "IN_PROGRESS" | "ARRIVED_DESTINATION" | "COMPLETED" | "NO_DRIVER" | "FAILED" | "PAYMENT_FAILED" | "CANCELLED" | string;
  progress: number;
  eta_seconds: number;
  driver?: Record<string, unknown> | null;
  driver_location?: { latitude: number; longitude: number } | null;
  current_location?: { latitude: number; longitude: number } | null;
  route?: {
    provider?: string;
    distance_meters?: number | null;
    duration_seconds?: number | null;
    polyline?: string | null;
    geometry?: Array<{ latitude: number; longitude: number }> | null;
    origin?: { latitude: number; longitude: number } | null;
    destination?: { latitude: number; longitude: number } | null;
    [key: string]: unknown;
  };
  driver_route?: {
    provider?: string;
    distance_meters?: number;
    duration_seconds?: number;
    geometry?: Array<{ latitude: number; longitude: number }>;
    origin?: { latitude: number; longitude: number };
    destination?: { latitude: number; longitude: number };
  } | null;
  route_provider?: string;
  route_snapshot_hash?: string | null;
  updated_at?: string;
}

export interface RideStopover {
  address: string;
  latitude: number;
  longitude: number;
}

export interface RideQuote {
  id: string;
  status: "QUOTE_CREATED" | "AWAITING_CONFIRMATION" | "CONSUMED" | "EXPIRED" | string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
  distance_km: number;
  duration_minutes: number;
  amount: number;
  currency: string;
  tariff_version: string;
  quote_version: string;
  expires_at: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  dropoff_latitude?: number | null;
  dropoff_longitude?: number | null;
  route_provider?: string;
  route_distance_meters?: number | null;
  route_duration_seconds?: number | null;
  route_polyline?: string | null;
  route_geometry?: Array<{ latitude: number; longitude: number }> | null;
  route_snapshot_hash?: string | null;
  stopovers?: RideStopover[];
}

export interface FoodTracking {
  order_id: string;
  status: string;
  driver?: Record<string, unknown> | null;
  eta_minutes?: number | null;
  restaurant?: Record<string, unknown> | null;
  address?: Record<string, unknown> | null;
  pickup_stops?: Array<Record<string, unknown>>;
  delivery_route?: {
    provider?: string;
    distance_meters?: number;
    duration_seconds?: number;
    geometry?: Array<{ latitude: number; longitude: number }>;
    origin?: { latitude: number; longitude: number };
    destination?: { latitude: number; longitude: number };
  } | null;
  courier_location?: { latitude: number; longitude: number } | null;
  timeline?: Array<Record<string, unknown>>;
}

export interface ServiceCatalogEntry {
  id: "food" | "ride" | "restaurant" | "healthcare";
  label: string;
  description: string;
  status: "AVAILABLE" | "DEGRADED";
  browse_mode: "results" | "quote" | "departments";
  capabilities: string[];
  items: Record<string, unknown>[];
  source: string;
}

export interface ServiceCatalog {
  items: ServiceCatalogEntry[];
  checked_at: string;
}

export type HistoryType = 'food_order' | 'ride_booking' | 'restaurant_reservation' | 'healthcare_appointment';

export interface HistoryItem {
  id: string;
  type: HistoryType;
  title: string;
  status: string;
  detail: string;
  timestamp: string;
  source: HistoryType;
  resource: Record<string, unknown>;
}

export interface HistoryFilters {
  service?: HistoryType;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

export interface HistoryResult {
  items: HistoryItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  partial: boolean;
  unavailable: string[];
}

export interface ActiveHistoryResult {
  items: HistoryItem[];
  partial?: boolean;
  unavailable?: string[];
}

export type ProductOpsDomain = "food" | "ride" | "restaurant" | "healthcare";
export type FavoriteDomain = "food" | "restaurant" | "healthcare";
export type FeedbackResourceType = "food_order" | "ride_booking" | "restaurant_reservation" | "healthcare_appointment";

export interface NotificationItem {
  id: string;
  actor_id: string;
  event_key: string;
  type: string;
  title: string;
  body: string;
  resource_type?: string;
  resource_id?: string;
  status: "UNREAD" | "READ";
  created_at: string;
  read_at?: string;
}

export interface FavoriteItem {
  id: string;
  actor_id: string;
  domain: FavoriteDomain;
  resource_id: string;
  created_at: string;
}

export interface FeedbackItem {
  id: string;
  actor_id: string;
  domain: ProductOpsDomain;
  resource_type: FeedbackResourceType;
  resource_id: string;
  rating: number;
  comment?: string;
  created_at: string;
  updated_at: string;
}

export type SupportTicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type SupportPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface AdminUserRecord {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole | string;
  status: string;
  onboarding_completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminDomainStatus {
  domain: ProductOpsDomain;
  status: "healthy" | "degraded";
  data?: Record<string, unknown>;
  error?: string;
}

export interface AdminHealthCheck {
  service: string;
  status: "healthy" | "degraded" | "unavailable";
  latency_ms: number;
  checked_at: string;
  detail?: Record<string, unknown>;
  error?: string;
}

export interface AdminApiKeyRecord {
  id: string;
  provider: "gemini" | "trello" | "geoapify" | "google_maps" | "other";
  label: string;
  last4: string;
  status: "active" | "disabled" | "expired";
  expires_at?: string;
  updated_at: string;
  updated_by: string;
  created_at: string;
}

export interface AdminLogEntry {
  id: string;
  action: string;
  actor_id?: string;
  resource_id?: string;
  correlation_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminTokenUsageReport {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_estimated_cost_usd: number;
  by_feature: Record<string, { prompt: number; completion: number; total: number; cost: number }>;
  by_model: Record<string, { prompt: number; completion: number; total: number; cost: number }>;
  daily_trends: Array<{
    date: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
  }>;
  top_consumers: Array<{
    actor_id: string;
    total_tokens: number;
    estimated_cost_usd: number;
  }>;
}

export interface AdminUserServiceSummary {
  user_id: string;
  ride_count: number;
  food_count: number;
  restaurant_count: number;
  healthcare_count: number;
  feedback_count: number;
  last_active_at?: string;
}

export interface AdminFeedbackSummary {
  items: Array<{
    id: string;
    actor_id: string;
    domain: ProductOpsDomain;
    resource_type: string;
    resource_id: string;
    rating: number;
    comment?: string;
    created_at: string;
    updated_at: string;
  }>;
  total: number;
  page: number;
  page_size: number;
  stats: {
    average_rating: number;
    by_domain: Record<string, { count: number; average_rating: number }>;
  };
}

export interface AdminDatasetStatus extends AdminDomainStatus {}

export interface AdminSummaryCounts {
  total_users?: number;
  payments?: number;
  refunds?: number;
  open_support_tickets?: number;
  failed_workflows?: number;
  partial_success_workflows?: number;
  [key: string]: unknown;
}

export interface AdminSummary {
  counts: AdminSummaryCounts;
  domains: AdminDomainStatus[];
  payments: { total: number };
  refunds: { total: number };
  workflows: { total: number; by_status: Record<string, number> };
  support: { open: number };
  health: { items: AdminHealthCheck[] };
  datasets: AdminDomainStatus[];
}

export interface AdminTransactionRecord {
  domain: ProductOpsDomain;
  transaction: Record<string, unknown>;
}

export interface AdminPayments {
  payments: AdminPage<Record<string, unknown>>;
  refunds: AdminPage<Record<string, unknown>>;
}

export interface AdminWorkflowRecord {
  orderId: string;
  actorId: string;
  paymentId: string;
  refundId?: string;
  status: string;
  lastErrorCode?: string;
  attemptCount: number;
  nextAttemptAt?: string;
  completedAt?: string;
  claimedAt?: string;
  claimOwner?: string;
}

export interface AdminSupportTicket extends SupportTicket {}

export interface SupportTicketEvent {
  id: string;
  ticket_id: string;
  actor_id?: string;
  event_type: "CREATED" | "MESSAGE" | "STATUS_CHANGED";
  message?: string;
  idempotency_key?: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  actor_id: string;
  resource_type?: FeedbackResourceType;
  resource_id?: string;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportPriority;
  idempotency_key?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  events?: SupportTicketEvent[];
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  kind?: "USER" | "ASSISTANT" | "INTERNAL_ACTION";
  visibility?: "USER_VISIBLE" | "INTERNAL";
  data?: AssistantResponse;
}

export const LEGACY_INTERNAL_ACTION_PREFIX = "__assistant_action__:";

export function isUserVisibleConversationMessage(message: ConversationMessage): boolean {
  return message.kind !== "INTERNAL_ACTION"
    && message.visibility !== "INTERNAL"
    && !message.content.startsWith(LEGACY_INTERNAL_ACTION_PREFIX);
}

export interface ConversationRecord {
  conversationId: string;
  actorId: string;
  title?: string;
  status?: "ACTIVE" | "ARCHIVED";
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: string;
  serviceContext?: string;
  messages: ConversationMessage[];
  state: Record<string, unknown>;
  version?: number;
}

export interface AuthSessionSummary {
  id: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current: boolean;
  user_agent?: string;
}

export type AssistantActionKind =
  | "select_restaurant"
  | "restaurant_confirm"
  | "restaurant_update"
  | "ride_service"
  | "ride_payment"
  | "ride_cancel"
  | "select_healthcare_slot"
  | "healthcare_payment"
  | "healthcare_confirm"
  | "healthcare_cancel"
  | "select_food_item"
  | "food_cart_increment"
  | "food_cart_decrement"
  | "food_cart_remove"
  | "food_checkout"
  | "food_confirm"
  | "food_payment";

type AssistantActionOf<K extends AssistantActionKind> = {
  id: string;
  kind: K;
  label: string;
  target_index?: number;
};

export type AssistantAction =
  | AssistantActionOf<"select_restaurant">
  | AssistantActionOf<"restaurant_confirm">
  | AssistantActionOf<"restaurant_update">
  | AssistantActionOf<"ride_service">
  | AssistantActionOf<"ride_payment">
  | AssistantActionOf<"ride_cancel">
  | AssistantActionOf<"select_healthcare_slot">
  | AssistantActionOf<"healthcare_payment">
  | AssistantActionOf<"healthcare_confirm">
  | AssistantActionOf<"healthcare_cancel">
  | AssistantActionOf<"select_food_item">
  | AssistantActionOf<"food_cart_increment">
  | AssistantActionOf<"food_cart_decrement">
  | AssistantActionOf<"food_cart_remove">
  | AssistantActionOf<"food_checkout">
  | AssistantActionOf<"food_confirm">
  | AssistantActionOf<"food_payment">;

export interface AssistantOption {
  name?: string;
  title?: string;
  location?: string;
  cuisine?: string;
  restaurant?: string | AssistantRestaurant;
  description?: string;
  image_url?: string;
  category?: string;
  review_count?: number;
  price_level?: string;
  opening_hours?: string | string[] | Array<Record<string, unknown>>;
  doctor_title?: string;
  options?: Array<Record<string, unknown>>;
  option_groups?: Array<Record<string, unknown>>;
  doctor?: string;
  department?: string;
  start_time?: string;
  price?: number;
  rating?: number;
  address?: string;
  district?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  facility?: AssistantFacility;
  target_index?: number;
}

export interface AssistantRestaurant {
  name: string;
  location?: string;
  address?: string;
  district?: string;
  city?: string;
  cuisine?: string;
  rating?: number;
  latitude?: number;
  longitude?: number;
}

export interface AssistantFacility {
  name?: string;
  address?: string;
  district?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
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
  delivery?: { eta_minutes?: number; fee?: { amount?: number; currency?: string }; pickup_stops?: AssistantRestaurant[] };
  address?: { address?: string; latitude?: number; longitude?: number };
  restaurants?: AssistantRestaurant[];
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
  operation?: "UPDATE";
  resource_id?: string;
  previous_start_at?: string;
  previous_party_size?: number;
  next_party_size?: number;
  party_size?: number;
  start_at?: string;
  status?: string;
  expires_at?: string;
}

export interface AssistantRideItem extends AssistantItemBase<"ride_quote" | "ride_booking"> {
  status?: string;
  booking_id?: string;
  resource_id?: string;
  pickup?: string;
  dropoff?: string;
  stopovers?: Array<{ address: string; latitude?: number; longitude?: number }>;
  vehicle?: string;
  distance_km?: number;
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
  route_provider?: string;
  route_distance_meters?: number;
  route_duration_seconds?: number;
  route_geometry?: Array<{ latitude: number; longitude: number }>;
  route_polyline?: string;
  pickup_latitude?: number;
  pickup_longitude?: number;
  dropoff_latitude?: number;
  dropoff_longitude?: number;
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
  status?: string;
  appointment_id?: number;
  facility?: AssistantFacility;
  appointment?: AssistantAppointment;
  alternative_slots?: AssistantOption[];
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

export interface AssistantFoodCartItem {
  id?: string;
  name?: string;
  quantity?: number;
  price?: number;
  unit_price?: number;
  description?: string;
  image_url?: string;
  currency?: string;
  restaurant?: string | AssistantRestaurant;
  selected_options?: Array<Record<string, unknown>>;
}

export interface AssistantFoodCart {
  items?: AssistantFoodCartItem[];
  subtotal?: number;
  discount?: number;
  total?: number | { amount?: number; currency?: string };
  delivery_fee?: number | { amount?: number; currency?: string };
  currency?: string;
  cart_version?: number;
}

export interface AssistantPayment {
  status?: string;
  amount?: number;
  currency?: string;
}

export interface AssistantFoodItem extends AssistantItemBase<"food_options" | "food_confirmation" | "food_order" | "food_empty" | "food_cart"> {
  options?: AssistantOption[];
  order?: AssistantFoodOrder;
  payment?: AssistantPayment;
  preview?: AssistantPreview;
  cart?: AssistantFoodCart;
  pickup_stops?: AssistantRestaurant[];
  delivery_address?: string;
  confirmation_state?: "DETAILS_REQUIRED" | "PAYMENT_REQUIRED" | string;
}

export interface AssistantProgressItem extends AssistantItemBase<"progress" | "clarification"> {}

export interface AssistantAddressOption {
  label: string;
  address_text: string;
  is_default?: boolean;
}

export interface AssistantAddressOptionsItem extends AssistantItemBase<"address_options"> {
  purpose: "PICKUP" | "DROPOFF" | "DELIVERY" | string;
  addresses: AssistantAddressOption[];
  allow_new?: boolean;
}

export interface AssistantTaskErrorItem extends AssistantItemBase<"task_error"> {
  error_code?: string;
  retryable?: boolean;
  action_id?: string;
}

export type KnownAssistantItem =
  | AssistantRestaurantOptionsItem
  | AssistantRestaurantConfirmationItem
  | AssistantRideItem
  | AssistantRideTimingConflictItem
  | AssistantHealthcareOptionsItem
  | AssistantHealthcareItem
  | AssistantFoodItem
  | AssistantProgressItem
  | AssistantTaskErrorItem
  | AssistantAddressOptionsItem;

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
    "food_options", "food_confirmation", "food_order", "food_empty", "food_cart", "progress", "clarification", "task_error", "address_options",
  ].includes(item.kind as KnownAssistantItemKind);
}

export interface AssistantResponse {
  conversation_id: string;
  message: string;
  items: AssistantItem[];
  actions: AssistantAction[];
  completed: AssistantItem[];
  workflow_status?: "PENDING" | "RUNNING" | "COMPLETED" | "PARTIAL_SUCCESS" | "FAILED";
}

export type ActivityService = "ride" | "food" | "restaurant" | "healthcare" | "general";

export type ActivityStatus = "pending" | "running" | "completed" | "retrying" | "error";

export interface ActivityEntry {
  id: string;
  service: ActivityService;
  label: string;
  step: string;
  status: ActivityStatus;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  response?: AssistantResponse;
  requestStatus?: "sending" | "sent" | "error" | "stopped";
  retryText?: string;
  retryAction?: AssistantAction;
  pendingStartedAt?: number;
  activity?: ActivityEntry[];
}

export interface SessionActivity {
  id: string;
  title: string;
  reference: string;
  status: string;
  detail: string;
  timestamp: string;
}
