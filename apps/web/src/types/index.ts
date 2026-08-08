export interface AuthUser {
  sub: string;
  email: string;
  role: string;
}

export interface AssistantAction {
  id: string;
  kind: string;
  label: string;
}

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

export interface AssistantPreview {
  subtotal?: number;
  discount?: number;
  cart_version?: number;
  quote_version?: string;
  total?: { amount?: number; currency?: string };
  delivery?: { eta_minutes?: number; fee?: { amount?: number; currency?: string } };
}

export interface AssistantItem {
  kind: string;
  title: string;
  note?: string;
  question?: string;
  options?: AssistantOption[];
  departments?: AssistantOption[];
  restaurant?: AssistantRestaurant;
  reservation_code?: string;
  party_size?: number;
  start_at?: string;
  status?: string;
  expires_at?: string;
  pickup?: string;
  dropoff?: string;
  vehicle?: string;
  amount?: number;
  currency?: string;
  duration_minutes?: number;
  driver?: string;
  doctor?: string;
  department?: string;
  start_time?: string;
  price?: number;
  payment_note?: string;
  appointment_id?: number;
  appointment?: Record<string, unknown>;
  order?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  preview?: AssistantPreview;
}

export interface AssistantResponse {
  conversation_id: string;
  message: string;
  items: AssistantItem[];
  actions: AssistantAction[];
  completed: AssistantItem[];
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
