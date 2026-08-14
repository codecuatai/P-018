import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

import {
  AgentClient,
  FoodClient,
  HealthcareClient,
  JsonObject,
  RestaurantClient,
  RestaurantTool,
} from '../../clients/service.clients';
import { AuthUser } from '../auth/auth.types';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { AssistantActionExecutionClaim, AssistantActionExecutionRecord, AssistantActionSuccessCommit, CoreStore, isUserVisibleConversationMessage, ConversationMessageKind } from '../core/core.module';
import { ServiceCallError } from '../../resilience/service-call-error';
import { RideConversationService as RideWorkflowService, RideRouteContext, RideWorkflowHydration } from './ride-conversation.service';
import {
  buildOrchestrationSnapshot,
  hasFailedDependency,
  OrchestrationSnapshot,
  WorkflowStatus,
} from './orchestration';

type Domain = 'ride' | 'food' | 'restaurant' | 'healthcare';
type TaskPhase = 'PLANNING' | 'NEEDS_INFO' | 'IN_PROGRESS' | 'AWAITING_CONFIRMATION' | 'COMPLETED' | 'FAILED';
type ActionKind = 'select_restaurant' | 'restaurant_confirm' | 'ride_service' | 'ride_payment' | 'select_healthcare_slot' | 'healthcare_payment' | 'healthcare_confirm' | 'select_food_item' | 'food_cart_increment' | 'food_cart_decrement' | 'food_cart_remove' | 'food_checkout' | 'food_confirm';

type StoredAction = {
  id: string;
  kind: ActionKind;
  task_id: string;
  task_revision: number;
  cohort_id: string;
  confirmation_id?: string;
  workflow_id?: string;
  appointment_id?: number;
  selection_index?: number;
  doctor_index?: number;
  slot_index?: number;
  slot_id?: number;
  cart_id?: string;
  cart_item_id?: string;
  quantity?: number;
};

type StoredTask = {
  id: string;
  domain: Domain;
  goal: string;
  normalized_request: string;
  extracted_slots: Record<string, unknown>;
  depends_on: string[];
  phase: TaskPhase;
  revision: number;
  workflow_id?: string;
  authoritative?: JsonObject;
  public_item?: JsonObject;
  latest_message?: string;
  failure_code?: string;
};

type AssistantState = {
  tasks: StoredTask[];
  actions: StoredAction[];
  food_context?: JsonObject;
  decision_source?: string;
  orchestration?: OrchestrationSnapshot;
};

type MergeResult = {
  tasks: StoredTask[];
  touchedIds: Set<string>;
};

type TaskProcessResult = {
  phase: TaskPhase;
  items?: JsonObject[];
  actions?: StoredAction[];
  authoritative?: JsonObject;
  publicItem?: JsonObject;
  workflowId?: string;
};

export type AssistantActionRequest = {
  conversation_id: string;
  action_id: string;
};

export type AssistantResponse = {
  conversation_id: string;
  message: string;
  items: JsonObject[];
  actions: Array<{ id: string; kind: ActionKind; label: string }>;
  completed: JsonObject[];
  workflow_status: WorkflowStatus;
};

type AgentPlanTask = {
  domain?: unknown;
  goal?: unknown;
  normalized_request?: unknown;
  extracted_slots?: unknown;
  depends_on?: unknown;
};

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function integerValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
  }
  return value;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableJson(value))).digest('hex');
}

const HEALTHCARE_TIMEZONE = 'Asia/Bangkok';
const HEALTHCARE_NEAREST_SLOT_WINDOW_MINUTES = 120;
const HEALTHCARE_RIDE_DEPARTURE_BUFFER_MINUTES = 20;

function plainText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('đ', 'd').replaceAll('Đ', 'D').toLowerCase();
}

function textHasAny(value: string, candidates: string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

function selectionName(index: number): string {
  return ['first', 'second', 'third', 'fourth', 'fifth'][index] ?? 'first';
}

function selectionIndex(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const normalized = plainText(value);
  const names = ['first', 'second', 'third', 'fourth', 'fifth'];
  const index = names.indexOf(normalized);
  return index >= 0 ? index : undefined;
}

function selectionIndexFromText(message: string | undefined, candidates: JsonObject[]): number | undefined {
  if (!message || !candidates.length) return undefined;
  const normalized = plainText(message);
  const numberMatch = normalized.match(/\b(?:so|thu)\s*([1-9][0-9]?)\b/);
  if (numberMatch) {
    const index = Number(numberMatch[1]) - 1;
    return index >= 0 && index < candidates.length ? index : undefined;
  }
  if (textHasAny(normalized, ['dau tien', 'first'])) return 0;
  if (textHasAny(normalized, ['thu hai', 'second'])) return candidates.length > 1 ? 1 : undefined;
  if (textHasAny(normalized, ['thu ba', 'third'])) return candidates.length > 2 ? 2 : undefined;
  if (textHasAny(normalized, ['thu tu', 'fourth'])) return candidates.length > 3 ? 3 : undefined;
  if (textHasAny(normalized, ['thu nam', 'fifth'])) return candidates.length > 4 ? 4 : undefined;
  const exactMatches = candidates.map((candidate) => plainText(String(candidate.name ?? candidate.doctor ?? candidate.title ?? ''))).map((name, index) => ({ name, index })).filter((value) => value.name && normalized.includes(value.name));
  return exactMatches.length === 1 ? exactMatches[0].index : undefined;
}

function foodSelectionIndex(message: string, candidates: JsonObject[]): number | undefined {
  return selectionIndexFromText(message, candidates);
}

function assistantActionFailureStatus(error: unknown): 'FAILED_RETRYABLE' | 'FAILED_FINAL' {
  if (error instanceof ServiceCallError) {
    return error.retryable && !['BUSINESS', 'CLIENT', 'CONTRACT'].includes(error.category) ? 'FAILED_RETRYABLE' : 'FAILED_FINAL';
  }
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isRecord(response) && response.retryable === true) return 'FAILED_RETRYABLE';
    const status = error.getStatus();
    return status === 408 || status === 429 || status >= 500 ? 'FAILED_RETRYABLE' : 'FAILED_FINAL';
  }
  if (error instanceof Error && /timeout|timed out|network|econn|socket|temporar|unavailable/i.test(`${error.name} ${error.message}`)) {
    return 'FAILED_RETRYABLE';
  }
  return 'FAILED_FINAL';
}

function publicFailureCode(error: unknown): string {
  const candidate = error instanceof ServiceCallError
    ? error.code
    : error instanceof HttpException
      ? (() => {
        const response = error.getResponse();
        if (!isRecord(response)) return undefined;
        if (typeof response.code === 'string') return response.code;
        return isRecord(response.detail) && typeof response.detail.code === 'string' ? response.detail.code : undefined;
      })()
      : undefined;
  return candidate && /^[A-Z][A-Z0-9_]{2,63}$/.test(candidate) ? candidate : 'TASK_EXECUTION_FAILED';
}

/**
 * Core persistence failures are kept separate from domain failures. Their
 * receipt remains PROCESSING so the same key can reclaim it after its lease;
 * Core's transaction keeps the original action in stored conversation state.
 */
class AssistantActionCommitFailure extends Error {}

function parseAuthoritativeDate(value: unknown): Date | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}+07:00`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function healthcareDateKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: HEALTHCARE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function healthcareHour(value: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: HEALTHCARE_TIMEZONE, hour: '2-digit', hour12: false }).format(value));
}

function filterDoctorsByRequestedTime(doctors: JsonObject[], slots: Record<string, unknown>): JsonObject[] {
  const requested = parseAuthoritativeDate(slots.start_at);
  const preference = stringValue(slots.time_preference)?.toLowerCase();
  const hasDateOrPreference = Boolean(requested || preference);
  if (!hasDateOrPreference) return doctors;

  const targetDate = requested
    ? healthcareDateKey(requested)
    : preference?.includes('tomorrow')
      ? healthcareDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000))
      : undefined;
  const range = preference?.includes('morning')
    ? { start: 6, end: 12 }
    : preference?.includes('afternoon')
      ? { start: 12, end: 18 }
      : preference?.includes('evening') || preference?.includes('night')
        ? { start: 18, end: 23 }
        : undefined;

  const filtered = doctors.map((doctor) => {
    const availableSlots = arrayValue(doctor.available_slots).filter(isRecord).filter((slot) => {
      const start = parseAuthoritativeDate(slot.start_time);
      if (!start) return false;
      if (targetDate && healthcareDateKey(start) !== targetDate) return false;
      if (range && (healthcareHour(start) < range.start || healthcareHour(start) >= range.end)) return false;
      if (requested && Math.abs(start.getTime() - requested.getTime()) > HEALTHCARE_NEAREST_SLOT_WINDOW_MINUTES * 60_000) return false;
      return true;
    });
    return { ...doctor, available_slots: availableSlots };
  }).filter((doctor) => arrayValue(doctor.available_slots).length > 0);

  // An explicit clock is exact when the domain offers it. Only when no exact
  // slot exists do we expose nearby alternatives; the Gateway labels those
  // alternatives instead of silently changing the requested time.
  if (requested) {
    const exact = filtered.map((doctor) => ({
      ...doctor,
      available_slots: arrayValue(doctor.available_slots).filter((slot) => {
        const start = parseAuthoritativeDate(isRecord(slot) ? slot.start_time : undefined);
        return Boolean(start && Math.abs(start.getTime() - requested.getTime()) <= 60_000);
      }),
    })).filter((doctor) => arrayValue(doctor.available_slots).length > 0);
    if (exact.length) return exact;
  }
  return filtered;
}

function hasExactHealthcareSlot(doctors: JsonObject[], requested: Date | undefined): boolean {
  if (!requested) return false;
  return doctors.some((doctor) => arrayValue(doctor.available_slots).some((slot) => {
    const start = parseAuthoritativeDate(isRecord(slot) ? slot.start_time : undefined);
    return Boolean(start && Math.abs(start.getTime() - requested.getTime()) <= 60_000);
  }));
}

function safeText(value: unknown, fallback: string): string {
  const text = stringValue(value) ?? fallback;
  if (/authoritative|demo|sandbox|provider|workflow|tool[_ ]?request|state[_ ]?patch|risk[_ ]?level|correlation|actor[_ ]?id|api gateway|backend|confirmation token/i.test(text)) {
    return fallback;
  }
  return text;
}

function sanitizedSlots(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (normalized.endsWith('_id') || ['price', 'amount', 'currency', 'availability', 'available', 'status', 'payment_status'].includes(normalized)) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') result[key] = item;
    if (Array.isArray(item) && item.every((entry) => typeof entry === 'string' || typeof entry === 'number')) result[key] = item;
  }
  return result;
}

function taskPhaseFrom(value: unknown): TaskPhase {
  return value === 'NEEDS_INFO' || value === 'IN_PROGRESS' || value === 'AWAITING_CONFIRMATION' || value === 'COMPLETED' || value === 'FAILED' || value === 'PLANNING'
    ? value
    : 'PLANNING';
}

function storedState(value: unknown): AssistantState {
  if (!isRecord(value)) return { tasks: [], actions: [] };
  const tasks = arrayValue(value.tasks).filter(isRecord).map((task) => ({
    id: stringValue(task.id) ?? `task_${randomUUID().slice(0, 8)}`,
    domain: ['ride', 'food', 'restaurant', 'healthcare'].includes(String(task.domain)) ? task.domain as Domain : 'food',
    goal: stringValue(task.goal) ?? 'Tiếp tục yêu cầu',
    normalized_request: stringValue(task.normalized_request) ?? '',
    extracted_slots: sanitizedSlots(task.extracted_slots),
    depends_on: arrayValue(task.depends_on).filter((item): item is string => typeof item === 'string'),
    phase: taskPhaseFrom(task.phase),
    revision: integerValue(task.revision),
    ...(stringValue(task.workflow_id) ? { workflow_id: task.workflow_id as string } : {}),
    ...(isRecord(task.authoritative) ? { authoritative: task.authoritative } : {}),
    ...(isRecord(task.public_item) ? { public_item: task.public_item } : {}),
    ...(stringValue(task.latest_message) ? { latest_message: task.latest_message as string } : {}),
    ...(stringValue(task.failure_code) ? { failure_code: task.failure_code as string } : {}),
  }));
  const actions: StoredAction[] = arrayValue(value.actions).filter(isRecord).map((action) => ({
    id: stringValue(action.id) ?? `action_${randomUUID().slice(0, 8)}`,
    kind: action.kind as ActionKind,
    task_id: stringValue(action.task_id) ?? '',
    task_revision: integerValue(action.task_revision, tasks.find((task) => task.id === action.task_id)?.revision ?? 0),
    cohort_id: stringValue(action.cohort_id) ?? `cohort_${String(action.task_id)}_${integerValue(action.task_revision)}`,
    ...(stringValue(action.confirmation_id) ? { confirmation_id: action.confirmation_id as string } : {}),
    ...(stringValue(action.workflow_id) ? { workflow_id: action.workflow_id as string } : {}),
    ...(numberValue(action.appointment_id) ? { appointment_id: numberValue(action.appointment_id) } : {}),
    ...(numberValue(action.selection_index) !== undefined ? { selection_index: numberValue(action.selection_index) } : {}),
    ...(numberValue(action.doctor_index) !== undefined ? { doctor_index: numberValue(action.doctor_index) } : {}),
    ...(numberValue(action.slot_index) !== undefined ? { slot_index: numberValue(action.slot_index) } : {}),
    ...(numberValue(action.slot_id) !== undefined ? { slot_id: numberValue(action.slot_id) } : {}),
    ...(stringValue(action.cart_id) ? { cart_id: action.cart_id as string } : {}),
    ...(stringValue(action.cart_item_id) ? { cart_item_id: action.cart_item_id as string } : {}),
    ...(numberValue(action.quantity) !== undefined ? { quantity: numberValue(action.quantity) } : {}),
  })).filter((action) => action.task_id && ['select_restaurant', 'restaurant_confirm', 'ride_service', 'ride_payment', 'select_healthcare_slot', 'healthcare_payment', 'healthcare_confirm', 'select_food_item', 'food_cart_increment', 'food_cart_decrement', 'food_cart_remove', 'food_checkout', 'food_confirm'].includes(action.kind)) as StoredAction[];
  const decisionSource = stringValue(value.decision_source);
  return {
    tasks,
    actions,
    ...(isRecord(value.food_context) ? { food_context: value.food_context } : {}),
    ...(decisionSource ? { decision_source: decisionSource } : {}),
    ...(isRecord(value.orchestration) ? { orchestration: value.orchestration as unknown as OrchestrationSnapshot } : {}),
  };
}

function rideReferences(task: StoredTask): RideWorkflowHydration | undefined {
  const authoritative = task.authoritative;
  const result = isRecord(authoritative?.result) ? authoritative.result : undefined;
  const quote = [authoritative?.quote, result?.quote].find(isRecord);
  const booking = [authoritative?.booking, result?.booking].find(isRecord);
  const quoteId = stringValue(quote?.id) ?? stringValue(booking?.quote_id);
  if (!quoteId) return undefined;
  const bookingId = stringValue(booking?.id);
  return bookingId ? { quoteId, bookingId } : { quoteId };
}

function rideAuthority(result: JsonObject, extra: JsonObject = {}): JsonObject {
  const quote = isRecord(result.quote) ? result.quote : undefined;
  const booking = isRecord(result.booking) ? result.booking : undefined;
  return {
    ...(quote ? { quote } : {}),
    ...(booking ? { booking } : {}),
    ...extra,
  };
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly store: CoreStore,
    private readonly agent: AgentClient,
    private readonly restaurant: RestaurantClient,
    private readonly healthcare: HealthcareClient,
    private readonly ride: RideWorkflowService,
    private readonly confirmations: ConfirmationService,
    @Optional() private readonly food?: FoodClient,
  ) {}

  private plannerSafeState(state: AssistantState): JsonObject {
    const taskIndexes = new Map(state.tasks.map((task, index) => [task.id, index]));
    return {
      tasks: state.tasks.slice(0, 8).map((task, index) => {
        const pendingActions = state.actions.filter((action) => action.task_id === task.id).map((action) => action.kind);
        const pendingChoice = this.plannerPendingChoice(task);
        return {
          task_ref: index,
          domain: task.domain,
          goal: this.plannerText(task.goal),
          normalized_request: this.plannerText(task.normalized_request),
          phase: task.phase,
          extracted_slots: sanitizedSlots(task.extracted_slots),
          depends_on: task.depends_on.map((dependency) => taskIndexes.get(dependency)).filter((value): value is number => value !== undefined),
          ...(pendingActions.length ? { pending_actions: pendingActions } : {}),
          ...(pendingChoice ? { pending_choice: pendingChoice } : {}),
        };
      }),
    };
  }

  private plannerText(value: unknown): string {
    const text = stringValue(value);
    if (!text || /(?:confirmation|workflow|tool[_ -]?call|reservation|appointment|booking|order)[_: -][a-z0-9-]+/i.test(text)) return '';
    return text.slice(0, 500);
  }

  private plannerPendingChoice(task: StoredTask): JsonObject | undefined {
    const authoritative = task.authoritative;
    if (task.domain === 'restaurant') {
      const count = arrayValue(authoritative?.candidates).filter(isRecord).length;
      return count ? { kind: 'restaurant_candidates', count } : undefined;
    }
    if (task.domain === 'healthcare') {
      const count = arrayValue(authoritative?.doctors).filter(isRecord).length;
      return count ? { kind: 'healthcare_slots', count } : undefined;
    }
    if (task.domain === 'food') {
      const context = isRecord(authoritative?.food_context)
        ? authoritative.food_context
        : isRecord(authoritative?.state_updates)
          ? authoritative.state_updates
          : undefined;
      if (!context) return undefined;
      const restaurantCount = arrayValue(context.restaurant_candidates).filter(isRecord).length;
      if (restaurantCount) return { kind: 'food_restaurant_candidates', count: restaurantCount };
      const itemCount = arrayValue(
        context.item_candidates
        ?? context.menu_item_candidates
        ?? context.menu_items
        ?? context.options,
      ).filter(isRecord).length;
      return itemCount ? { kind: 'food_item_candidates', count: itemCount } : undefined;
    }
    return undefined;
  }

  private resolvePlanTasks(current: StoredTask[], planned: AgentPlanTask[], message: string, actions: StoredAction[]): { tasks: AgentPlanTask[]; clarificationQuestion?: string } {
    const active = current.filter((task) => task.phase !== 'COMPLETED');
    if (!active.length) return { tasks: planned };
    const folded = plainText(message);
    const explicitDomains = new Set<Domain>();
    if (textHasAny(folded, ['pho', 'bun', 'com', 'mon an', 'do an', 'giao ve', 'giao toi', 'ship', 'dat mon'])) explicitDomains.add('food');
    if (textHasAny(folded, ['dat ban', 'nha hang', 'an tai nha hang'])) explicitDomains.add('restaurant');
    if (textHasAny(folded, ['lich kham', 'dat lich', 'bac si', 'kham', 'than kinh', 'trieu chung'])) explicitDomains.add('healthcare');
    if (textHasAny(folded, ['dat xe', 'goi xe', 'di tu', 'xe may', 'xe 4 cho', 'xe 7 cho'])) explicitDomains.add('ride');

    if (explicitDomains.size) {
      const explicitTasks = planned.filter((task) => explicitDomains.has(task.domain as Domain));
      if (explicitTasks.length) return { tasks: explicitTasks };
      if (explicitDomains.size === 1) {
        const domain = [...explicitDomains][0];
        const existing = active.find((task) => task.domain === domain);
        if (existing) return { tasks: [this.planFromTask(existing)] };
      }
      return { tasks: planned };
    }

    const targets = this.followUpDomains(active, actions, folded);
    if (targets.length > 1) {
      return { tasks: [], clarificationQuestion: this.followUpClarificationQuestion(targets) };
    }
    if (targets.length === 1) {
      const target = targets[0];
      const matching = planned.filter((task) => task.domain === target);
      if (matching.length) return { tasks: matching };
      const existing = active.find((task) => task.domain === target);
      if (existing) return { tasks: [this.planFromTask(existing)] };
    }

    if (planned.length > 1 && planned.every((task) => active.some((candidate) => candidate.domain === task.domain))) {
      return { tasks: [], clarificationQuestion: 'Bạn muốn tiếp tục với yêu cầu nào trước?' };
    }
    return { tasks: planned };
  }

  private planFromTask(task: StoredTask): AgentPlanTask {
    return {
      domain: task.domain,
      goal: task.goal,
      normalized_request: task.normalized_request || task.goal,
      extracted_slots: sanitizedSlots(task.extracted_slots),
    };
  }

  private followUpClarificationQuestion(domains: Domain[]): string {
    const labels: Record<Domain, string> = {
      food: 'đồ ăn',
      restaurant: 'đặt bàn',
      healthcare: 'lịch khám',
      ride: 'chuyến xe',
    };
    const values = domains.map((domain) => labels[domain]);
    const joined = values.length === 2
      ? values.join(' hay ')
      : `${values.slice(0, -1).join(', ')} hay ${values[values.length - 1]}`;
    return `Bạn muốn tiếp tục với ${joined} nào trước?`;
  }

  private pendingChoiceDomains(active: StoredTask[], actions: StoredAction[]): Domain[] {
    const candidates = new Set<Domain>();
    for (const action of actions) {
      const task = active.find((candidate) => candidate.id === action.task_id && candidate.revision === action.task_revision);
      if (task) candidates.add(task.domain);
    }
    for (const task of active) {
      if (this.plannerPendingChoice(task)) candidates.add(task.domain);
    }
    return (['food', 'restaurant', 'healthcare', 'ride'] as Domain[]).filter((domain) => candidates.has(domain));
  }

  private followUpDomains(active: StoredTask[], actions: StoredAction[], folded: string): Domain[] {
    const available = new Set(active.map((task) => task.domain));
    const candidates = this.pendingChoiceDomains(active, actions);
    const hasCandidate = (domain: Domain): boolean => candidates.includes(domain);
    const foodSelection = textHasAny(folded, ['chon quan', 'chon mon']);
    if (foodSelection && available.has('food') && hasCandidate('food')) return ['food'];
    if (textHasAny(folded, ['chon nha hang']) && available.has('restaurant') && hasCandidate('restaurant')) return ['restaurant'];
    if (textHasAny(folded, ['chon lich']) && available.has('healthcare') && hasCandidate('healthcare')) return ['healthcare'];

    const foodSignal = textHasAny(folded, ['pho', 'bun', 'com', 'bat', 'co lon', 'khong cay', 'giao ve', 'giao toi', 'ship', 'dia chi', 'ap ma', 'tong tien', 'xem tong', 'dat luon']);
    if (foodSignal && available.has('food')) return ['food'];
    if (textHasAny(folded, ['lich kham', 'bac si', 'kham', 'than kinh']) && available.has('healthcare')) return ['healthcare'];
    if (textHasAny(folded, ['dat ban', 'nha hang', 'so nguoi']) && available.has('restaurant')) return ['restaurant'];
    if (textHasAny(folded, ['dat xe', 'goi xe', 'xe may', 'xe 4 cho', 'xe 7 cho']) && available.has('ride')) return ['ride'];

    if (textHasAny(folded, ['chon cai', 'chon thu', 'chon dau'])) {
      if (candidates.length) return candidates;
      return [...available];
    }
    if (active.length === 1 && (textHasAny(folded, ['nguoi', 'hoan kiem', 'ha noi', 'cau giay', 'tay ho', 'ba dinh', 'sang mai', 'toi nay', 'ngay mai', 'dong y', 'xac nhan']) || /\b\d{1,2}\s*(gio|h)\b/.test(folded))) return [active[0].domain];
    return [];
  }

  async chat(
    user: AuthUser,
    message: string,
    requestedConversationId: string | undefined,
    correlationId: string,
  ): Promise<AssistantResponse> {
    const conversationId = requestedConversationId ?? `conv_${randomUUID()}`;
    const current = await this.store.getConversation(conversationId, user.sub);
    const state = storedState(current?.state);
    const planner = await this.agent.assistantChat(
      {
        conversation_id: conversationId,
        user_id: user.sub,
        message,
        messages: (current?.messages ?? []).filter(isUserVisibleConversationMessage).slice(-12).map((entry) => ({ role: entry.role, content: entry.content })),
        conversation_state: this.plannerSafeState(state),
        correlation_id: correlationId,
      },
      correlationId,
    );
    const rawPlan = isRecord(planner.plan) ? planner.plan : {};
    const rawPlanTasks = arrayValue(rawPlan.tasks).filter(isRecord) as AgentPlanTask[];
    const resolution = this.resolvePlanTasks(state.tasks, rawPlanTasks, message, state.actions);
    const plan = { ...rawPlan, ...(resolution.clarificationQuestion ? { clarification_question: resolution.clarificationQuestion } : {}) };
    const planTasks = resolution.tasks;
    const merge = this.mergeTasks(state.tasks, planTasks, message);
    const merged = merge.tasks;
    const actions: StoredAction[] = state.actions.filter((action) => {
      const task = merged.find((candidate) => candidate.id === action.task_id);
      return Boolean(task && !merge.touchedIds.has(task.id) && action.task_revision === task.revision);
    });
    const items: JsonObject[] = [];
    const completed: JsonObject[] = [];
    const resultsForComposition: JsonObject[] = [];

    if (!planTasks.length && stringValue(plan.clarification_question)) {
      // Clarification is informational only: retain every task, revision,
      // authoritative choice, and public action exactly as persisted.
      return this.persistTurn(conversationId, user, message, safeText(plan.clarification_question, 'Bạn cho mình biết thêm một chút thông tin nhé?'), state, [], state.actions);
    }

    for (const task of merged) {
      if (task.phase === 'COMPLETED' && task.public_item) {
        completed.push(task.public_item);
        continue;
      }
      if (!merge.touchedIds.has(task.id)) {
        if (task.public_item) items.push(task.public_item);
        continue;
      }
      if (hasFailedDependency(task, merged)) {
        const publicItem = {
          kind: 'task_error',
          title: 'Bước tiếp theo chưa thể thực hiện',
          note: 'Mình đã tạm dừng bước tiếp theo vì thông tin trước đó chưa hoàn tất.',
          error_code: 'DEPENDENCY_BLOCKED',
          retryable: false,
        };
        task.phase = 'FAILED';
        task.failure_code = 'DEPENDENCY_BLOCKED';
        task.public_item = publicItem;
        items.push(publicItem);
        resultsForComposition.push(publicItem);
        continue;
      }
      if (!this.dependenciesReady(task, merged)) continue;
      try {
        const result = await this.processTask(task, merged, user, conversationId, correlationId);
        task.phase = result.phase;
        if (result.authoritative) task.authoritative = result.authoritative;
        if (result.publicItem) task.public_item = result.publicItem;
        if (result.workflowId) task.workflow_id = result.workflowId;
        if (result.actions) actions.push(...result.actions);
        if (result.items) items.push(...result.items);
        if (result.publicItem) resultsForComposition.push(result.publicItem);
      } catch (error: unknown) {
        const code = publicFailureCode(error);
        const publicItem = {
          kind: 'task_error',
          title: 'Dịch vụ chưa hoàn tất',
          note: 'Mình đã giữ nguyên các dịch vụ độc lập và ghi nhận bước này chưa hoàn tất an toàn.',
          error_code: code,
          retryable: assistantActionFailureStatus(error) === 'FAILED_RETRYABLE',
        };
        task.phase = 'FAILED';
        task.failure_code = code;
        task.public_item = publicItem;
        items.push(publicItem);
        resultsForComposition.push(publicItem);
      }
    }

    actions.sort((left, right) => {
      const leftIndex = merged.findIndex((task) => task.id === left.task_id);
      const rightIndex = merged.findIndex((task) => task.id === right.task_id);
      return leftIndex - rightIndex;
    });

    const foodTask = merged.find((task) => task.domain === 'food');
    const foodContext = isRecord(foodTask?.authoritative?.food_context)
      ? foodTask.authoritative.food_context
      : isRecord(state.food_context)
        ? state.food_context
        : undefined;
    const nextState: AssistantState = {
      ...state,
      tasks: merged.slice(0, 8),
      actions,
      decision_source: stringValue(planner.decision_source) ?? 'deterministic',
      ...(foodContext ? { food_context: foodContext } : {}),
    };
    nextState.orchestration = buildOrchestrationSnapshot(
      merged,
      Object.fromEntries(merged.flatMap((task) => task.failure_code ? [[task.id, task.failure_code]] : [])),
    );
    const baseMessage = this.messageFor(message, plan, merged, items, actions);
    const composed = await this.compose(message, conversationId, user.sub, merged, resultsForComposition, correlationId, baseMessage);
    const response = await this.persistTurn(conversationId, user, message, composed, nextState, items, actions, completed);
    return response;
  }

  async act(
    user: AuthUser,
    request: AssistantActionRequest,
    correlationId: string,
    idempotencyKey: string,
  ): Promise<AssistantResponse> {
    const requestHash = stableHash({ conversation_id: request.conversation_id, action_id: request.action_id });
    const conversation = await this.store.getConversation(request.conversation_id, user.sub);
    if (!conversation) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', detail: 'Không tìm thấy cuộc trò chuyện.' });
    const state = storedState(conversation.state);
    const action = state.actions.find((candidate) => candidate.id === request.action_id);
    const previousExecution = await this.getAssistantActionExecution(user.sub, request.conversation_id, request.action_id);
    let executionIdempotencyKey = idempotencyKey;
    if (previousExecution) {
      if (previousExecution.requestHash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Mã yêu cầu đã được dùng cho một lựa chọn khác.' });
      if (previousExecution.status === 'SUCCEEDED' && previousExecution.response) return previousExecution.response as unknown as AssistantResponse;
      if (previousExecution.status === 'FAILED_FINAL') {
        if (previousExecution.idempotencyKey !== idempotencyKey) throw new ConflictException({ code: 'ACTION_NOT_AVAILABLE', detail: 'Lựa chọn này không còn hiệu lực.' });
        if (previousExecution.response) return previousExecution.response as unknown as AssistantResponse;
        throw new ConflictException({ code: 'ASSISTANT_ACTION_FAILED', detail: 'Lựa chọn này chưa thể hoàn tất an toàn.' });
      }
      if (previousExecution.status === 'FAILED_RETRYABLE') {
        // Recovery stays bound to the first key even if a consumer generated a
        // fresh key after a transient response. Domain idempotency can then
        // replay the original side effect instead of creating a second one.
        executionIdempotencyKey = previousExecution.idempotencyKey;
      } else if (previousExecution.idempotencyKey !== idempotencyKey) {
        throw new ConflictException({ code: 'ACTION_NOT_AVAILABLE', detail: 'Lựa chọn này đang được xử lý.' });
      }
    }
    if (!action) throw new ConflictException({ code: 'ACTION_NOT_AVAILABLE', detail: 'Lựa chọn này không còn hiệu lực.' });
    const task = state.tasks.find((candidate) => candidate.id === action.task_id);
    if (!task) throw new ConflictException({ code: 'TASK_NOT_FOUND', detail: 'Lựa chọn này không còn hiệu lực.' });
    if (action.task_revision !== task.revision) {
      throw new ConflictException({ code: 'ACTION_NOT_AVAILABLE', detail: 'Lựa chọn này đã cũ. Bạn chọn lại phương án hiện tại nhé.' });
    }
    if (action.kind === 'ride_service' && !this.rideActionAllowed(task, state.tasks)) {
      throw new ConflictException({ code: 'PREREQUISITE_NOT_COMPLETED', detail: 'Bạn hoàn tất bước trước rồi mình sẽ xác nhận chuyến xe nhé.' });
    }
    const taskBeforeAction = JSON.parse(JSON.stringify(task)) as StoredTask;
    const claim = await this.claimAssistantActionExecution(user.sub, request.conversation_id, request.action_id, executionIdempotencyKey, requestHash);
    if (claim.state === 'ACTION_NOT_AVAILABLE') throw new ConflictException({ code: 'ACTION_NOT_AVAILABLE', detail: 'Lựa chọn này đã được xử lý hoặc không còn hiệu lực.' });
    if (claim.state === 'IDEMPOTENCY_KEY_REUSED') throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Mã yêu cầu đã được dùng cho một lựa chọn khác.' });
    if (claim.state === 'SUCCEEDED' && claim.execution?.response) return claim.execution.response as unknown as AssistantResponse;
    if (claim.state === 'PROCESSING') throw new ConflictException({ code: 'ASSISTANT_ACTION_PROCESSING', detail: 'Lựa chọn này đang được xử lý.', retryable: true });
    if (claim.state === 'FAILED_FINAL') throw new ConflictException({ code: 'ASSISTANT_ACTION_FAILED', detail: 'Lựa chọn này chưa thể hoàn tất an toàn.' });
    // An action advances the task revision. This makes the selected action and
    // every sibling from the old phase unusable even if a client replays it.
    try {
      await this.hydrateRideAction(action, task, user.sub, correlationId);
      const preservesFoodSiblings = action.kind === 'select_food_item';
      if (!preservesFoodSiblings) task.revision += 1;
      const result = await this.executeAction(action, task, user, request.conversation_id, correlationId, executionIdempotencyKey);
      task.phase = result.phase;
      task.authoritative = result.authoritative ?? task.authoritative;
      task.public_item = result.publicItem ?? task.public_item;
      state.actions = preservesFoodSiblings
        ? state.actions.filter((candidate) => candidate.id !== action.id)
        : state.actions.filter((candidate) => candidate.task_id !== task.id);
      if (result.nextActions) state.actions.push(...result.nextActions);
      if (result.nextAction) state.actions.push(result.nextAction);
      const remainingItems = result.publicItem ? [result.publicItem] : [];
      const dependentActions: StoredAction[] = [];
      for (const dependent of state.tasks) {
        if (
          dependent.id === task.id
          || !dependent.depends_on.includes(task.id)
          || dependent.phase === 'COMPLETED'
          || !this.dependenciesReady(dependent, state.tasks)
        ) continue;
        state.actions = state.actions.filter((candidate) => candidate.task_id !== dependent.id);
        if (hasFailedDependency(dependent, state.tasks)) {
          dependent.phase = 'FAILED';
          dependent.failure_code = 'DEPENDENCY_BLOCKED';
          const publicItem = { kind: 'task_error', title: 'Bước tiếp theo chưa thể thực hiện', note: 'Mình đã tạm dừng bước tiếp theo vì thông tin trước đó chưa hoàn tất.', error_code: 'DEPENDENCY_BLOCKED', retryable: false };
          dependent.public_item = publicItem;
          remainingItems.push(publicItem);
          continue;
        }
        try {
          const dependentResult = await this.processTask(dependent, state.tasks, user, request.conversation_id, correlationId);
          dependent.phase = dependentResult.phase;
          if (dependentResult.authoritative) dependent.authoritative = dependentResult.authoritative;
          if (dependentResult.publicItem) {
            dependent.public_item = dependentResult.publicItem;
            remainingItems.push(dependentResult.publicItem);
          }
          if (dependentResult.workflowId) dependent.workflow_id = dependentResult.workflowId;
          if (dependentResult.actions) {
            dependentActions.push(...dependentResult.actions);
            state.actions.push(...dependentResult.actions);
          }
        } catch (error: unknown) {
          const code = publicFailureCode(error);
          dependent.phase = 'FAILED';
          dependent.failure_code = code;
          const publicItem = { kind: 'task_error', title: 'Chưa thể chuẩn bị bước tiếp theo', note: 'Bước trước đã hoàn tất nhưng mình chưa thể chuẩn bị phần tiếp theo.', error_code: code, retryable: assistantActionFailureStatus(error) === 'FAILED_RETRYABLE' };
          dependent.public_item = publicItem;
          remainingItems.push(publicItem);
        }
      }
      state.orchestration = buildOrchestrationSnapshot(
        state.tasks,
        Object.fromEntries(state.tasks.flatMap((candidate) => candidate.failure_code ? [[candidate.id, candidate.failure_code]] : [])),
      );
      const message = dependentActions.length
        ? `${result.message} Mình cũng đã chuẩn bị bước tiếp theo cho chuyến xe của bạn.`
        : result.message;
      const turn = this.buildTurn(
        request.conversation_id,
        user,
        action.kind,
        message,
        { ...state, tasks: state.tasks },
        remainingItems,
        state.actions,
        result.phase === 'COMPLETED' && result.publicItem ? [result.publicItem] : [],
        'INTERNAL_ACTION',
      );
      try {
        await this.commitAssistantActionSuccess({
          actorId: user.sub,
          conversationId: request.conversation_id,
          actionId: request.action_id,
          idempotencyKey: executionIdempotencyKey,
          requestHash,
          userMessage: turn.userMessage,
          assistantMessage: turn.assistantMessage,
          stateUpdates: turn.stateUpdates,
          response: turn.response as unknown as Record<string, unknown>,
        });
      } catch {
        // Do not make a second receipt write. A rolled-back transaction leaves
        // the old action and receipt together for safe same-key recovery.
        throw new AssistantActionCommitFailure();
      }
      return turn.response;
    } catch (error: unknown) {
      if (error instanceof AssistantActionCommitFailure) {
        throw new ServiceUnavailableException({
          code: 'ASSISTANT_ACTION_COMMIT_RETRY',
          detail: 'Kết quả đang được lưu. Bạn thử lại sau ít phút với cùng mã yêu cầu nhé.',
          retryable: true,
        });
      }
      if ((action.kind === 'ride_service' || action.kind === 'ride_payment') && assistantActionFailureStatus(error) === 'FAILED_FINAL') {
        const code = publicFailureCode(error);
        task.phase = 'FAILED';
        task.failure_code = code;
        const publicItem = {
          kind: 'task_error',
          title: 'Chuyến xe chưa hoàn tất',
          note: 'Các dịch vụ độc lập vẫn được giữ nguyên; hiện chưa thể hoàn tất chuyến xe này.',
          error_code: code,
          retryable: false,
        };
        task.public_item = publicItem;
        state.actions = state.actions.filter((candidate) => candidate.task_id !== task.id);
        state.orchestration = buildOrchestrationSnapshot(
          state.tasks,
          Object.fromEntries(state.tasks.flatMap((candidate) => candidate.failure_code ? [[candidate.id, candidate.failure_code]] : [])),
        );
        const failedTurn = this.buildTurn(
          request.conversation_id,
          user,
          action.kind,
          'Mình đã ghi nhận chuyến xe chưa hoàn tất; các dịch vụ độc lập vẫn được giữ nguyên.',
          state,
          [publicItem],
          state.actions,
          [],
          'INTERNAL_ACTION',
        );
        try {
          await this.commitAssistantActionSuccess({
            actorId: user.sub,
            conversationId: request.conversation_id,
            actionId: request.action_id,
            idempotencyKey: executionIdempotencyKey,
            requestHash,
            userMessage: failedTurn.userMessage,
            assistantMessage: failedTurn.assistantMessage,
            stateUpdates: failedTurn.stateUpdates,
            response: failedTurn.response as unknown as Record<string, unknown>,
          });
        } catch {
          throw new AssistantActionCommitFailure();
        }
        return failedTurn.response;
      }
      const status = assistantActionFailureStatus(error);
        if (status === 'FAILED_FINAL') {
          const response = await this.persistFinalActionFailure(
            user,
            request.conversation_id,
            correlationId,
            action,
            task,
            taskBeforeAction,
            state,
            publicFailureCode(error),
          );
          await this.completeAssistantActionExecution(user.sub, request.conversation_id, request.action_id, executionIdempotencyKey, requestHash, status, response as unknown as Record<string, unknown>);
          return response;
        }
        await this.completeAssistantActionExecution(user.sub, request.conversation_id, request.action_id, executionIdempotencyKey, requestHash, status);
      throw error;
    }
  }

  private async persistFinalActionFailure(
    user: AuthUser,
    conversationId: string,
    correlationId: string,
    action: StoredAction,
    task: StoredTask,
    taskBeforeAction: StoredTask,
    state: AssistantState,
    code: string,
  ): Promise<AssistantResponse> {
    Object.assign(task, taskBeforeAction);
    task.phase = 'NEEDS_INFO';
    delete task.failure_code;
    delete task.public_item;

    let nextActions = state.actions.filter((candidate) => candidate.id !== action.id);
    let refreshedOptions: JsonObject | undefined;
    const refreshHealthcare = action.kind === 'select_healthcare_slot'
      && ['APPOINTMENT_EXPIRED', 'SLOT_UNAVAILABLE', 'SLOT_ALREADY_HELD', 'APPOINTMENT_NOT_PAYABLE', 'SELECTION_EXPIRED'].includes(code);
    if (refreshHealthcare) {
      const department = stringValue(task.extracted_slots.department);
      if (department) {
        try {
          const result = await this.healthcare.executeTool({
            tool_name: 'healthcare.list_slots',
            risk_level: 'READ',
            arguments: { department },
            workflow_id: task.workflow_id ?? `wf_${conversationId}_${task.id}`,
            tool_call_id: `call_${randomUUID()}`,
            schema_version: '1',
          }, user.sub, correlationId);
          const doctors = this.resultItems(result).filter((doctor) => arrayValue(doctor.available_slots).some(isRecord));
          task.authoritative = { ...(task.authoritative ?? {}), department, doctors };
          nextActions = nextActions.filter((candidate) => candidate.task_id !== task.id || candidate.kind !== 'select_healthcare_slot');
          nextActions.push(...this.healthcareSelectionActions(doctors, task));
          task.public_item = this.healthcareOptions(doctors, task.id);
          refreshedOptions = task.public_item;
        } catch {
          // Keep the remaining stored choices when a refresh is unavailable;
          // the failed option itself has still been disabled below.
        }
      }
    }
    state.actions = nextActions;
    const message = code === 'SELECTION_EXPIRED' || code === 'STALE_ACTION'
      ? 'Lựa chọn này không còn hiệu lực. Bạn chọn lại trong danh sách hiện tại nhé.'
      : ['APPOINTMENT_EXPIRED', 'SLOT_UNAVAILABLE', 'SLOT_ALREADY_HELD'].includes(code)
        ? 'Khung giờ này không còn trống. Mình đã cập nhật các lựa chọn để bạn chọn lại nhé.'
        : 'Mình chưa thể hoàn tất lựa chọn này. Bạn thử lại với thông tin hiện tại nhé.';
    const item: JsonObject = {
      kind: 'task_error',
      title: 'Lựa chọn không còn khả dụng',
      note: message,
      error_code: code,
      retryable: false,
    };
    state.orchestration = buildOrchestrationSnapshot(
      state.tasks,
      Object.fromEntries(state.tasks.flatMap((candidate) => candidate.failure_code ? [[candidate.id, candidate.failure_code]] : [])),
    );
    const turn = this.buildTurn(
      conversationId,
      user,
      action.kind,
      message,
      state,
      refreshedOptions ? [item, refreshedOptions] : [item],
      state.actions,
      [],
      'INTERNAL_ACTION',
    );
    await this.store.appendConversationTurn({
      conversationId,
      actorId: user.sub,
      userMessage: turn.userMessage,
      assistantMessage: turn.assistantMessage,
      stateUpdates: turn.stateUpdates,
    });
    return turn.response;
  }

  private async acknowledgeHealthcarePayment(
    appointmentId: number,
    actorId: string,
    correlationId: string,
    idempotencyKey: string,
  ): Promise<JsonObject> {
    try {
      return await this.healthcare.acknowledgePayment(appointmentId, actorId, correlationId, idempotencyKey);
    } catch (error: unknown) {
      // A transient response can arrive after Healthcare committed the
      // payment. Re-read the domain resource before treating a later 409 as a
      // second failure; only an active, paid draft is safe to continue.
      if (!(error instanceof ServiceCallError) || error.code !== 'APPOINTMENT_NOT_PAYABLE') throw error;
      const appointment = await this.healthcare.getAppointment(appointmentId, actorId, correlationId);
      if (appointment.status !== 'DRAFT' || appointment.is_paid !== true) throw error;
      return { status: 'success', appointment_id: appointmentId, is_paid: true };
    }
  }

  private async resolveHealthcarePatientId(user: AuthUser, correlationId: string): Promise<number> {
    const patientClient = this.healthcare as HealthcareClient & {
      listPatients?: (actorId: string, requestCorrelationId: string) => Promise<JsonObject>;
    };
    if (typeof patientClient.listPatients !== 'function') return this.healthcare.defaultPatientId;
    const response = await patientClient.listPatients(user.sub, correlationId);
    const patients = isRecord(response) ? arrayValue(response.items).filter(isRecord) : [];
    const selected = patients.find((patient) => patient.is_default === true) ?? patients[0];
    const patientId = numberValue(selected?.id);
    if (patientId === undefined) {
      throw new ServiceUnavailableException({
        code: 'PATIENT_LINK_REQUIRED',
        detail: 'Bạn cần liên kết hồ sơ người bệnh trước khi đặt lịch khám.',
        retryable: false,
      });
    }
    return patientId;
  }

  private async getAssistantActionExecution(actorId: string, conversationId: string, actionId: string): Promise<AssistantActionExecutionRecord | undefined> {
    const store = this.store as unknown as { getAssistantActionExecution?: CoreStore['getAssistantActionExecution'] };
    return typeof store.getAssistantActionExecution === 'function'
      ? store.getAssistantActionExecution(actorId, conversationId, actionId)
      : undefined;
  }

  private async claimAssistantActionExecution(
    actorId: string,
    conversationId: string,
    actionId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<AssistantActionExecutionClaim> {
    const store = this.store as unknown as { claimAssistantActionExecution?: CoreStore['claimAssistantActionExecution'] };
    return typeof store.claimAssistantActionExecution === 'function'
      ? store.claimAssistantActionExecution(actorId, conversationId, actionId, idempotencyKey, requestHash)
      : { state: 'CLAIMED' };
  }

  private async completeAssistantActionExecution(
    actorId: string,
    conversationId: string,
    actionId: string,
    idempotencyKey: string,
    requestHash: string,
    status: 'FAILED_RETRYABLE' | 'FAILED_FINAL',
    response?: Record<string, unknown>,
  ): Promise<void> {
    const store = this.store as unknown as { completeAssistantActionExecution?: CoreStore['completeAssistantActionExecution'] };
    if (typeof store.completeAssistantActionExecution === 'function') {
      await store.completeAssistantActionExecution(actorId, conversationId, actionId, idempotencyKey, requestHash, status, response);
    }
  }

  private async commitAssistantActionSuccess(value: AssistantActionSuccessCommit): Promise<void> {
    await this.store.commitAssistantActionSuccess(value);
  }

  private async hydrateRideAction(
    action: StoredAction,
    task: StoredTask,
    actorId: string,
    correlationId: string,
  ): Promise<void> {
    if (action.kind !== 'ride_service' && action.kind !== 'ride_payment') return;
    const workflowId = action.workflow_id ?? task.workflow_id;
    const hydrate = (this.ride as unknown as {
      hydrateWorkflow?: RideWorkflowService['hydrateWorkflow'];
    }).hydrateWorkflow;
    // Small test doubles and legacy-only callers do not expose the unified
    // hydration capability. The production unified adapter always does.
    if (typeof hydrate !== 'function') return;
    if (!workflowId || (task.workflow_id && task.workflow_id !== workflowId)) {
      throw new ConflictException({ code: 'RIDE_STATE_INVALID', detail: 'Lựa chọn chuyến xe không còn gắn với yêu cầu hiện tại.' });
    }
    const references = rideReferences(task);
    if (!references || (action.kind === 'ride_payment' && !references.bookingId)) {
      throw new ConflictException({ code: 'RIDE_STATE_NOT_DURABLE', detail: 'Thông tin chuyến xe hiện không còn sẵn sàng.' });
    }
    await hydrate.call(this.ride, actorId, workflowId, references, correlationId);
  }

  private async compose(
    userMessage: string,
    conversationId: string,
    userId: string,
    tasks: StoredTask[],
    results: JsonObject[],
    correlationId: string,
    fallback: string,
  ): Promise<string> {
    if (!results.length) return safeText(fallback, 'Mình sẽ tiếp tục cùng bạn nhé.');
    try {
      const response = await this.agent.assistantChat(
        {
          conversation_id: conversationId,
          user_id: userId,
          message: userMessage,
          mode: 'compose',
          conversation_state: { tasks: tasks.map((task) => ({ domain: task.domain, goal: task.goal, phase: task.phase })) },
          authoritative_results: results.map((result) => this.modelSafeItem(result)),
          correlation_id: correlationId,
        },
        correlationId,
      );
      return safeText(response.assistant_message, fallback);
    } catch {
      return safeText(fallback, 'Mình đã cập nhật thông tin cho bạn.');
    }
  }

  private mergeTasks(current: StoredTask[], planned: AgentPlanTask[], latestMessage: string): MergeResult {
    const next = current.map((task) => ({ ...task, extracted_slots: { ...task.extracted_slots } }));
    const touchedIds = new Set<string>();
    const plannedIds: string[] = [];
    for (const candidate of planned.slice(0, 4)) {
      const domain = candidate.domain;
      if (domain !== 'ride' && domain !== 'food' && domain !== 'restaurant' && domain !== 'healthcare') continue;
      const request = stringValue(candidate.normalized_request) ?? '';
      const sameRequest = next.find((task) => task.domain === domain && task.phase !== 'COMPLETED' && (!request || task.normalized_request === request));
      // A new destination or pickup is an update to the active journey, not a
      // second ride request. Other domains retain their request-based merge.
      const activeRide = domain === 'ride'
        ? next.find((task) => task.domain === 'ride' && task.phase !== 'COMPLETED')
        : undefined;
      const match = sameRequest ?? activeRide ?? (planned.length === 1
        ? next.find((task) => task.domain === domain && task.phase !== 'COMPLETED')
        : undefined);
      const slots = sanitizedSlots(candidate.extracted_slots);
      if (match) {
        const nextSlots = { ...match.extracted_slots, ...slots };
        const changed = !sameJson(match.extracted_slots, nextSlots);
        const foodContinuation = domain === 'food' && match.phase !== 'COMPLETED';
        if (changed || foodContinuation) {
          match.revision += 1;
          if (changed) this.resetTaskForRevision(match, nextSlots);
          touchedIds.add(match.id);
          match.extracted_slots = nextSlots;
          match.latest_message = latestMessage;
        }
        match.goal = stringValue(candidate.goal) ?? match.goal;
        match.normalized_request = request || match.normalized_request;
        plannedIds.push(match.id);
        continue;
      }
      const created: StoredTask = {
        id: `task_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
        domain,
        goal: stringValue(candidate.goal) ?? 'Tiếp tục yêu cầu',
        normalized_request: request,
        extracted_slots: slots,
        depends_on: [],
        phase: 'PLANNING',
        revision: 0,
        latest_message: latestMessage,
      };
      next.push(created);
      plannedIds.push(created.id);
      touchedIds.add(created.id);
    }
    for (let index = 0; index < planned.length && index < plannedIds.length; index += 1) {
      const target = next.find((task) => task.id === plannedIds[index]);
      if (!target) continue;
      const dependencies = arrayValue(planned[index].depends_on).map((value) => numberValue(value)).filter((value): value is number => value !== undefined);
      target.depends_on = dependencies.map((dependency) => plannedIds[dependency]).filter((value): value is string => Boolean(value && value !== target.id));
    }
    return { tasks: next, touchedIds };
  }

  private resetTaskForRevision(task: StoredTask, nextSlots: Record<string, unknown>): void {
    task.phase = 'PLANNING';
    task.workflow_id = undefined;
    task.public_item = undefined;
    if (task.domain === 'food') {
      const context = isRecord(task.authoritative?.food_context)
        ? task.authoritative.food_context
        : isRecord(task.authoritative?.state_updates)
          ? task.authoritative.state_updates
          : {};
      task.authoritative = { food_context: context };
      return;
    }
    if (task.domain === 'restaurant') {
      const previousLocation = stringValue(task.extracted_slots.location);
      const nextLocation = stringValue(nextSlots.location);
      const previousCuisine = stringValue(task.extracted_slots.cuisine_query) ?? stringValue(task.extracted_slots.cuisine);
      const nextCuisine = stringValue(nextSlots.cuisine_query) ?? stringValue(nextSlots.cuisine);
      const candidates = previousLocation && nextLocation && previousLocation === nextLocation && previousCuisine === nextCuisine
        ? arrayValue(task.authoritative?.candidates).filter(isRecord)
        : [];
      task.authoritative = candidates.length ? { candidates } : undefined;
      return;
    }
    task.authoritative = undefined;
  }

  private dependenciesReady(task: StoredTask, allTasks: StoredTask[]): boolean {
    for (const dependency of task.depends_on) {
      const prerequisite = allTasks.find((candidate) => candidate.id === dependency);
      const restaurantHeld = prerequisite?.domain === 'restaurant'
        && prerequisite.phase === 'AWAITING_CONFIRMATION'
        && isRecord(prerequisite.authoritative?.selected);
      const healthcareHeld = prerequisite?.domain === 'healthcare'
        && prerequisite.phase === 'AWAITING_CONFIRMATION'
        && isRecord(prerequisite.authoritative?.appointment);
      if (!prerequisite || (prerequisite.phase !== 'COMPLETED' && !restaurantHeld && !healthcareHeld)) return false;
    }
    return true;
  }

  private dependenciesCompleted(task: StoredTask, allTasks: StoredTask[]): boolean {
    return task.depends_on.length > 0 && task.depends_on.every((dependency) => {
      const prerequisite = allTasks.find((candidate) => candidate.id === dependency);
      return prerequisite?.phase === 'COMPLETED';
    });
  }

  private rideActionAllowed(task: StoredTask, allTasks: StoredTask[]): boolean {
    return task.domain !== 'ride' || task.depends_on.length === 0 || this.dependenciesCompleted(task, allTasks);
  }

  private async processTask(
    task: StoredTask,
    allTasks: StoredTask[],
    user: AuthUser,
    conversationId: string,
    correlationId: string,
  ): Promise<TaskProcessResult> {
    if (task.domain === 'restaurant') return this.processRestaurant(task, user, conversationId, correlationId);
    if (task.domain === 'ride') return this.processRide(task, allTasks, user, conversationId, correlationId);
    if (task.domain === 'healthcare') return this.processHealthcare(task, user, conversationId, correlationId);
    return this.processFood(task, user, conversationId, correlationId);
  }

  private async processRestaurant(task: StoredTask, user: AuthUser, conversationId: string, correlationId: string): Promise<TaskProcessResult> {
    const slots = task.extracted_slots;
    const location = stringValue(slots.location);
    const partySize = numberValue(slots.party_size);
    const startAt = stringValue(slots.start_at);
    if (!location || !partySize || !startAt) {
      const missing = [!location ? 'khu vực' : '', !partySize ? 'số người' : '', !startAt ? 'thời gian' : ''].filter(Boolean);
      const question = missing.length === 1 && missing[0] === 'thời gian'
        ? 'Bạn muốn đặt bàn lúc mấy giờ?'
        : `Bạn cho mình biết ${missing.join(' và ')} nhé?`;
      return { phase: 'NEEDS_INFO' as TaskPhase, items: [{ kind: 'clarification', title: 'Mình cần thêm thông tin để đặt bàn', question }] };
    }
    const startAtMilliseconds = Date.parse(startAt);
    if (Number.isFinite(startAtMilliseconds) && startAtMilliseconds <= Date.now()) {
      return {
        phase: 'NEEDS_INFO' as TaskPhase,
        items: [{ kind: 'clarification', title: 'Thời gian này đã qua', question: 'Bạn hãy cho mình một thời gian muộn hơn để tiếp tục đặt bàn nhé?' }],
      };
    }
    const existing = task.authoritative;
    const candidates = arrayValue(existing?.candidates).filter(isRecord);
    const selection = stringValue(slots.selection);
    let selected = isRecord(existing?.selected) ? existing.selected : undefined;
    const requestedIndex = selectionIndexFromText(task.latest_message, candidates);
    if (!selected && selection) selected = candidates[selectionIndex(selection) ?? 0];
    if (!selected && requestedIndex !== undefined) selected = candidates[requestedIndex];
    if (!candidates.length) {
      const cuisineQuery = stringValue(slots.cuisine_query) ?? stringValue(slots.cuisine);
      const result = await this.restaurant.executeTool({
        tool_name: 'restaurant.search',
        risk_level: 'READ',
        arguments: {
          location,
          limit: 20,
          ...(cuisineQuery ? { cuisine_type: cuisineQuery } : {}),
        },
        workflow_id: task.workflow_id ?? `wf_${conversationId}_${task.id}`,
        tool_call_id: `call_${randomUUID()}`,
        schema_version: '1',
      }, user.sub, correlationId);
      let list = this.resultItems(result);
      let cuisineFallback = false;
      if (!list.length && cuisineQuery) {
        const fallback = await this.restaurant.executeTool({
          tool_name: 'restaurant.search',
          risk_level: 'READ',
          arguments: { location, limit: 20 },
          workflow_id: task.workflow_id ?? `wf_${conversationId}_${task.id}`,
          tool_call_id: `call_${randomUUID()}`,
          schema_version: '1',
        }, user.sub, correlationId);
        list = this.resultItems(fallback);
        cuisineFallback = list.length > 0;
      }
      const publicItem = this.restaurantOptions(list);
      if (cuisineFallback) {
        publicItem.note = 'Mình chưa tìm thấy kết quả khớp hoàn toàn với ưu tiên món ăn này; dưới đây là các nhà hàng phù hợp trong khu vực để bạn chọn.';
      }
      const cohortId = this.newCohort(task);
      const selectionActions = list.map((_, index) => this.actionFor(task, 'select_restaurant', { selection_index: index }, cohortId));
      return {
        phase: list.length ? 'NEEDS_INFO' : 'FAILED',
        authoritative: { candidates: list },
        publicItem,
        items: [publicItem],
        actions: selectionActions,
      };
    }
    if (!selected) {
      const publicItem = this.restaurantOptions(candidates);
      const cohortId = this.newCohort(task);
      return {
        phase: 'NEEDS_INFO' as TaskPhase,
        authoritative: existing,
        publicItem,
        items: [publicItem],
        actions: candidates.map((_, index) => this.actionFor(task, 'select_restaurant', { selection_index: index }, cohortId)),
      };
    }
    const restaurantId = stringValue(selected.id);
    if (!restaurantId) throw new BadRequestException({ code: 'RESTAURANT_SELECTION_INVALID', detail: 'Bạn cần chọn một nhà hàng trong danh sách hiện tại.' });
    const availability = await this.restaurant.executeTool({
      tool_name: 'restaurant.check_availability',
      risk_level: 'READ',
      arguments: { restaurant_id: restaurantId, party_size: partySize, start_at: startAt, duration_minutes: 120 },
      workflow_id: task.workflow_id ?? `wf_${conversationId}_${task.id}`,
      tool_call_id: `call_${randomUUID()}`,
      schema_version: '1',
    }, user.sub, correlationId);
    if (!isRecord(availability) || availability.available !== true) {
      const alternatives = candidates.filter((candidate) => candidate.id !== restaurantId);
      const cohortId = this.newCohort(task);
      const publicItem = { kind: 'restaurant_unavailable', title: 'Khung giờ này chưa còn bàn', restaurant: this.publicRestaurant(selected), alternatives: alternatives.map((candidate) => this.publicRestaurant(candidate)) };
      return {
        phase: 'NEEDS_INFO' as TaskPhase,
        authoritative: { ...existing, selected, availability },
        publicItem,
        items: [publicItem],
        actions: alternatives.map((candidate) => this.actionFor(task, 'select_restaurant', { selection_index: candidates.indexOf(candidate) }, cohortId)),
      };
    }
    const hold = await this.restaurant.executeTool({
      tool_name: 'restaurant.create_hold',
      risk_level: 'REVERSIBLE_WRITE',
      arguments: { restaurant_id: restaurantId, party_size: partySize, start_at: startAt, duration_minutes: 120 },
      workflow_id: task.workflow_id ?? `wf_${conversationId}_${task.id}`,
      tool_call_id: `call_${randomUUID()}`,
      schema_version: '1',
      idempotency_key: `assistant:restaurant:hold:${conversationId}:${task.id}:${restaurantId}:${startAt}:${partySize}`,
    }, user.sub, correlationId);
    if (!isRecord(hold) || !stringValue(hold.id)) throw new ConflictException({ code: 'HOLD_NOT_CREATED', detail: 'Mình chưa thể giữ bàn tại nhà hàng này.' });
    const tool: RestaurantTool = {
      tool_name: 'restaurant.create_reservation',
      risk_level: 'FINANCIAL_OR_FINAL',
      arguments: { restaurant_id: restaurantId, party_size: partySize, start_at: startAt, duration_minutes: 120, hold_id: hold.id },
      workflow_id: task.workflow_id ?? `wf_${conversationId}_${task.id}`,
      tool_call_id: `call_${randomUUID()}`,
      schema_version: '1',
      idempotency_key: `assistant:restaurant:reservation:${conversationId}:${task.id}`,
    };
    const pending = await this.confirmations.prepareDomainConfirmation(user, tool, hold, correlationId);
    const publicItem = { kind: 'restaurant_confirmation', title: 'Mình đã tạm giữ bàn', restaurant: this.publicRestaurant(selected), party_size: partySize, start_at: startAt, expires_at: hold.expires_at, note: 'Bạn kiểm tra lại rồi xác nhận để hoàn tất đặt bàn.' };
    const action = this.actionFor(task, 'restaurant_confirm', { confirmation_id: String(pending.id), workflow_id: tool.workflow_id });
    return { phase: 'AWAITING_CONFIRMATION' as TaskPhase, authoritative: { ...existing, selected, availability, hold, pending }, publicItem, items: [publicItem], actions: [action], workflowId: tool.workflow_id };
  }

  private async processRide(task: StoredTask, allTasks: StoredTask[], user: AuthUser, conversationId: string, correlationId: string): Promise<TaskProcessResult> {
    const slots = { ...task.extracted_slots };
    let healthcareFacility: JsonObject | undefined;
    const dependency = task.depends_on.map((id) => allTasks.find((candidate) => candidate.id === id)).find((candidate) => candidate?.domain === 'restaurant');
    const healthcareDependency = task.depends_on
      .map((id) => allTasks.find((candidate) => candidate.id === id))
      .find((candidate) => candidate?.domain === 'healthcare');
    const dependentHealthcareAppointment = healthcareDependency && isRecord(healthcareDependency.authoritative?.appointment)
      ? healthcareDependency.authoritative.appointment
      : undefined;
    if (dependency && !isRecord(dependency.authoritative?.selected)) {
      return { phase: 'IN_PROGRESS' as TaskPhase, items: [{ kind: 'progress', title: 'Mình sẽ tìm chuyến xe sau khi bạn chọn nhà hàng.' }] };
    }
    if (dependency) {
      const selected = dependency.authoritative?.selected;
      const destination = stringValue(selected && isRecord(selected) ? selected.location : undefined);
      if (destination) slots.dropoff_address = destination;
    }
    if (healthcareDependency) {
      if (!dependentHealthcareAppointment) {
        return { phase: 'IN_PROGRESS' as TaskPhase, items: [{ kind: 'progress', title: 'Mình sẽ tìm chuyến xe sau khi có khung giờ khám được giữ.' }] };
      }
      const facility = isRecord(dependentHealthcareAppointment.facility) ? dependentHealthcareAppointment.facility : undefined;
      // A model-proposed destination is never accepted for this dependency.
      // Only the Healthcare response can supply the facility address.
      delete slots.dropoff_address;
      const facilityAddress = stringValue(facility?.address);
      healthcareFacility = facility;
      if (facilityAddress) slots.dropoff_address = facilityAddress;
    }
    const pickup = stringValue(slots.pickup_address);
    const dropoff = stringValue(slots.dropoff_address);
    if (!pickup || !dropoff || dropoff.toLowerCase() === 'nhà hàng đó') {
      if (healthcareDependency) {
        const publicItem = {
          kind: 'ride_timing_conflict',
          title: 'Chưa thể xác định điểm đến chuyến xe',
          note: 'Healthcare chưa trả về địa chỉ cơ sở hợp lệ nên mình chưa tạo báo giá hoặc đặt xe.',
        };
        return { phase: 'FAILED' as TaskPhase, authoritative: { appointment: dependentHealthcareAppointment }, publicItem, items: [publicItem] };
      }
      return { phase: 'NEEDS_INFO' as TaskPhase, items: [{ kind: 'clarification', title: 'Mình cần điểm đón và điểm đến', question: 'Bạn cho mình biết điểm đón và điểm đến cụ thể nhé?' }] };
    }
    // RideConversationService creates a workflow when no id is supplied. Do not
    // manufacture an id here: a generated id would be treated as an existing
    // workflow and fail ownership lookup on the first turn.
    // A ride workflow retains its original quote.  Start a fresh workflow when
    // either endpoint changes so the quote card always reflects the latest
    // location the user supplied in chat.
    const previousQuote = isRecord(task.authoritative?.quote) ? task.authoritative.quote : undefined;
    const routeChanged = Boolean(previousQuote && (
      stringValue(previousQuote.pickup_address) !== pickup
      || stringValue(previousQuote.dropoff_address) !== dropoff
    ));
    const workflowId = routeChanged
      ? undefined
      : task.workflow_id ?? `gw_${conversationId}_${task.id}_${task.revision}`;
    const hydrate = (this.ride as unknown as {
      hydrateWorkflow?: RideWorkflowService['hydrateWorkflow'];
    }).hydrateWorkflow;
    const references = rideReferences(task);
    if (!routeChanged && task.workflow_id && references && typeof hydrate === 'function') {
      await hydrate.call(this.ride, user.sub, task.workflow_id, references, correlationId);
    }
    const request = `Đặt xe từ ${pickup} đến ${dropoff}${slots.vehicle_type === 'BIKE' ? ' bằng xe máy' : slots.vehicle_type === 'CAR_4' ? ' bằng xe 4 chỗ' : slots.vehicle_type === 'CAR_7' ? ' bằng xe 7 chỗ' : ''}`;
    const selectedRestaurant = dependency?.authoritative?.selected;
    const routeContext = this.authoritativeRideRouteContext(
      slots,
      healthcareFacility,
      isRecord(selectedRestaurant) ? selectedRestaurant : undefined,
    );
    const result = routeContext
      ? await this.ride.chat(user.sub, request, workflowId, correlationId, routeContext)
      : await this.ride.chat(user.sub, request, workflowId, correlationId);
    const quote = isRecord(result.quote) ? result.quote : undefined;
    if (healthcareDependency && quote) {
      const heldAppointment = dependentHealthcareAppointment;
      if (!heldAppointment) {
        const publicItem = { kind: 'ride_timing_conflict', title: 'Chưa thể tính giờ khởi hành', note: 'Mình chưa nhận được lịch khám có thẩm quyền nên chưa tạo bước đặt xe.' };
        return { phase: 'FAILED' as TaskPhase, authoritative: rideAuthority(result, { quote }), publicItem, items: [publicItem], workflowId: result.workflow_id };
      }
      const appointmentStart = parseAuthoritativeDate(heldAppointment.start_time ?? (isRecord(heldAppointment.slot) ? heldAppointment.slot.start_time : undefined));
      const durationMinutes = numberValue(quote.duration_minutes);
      if (!appointmentStart || durationMinutes === undefined) {
        const publicItem = {
          kind: 'ride_timing_conflict',
          title: 'Chưa thể tính giờ khởi hành',
          note: 'Mình chưa nhận đủ giờ khám hoặc thời lượng báo giá có thẩm quyền nên chưa tạo bước đặt xe.',
        };
        return { phase: 'FAILED' as TaskPhase, authoritative: rideAuthority(result, { quote, appointment: heldAppointment }), publicItem, items: [publicItem], workflowId: result.workflow_id };
      }
      const recommendedDeparture = new Date(appointmentStart.getTime() - (durationMinutes + HEALTHCARE_RIDE_DEPARTURE_BUFFER_MINUTES) * 60_000);
      if (appointmentStart.getTime() <= Date.now() || recommendedDeparture.getTime() <= Date.now()) {
        const publicItem = {
          kind: 'ride_timing_conflict',
          title: 'Giờ khởi hành không còn khả thi',
          appointment_start_time: appointmentStart.toISOString(),
          recommended_departure: recommendedDeparture.toISOString(),
          note: `Giờ nên rời đi đã qua hoặc không đủ thời gian đến lịch khám. Mình chưa đặt hoặc hủy chuyến xe; bạn hãy chọn lại lịch khám hoặc điểm đón.`,
        };
        return { phase: 'FAILED' as TaskPhase, authoritative: rideAuthority(result, { quote, appointment: heldAppointment, recommended_departure: recommendedDeparture.toISOString() }), publicItem, items: [publicItem], workflowId: result.workflow_id };
      }
      const timing = {
        appointment_start_time: appointmentStart.toISOString(),
        recommended_departure: recommendedDeparture.toISOString(),
        departure_buffer_minutes: HEALTHCARE_RIDE_DEPARTURE_BUFFER_MINUTES,
        scheduled_pickup: false,
        schedule_note: 'Đây là giờ khởi hành đề xuất; X-One chưa đặt lịch đón tự động.',
      };
      const publicItem = { ...this.rideItem({ quote }, task), duration_minutes: durationMinutes, ...timing };
      if (result.stage === 'SERVICE_CONFIRMATION') {
        if (!this.dependenciesCompleted(task, allTasks)) {
          return { phase: 'IN_PROGRESS' as TaskPhase, authoritative: rideAuthority(result, { quote, appointment: heldAppointment, ...timing }), publicItem, items: [publicItem], workflowId: result.workflow_id };
        }
        const action = this.actionFor(task, 'ride_service', { workflow_id: result.workflow_id });
        return { phase: 'AWAITING_CONFIRMATION' as TaskPhase, authoritative: rideAuthority(result, { quote, appointment: heldAppointment, ...timing }), publicItem, items: [publicItem], actions: [action], workflowId: result.workflow_id };
      }
      return { phase: 'IN_PROGRESS' as TaskPhase, authoritative: rideAuthority(result, { quote, appointment: heldAppointment, ...timing }), publicItem, items: [publicItem], workflowId: result.workflow_id };
    }
    const publicItem = quote ? this.rideItem({ quote }, task) : { kind: 'progress', title: safeText(result.response, 'Mình đang tìm chuyến xe phù hợp.') };
    if (result.stage === 'SERVICE_CONFIRMATION' && quote) {
      if (task.depends_on.length > 0 && !this.dependenciesCompleted(task, allTasks)) {
        return { phase: 'IN_PROGRESS' as TaskPhase, authoritative: rideAuthority(result, { quote }), publicItem, items: [publicItem], workflowId: result.workflow_id };
      }
      const action = this.actionFor(task, 'ride_service', { workflow_id: result.workflow_id });
        return { phase: 'AWAITING_CONFIRMATION' as TaskPhase, authoritative: rideAuthority(result, { quote }), publicItem, items: [publicItem], actions: [action], workflowId: result.workflow_id };
    }
    return { phase: 'IN_PROGRESS' as TaskPhase, authoritative: rideAuthority(result, { quote }), publicItem, items: [publicItem], workflowId: result.workflow_id };
  }

  private async processHealthcare(task: StoredTask, user: AuthUser, conversationId: string, correlationId: string): Promise<TaskProcessResult> {
    const slots = task.extracted_slots;
    const workflowId = task.workflow_id ?? `wf_${conversationId}_${task.id}`;
    const department = stringValue(slots.department);
    if (!department) {
      const result = await this.healthcare.executeTool({ tool_name: 'healthcare.list_departments', risk_level: 'READ', arguments: {}, workflow_id: workflowId, tool_call_id: `call_${randomUUID()}`, schema_version: '1' }, user.sub, correlationId);
      const departments = this.resultItems(result);
      const publicItem = { kind: 'healthcare_options', title: 'Bạn có thể chọn khoa phù hợp', departments: departments.map((item) => ({ name: item.name, description: item.description })) };
      return { phase: 'NEEDS_INFO' as TaskPhase, authoritative: { departments }, publicItem, items: [publicItem], workflowId };
    }
    const existing = task.authoritative;
    const doctors = arrayValue(existing?.doctors).filter(isRecord);
    if (!doctors.length || existing?.department !== department) {
      const result = await this.healthcare.executeTool({ tool_name: 'healthcare.list_slots', risk_level: 'READ', arguments: { department }, workflow_id: workflowId, tool_call_id: `call_${randomUUID()}`, schema_version: '1' }, user.sub, correlationId);
      const availableDoctors = this.resultItems(result).filter((doctor) => arrayValue(doctor.available_slots).some(isRecord));
      const requestedDoctors = filterDoctorsByRequestedTime(availableDoctors, slots);
      const requestedStart = parseAuthoritativeDate(slots.start_at);
      const exactRequested = hasExactHealthcareSlot(requestedDoctors, requestedStart);
      const doctorsForSelection = requestedDoctors.length ? requestedDoctors : availableDoctors;
      const publicItem = requestedDoctors.length && (!requestedStart || exactRequested)
        ? this.healthcareOptions(requestedDoctors, task.id)
        : {
          kind: 'healthcare_no_availability',
          title: requestedStart ? 'Giờ khám chính xác chưa còn lịch' : 'Khung giờ bạn muốn hiện chưa còn lịch',
          note: requestedStart
            ? 'Mình không tự đổi giờ bạn yêu cầu. Dưới đây là các giờ gần nhất còn trống để bạn chọn nếu phù hợp.'
            : 'Mình chưa thấy lịch đúng buổi bạn muốn. Dưới đây là các giờ thật còn trống để bạn chọn.',
          options: this.healthcareOptionRows(doctorsForSelection),
        };
      if (publicItem.kind === 'healthcare_no_availability') {
        publicItem.note = 'Khung giờ hiển thị là lịch mô phỏng để bạn thử luồng đặt lịch; hãy xác nhận lại với cơ sở trước khi đến.';
      }
      const selectionActions = this.healthcareSelectionActions(doctorsForSelection, task);
      return {
        phase: doctorsForSelection.length ? 'NEEDS_INFO' as TaskPhase : 'FAILED' as TaskPhase,
        authoritative: { department, doctors: doctorsForSelection, requested_start_at: slots.start_at, time_preference: slots.time_preference, matching_mode: requestedStart ? (exactRequested ? 'exact' : 'nearest') : (slots.time_preference ? 'daypart' : 'available') },
        publicItem,
        items: [publicItem],
        actions: selectionActions,
        workflowId,
      };
    }
    const selection = stringValue(slots.selection);
    const selectedDoctorIndex = numberValue(existing?.selected_doctor_index);
    const index = selectedDoctorIndex !== undefined && Number.isInteger(selectedDoctorIndex)
      ? selectedDoctorIndex
      : selectionIndex(selection) ?? selectionIndexFromText(task.latest_message, doctors) ?? 0;
    const candidate = doctors[index];
    const selectedSlotFromAction = isRecord(existing?.selectedSlot) ? existing.selectedSlot : undefined;
    const slot = selectedSlotFromAction ?? arrayValue(candidate?.available_slots).filter(isRecord)[0];
    const selectedSlot = isRecord(slot) ? slot : undefined;
    if (!selectedSlot || numberValue(selectedSlot.id) === undefined) {
      return { phase: 'NEEDS_INFO' as TaskPhase, authoritative: existing, publicItem: this.healthcareOptions(doctors, task.id), items: [this.healthcareOptions(doctors, task.id)], actions: this.healthcareSelectionActions(doctors, task), workflowId };
    }
    const patientId = await this.resolveHealthcarePatientId(user, correlationId);
    const appointment = await this.healthcare.executeTool({
      tool_name: 'healthcare.hold_slot',
      risk_level: 'REVERSIBLE_WRITE',
      arguments: { slot_id: selectedSlot.id, patient_id: patientId, symptoms: stringValue(slots.symptoms) ?? 'Nhu cầu đặt lịch khám' },
      workflow_id: workflowId,
      tool_call_id: `call_${randomUUID()}`,
      schema_version: '1',
      idempotency_key: `assistant:healthcare:hold:${conversationId}:${task.id}:${String(selectedSlot.id)}`,
    }, user.sub, correlationId);
    const appointmentId = numberValue(isRecord(appointment) ? appointment.appointment_id : undefined);
    if (!appointmentId) throw new ConflictException({ code: 'APPOINTMENT_NOT_CREATED', detail: 'Mình chưa thể giữ khung giờ khám này.' });
    const publicItem = { kind: 'appointment', title: 'Mình đã tạm giữ khung giờ', resource_id: appointmentId, doctor: isRecord(appointment) ? appointment.doctor_name : undefined, department: isRecord(appointment) ? appointment.department : department, start_time: isRecord(appointment) ? appointment.start_time : undefined, price: isRecord(appointment) ? appointment.price : undefined, facility: isRecord(appointment) && isRecord(appointment.facility) ? appointment.facility : undefined, note: 'Bạn xác nhận thanh toán trước khi hoàn tất lịch khám.' };
    const action = this.actionFor(task, 'healthcare_payment', { appointment_id: appointmentId, workflow_id: workflowId });
    return { phase: 'AWAITING_CONFIRMATION' as TaskPhase, authoritative: { department, doctors, selectedSlot, appointment }, publicItem, items: [publicItem], actions: [action], workflowId };
  }

  private async processFood(task: StoredTask, user: AuthUser, conversationId: string, correlationId: string): Promise<TaskProcessResult> {
    const storedContext = isRecord(task.authoritative?.food_context)
      ? task.authoritative.food_context
      : isRecord(task.authoritative?.state_updates)
        ? task.authoritative.state_updates
        : {};
    const storedCandidates = arrayValue(storedContext.menu_item_candidates ?? storedContext.item_candidates).filter(isRecord);
    const selectedIndex = foodSelectionIndex(task.latest_message ?? '', storedCandidates);
    const selectedCandidate = selectedIndex !== undefined
      ? storedCandidates[selectedIndex]
      : storedCandidates.find((candidate) => candidate.id === storedContext.menu_item_id);
    const previousContext = selectedIndex === undefined
      ? storedContext
      : (() => {
        return {
          ...storedContext,
          menu_item_id: selectedCandidate?.id,
          restaurant_id: selectedCandidate?.restaurant_id ?? storedContext.restaurant_id,
        };
      })();
    const message = selectedIndex === undefined ? task.latest_message ?? task.normalized_request : 'Thêm 1 món đã chọn vào giỏ';
    const response = await this.agent.chat({ conversation_id: conversationId, user_id: user.sub, message, workflow_context: previousContext, correlation_id: correlationId }, correlationId);
    const stateUpdates = isRecord(response.state_updates) ? response.state_updates : {};
    const pending = isRecord(response.pending_confirmation) ? response.pending_confirmation : undefined;
    const data = isRecord(response.data) ? response.data : {};
    const returnedCart = isRecord(data.cart) ? data.cart : undefined;
    const responseCartItems = arrayValue(returnedCart?.items ?? data.items).filter(isRecord);
    const returnedCartItems = arrayValue(returnedCart?.items ?? stateUpdates.cart_items).filter(isRecord);
    const returnedCartId = stringValue(stateUpdates.cart_id) ?? stringValue(returnedCart?.id);
    const nextContext = {
      ...previousContext,
      ...stateUpdates,
      ...(selectedCandidate?.id ? {
        menu_item_id: selectedCandidate.id,
        ...(selectedCandidate.restaurant_id ? { restaurant_id: selectedCandidate.restaurant_id } : {}),
      } : {}),
      ...(returnedCartId ? { cart_id: returnedCartId } : {}),
      ...(returnedCartItems.length ? { cart_items: returnedCartItems } : {}),
    };
    let foodData = isRecord(data) ? this.foodData(data) : {};
    const cartUpdated = selectedCandidate !== undefined && Boolean(nextContext.cart_id) && responseCartItems.length > 0;
    if (!arrayValue(foodData.options).length && selectedCandidate) {
      const selectedRestaurant = arrayValue(storedContext.restaurant_candidates).find(
        (candidate): candidate is JsonObject => isRecord(candidate) && candidate.id === selectedCandidate.restaurant_id,
      );
      foodData = {
        ...foodData,
        options: [this.foodCandidateDisplay(selectedCandidate, selectedRestaurant)],
      };
    }
    const publicItem: JsonObject = {
      kind: pending ? 'food_confirmation' : arrayValue(foodData.options).length ? 'food_options' : 'food_empty',
      title: pending ? 'Đơn hàng đã sẵn sàng' : cartUpdated ? 'Món đã thêm vào giỏ' : arrayValue(foodData.options).length ? 'Món ăn phù hợp' : 'Chưa tìm thấy món phù hợp',
      ...foodData,
      ...(cartUpdated ? { note: 'Món đã được thêm vào giỏ. Bạn có thể tiếp tục thêm món hoặc mở giỏ để xem bước tiếp theo.' } : {}),
      ...(!pending && !cartUpdated && !arrayValue(foodData.options).length ? { note: safeText(response.message, 'Hiện chưa có món phù hợp để chọn.') } : {}),
    };
    const optionActions = !pending
      ? [
        ...(cartUpdated ? [] : (() => {
          const cohortId = this.newCohort(task);
          return arrayValue(foodData.options).map((_, index) => this.actionFor(task, 'select_food_item', { selection_index: index }, cohortId));
        })()),
        ...this.foodCartActions(task, nextContext),
      ]
      : [];
    if (pending?.id) {
      const action = this.actionFor(task, 'food_confirm', { confirmation_id: String(pending.id) });
      return { phase: 'AWAITING_CONFIRMATION' as TaskPhase, authoritative: { response, state_updates: nextContext, food_context: nextContext, pending }, publicItem, items: [publicItem], actions: [action] };
    }
    return { phase: response.response_type === 'error' ? 'FAILED' as TaskPhase : 'IN_PROGRESS' as TaskPhase, authoritative: { response, state_updates: nextContext, food_context: nextContext }, publicItem, items: [publicItem], actions: optionActions };
  }

  private foodCartActions(task: StoredTask, context: JsonObject): StoredAction[] {
    const cartId = stringValue(context.cart_id);
    if (!cartId) return [];
    const items = arrayValue(context.cart_items).filter(isRecord);
    if (!items.length) return [];
    const cohortId = this.newCohort(task);
    const actions: StoredAction[] = [];
    for (const item of items) {
      const cartItemId = stringValue(item.id ?? item.cart_item_id);
      if (!cartItemId) continue;
      const quantity = numberValue(item.quantity) ?? 1;
      actions.push(this.actionFor(task, 'food_cart_increment', { cart_id: cartId, cart_item_id: cartItemId, quantity: Math.min(50, quantity + 1) }, cohortId));
      if (quantity > 1) actions.push(this.actionFor(task, 'food_cart_decrement', { cart_id: cartId, cart_item_id: cartItemId, quantity: quantity - 1 }, cohortId));
      actions.push(this.actionFor(task, 'food_cart_remove', { cart_id: cartId, cart_item_id: cartItemId }, cohortId));
    }
    actions.push(this.actionFor(task, 'food_checkout', { cart_id: cartId }, cohortId));
    return actions;
  }

  private async executeFoodCartAction(
    action: StoredAction,
    task: StoredTask,
    user: AuthUser,
    correlationId: string,
    idempotencyKey: string,
  ): Promise<{ phase: TaskPhase; message: string; publicItem?: JsonObject; authoritative?: JsonObject; nextActions?: StoredAction[] }> {
    const foodContext = isRecord(task.authoritative?.food_context) ? task.authoritative.food_context : {};
    const cartId = action.cart_id ?? stringValue(foodContext.cart_id);
    if (!this.food || !cartId) throw new ConflictException({ code: 'FOOD_CART_ACTION_UNAVAILABLE', detail: 'The food cart is not ready for an update.' });

    const cart = await this.food.getCart(user.sub, correlationId, cartId);
    const cartItems = arrayValue(cart.items).filter(isRecord);
    const currentItem = cartItems.find((item) => stringValue(item.id ?? item.cart_item_id) === action.cart_item_id);
    if (!currentItem) throw new ConflictException({ code: 'CART_CHANGED', detail: 'The food cart changed. Please choose from the refreshed options.' });

    let nextCart: JsonObject;
    if (action.kind === 'food_cart_remove') {
      nextCart = await this.food.removeCartItem(user.sub, correlationId, cartId, action.cart_item_id ?? '', idempotencyKey);
    } else {
      const currentQuantity = numberValue(currentItem.quantity) ?? 1;
      const delta = action.kind === 'food_cart_increment' ? 1 : -1;
      const quantity = Math.max(1, Math.min(50, currentQuantity + delta));
      nextCart = await this.food.updateCartItem(user.sub, correlationId, cartId, action.cart_item_id ?? '', { quantity }, idempotencyKey);
    }
    const refreshedCart = arrayValue(nextCart.items).length ? nextCart : await this.food.getCart(user.sub, correlationId, cartId);
    const context = {
      ...foodContext,
      cart_id: cartId,
      cart_items: arrayValue(refreshedCart.items).filter(isRecord),
    };
    const publicItem = { kind: 'food_cart', title: 'Food cart updated', cart: refreshedCart };
    const authoritative = { ...(task.authoritative ?? {}), food_context: context, state_updates: context };
    return {
      phase: 'IN_PROGRESS',
      message: 'The food cart was updated.',
      publicItem,
      authoritative,
      nextActions: this.foodCartActions(task, context),
    };
  }

  private async executeAction(action: StoredAction, task: StoredTask, user: AuthUser, conversationId: string, correlationId: string, idempotencyKey: string): Promise<{ phase: TaskPhase; message: string; publicItem?: JsonObject; authoritative?: JsonObject; nextAction?: StoredAction; nextActions?: StoredAction[] }> {
    if (action.kind === 'select_restaurant') {
      const candidates = arrayValue(task.authoritative?.candidates).filter(isRecord);
      const selected = candidates[action.selection_index ?? 0];
      if (!selected) throw new ConflictException({ code: 'SELECTION_EXPIRED', detail: 'Danh sách nhà hàng đã thay đổi. Bạn chọn lại trong danh sách hiện tại nhé.' });
      task.extracted_slots.selection = selectionName(action.selection_index ?? 0);
      task.authoritative = { ...task.authoritative, selected };
      task.phase = 'IN_PROGRESS';
      const result = await this.processRestaurant(task, user, conversationId, correlationId);
      return { phase: result.phase, message: result.phase === 'AWAITING_CONFIRMATION' ? 'Mình đã tạm giữ bàn. Bạn kiểm tra lại rồi xác nhận nhé.' : 'Mình đã cập nhật lựa chọn nhà hàng.', publicItem: result.publicItem, authoritative: result.authoritative, nextAction: result.actions?.[0] };
    }
    if (action.kind === 'restaurant_confirm') {
      const result = await this.confirmations.executeDomain(action.confirmation_id ?? '', user, { workflow_id: action.workflow_id }, correlationId, idempotencyKey, 'CREATE_RESTAURANT_RESERVATION', action.workflow_id);
      const reservation = isRecord(result.reservation) ? result.reservation : result;
      const selected = isRecord(task.authoritative?.selected) ? task.authoritative.selected : undefined;
      const restaurantName = stringValue(reservation.restaurant_name) ?? stringValue(selected?.name);
      if (!restaurantName) throw new ConflictException({ code: 'RESERVATION_RESULT_INVALID', detail: 'Mình chưa nhận được tên nhà hàng trong kết quả đặt bàn.' });
      const restaurantLocation = stringValue(reservation.restaurant_location) ?? stringValue(selected?.location);
      const publicItem = {
        kind: 'reservation',
        title: 'Đặt bàn đã hoàn tất',
        ...(stringValue(reservation.id) ? { resource_id: reservation.id } : {}),
        restaurant: { name: restaurantName, ...(restaurantLocation ? { location: restaurantLocation } : {}) },
        reservation_code: stringValue(reservation.reservation_code),
        start_at: reservation.start_at,
        party_size: reservation.party_size,
        status: 'CONFIRMED',
      };
      return { phase: 'COMPLETED', message: 'Đã đặt bàn thành công. Mình sẽ giữ thông tin này trong cuộc trò chuyện.', publicItem, authoritative: { ...task.authoritative, reservation: result } };
    }
    if (action.kind === 'ride_service') {
      const result = await this.ride.confirmService(user.sub, action.workflow_id ?? task.workflow_id ?? '', correlationId);
      const publicItem = this.rideItem(result, task);
      const next = result.stage === 'PAYMENT_CONFIRMATION' ? this.actionFor(task, 'ride_payment', { workflow_id: result.workflow_id }) : undefined;
      const bookingStatus = stringValue(result.booking?.status);
      const phase = next
        ? 'AWAITING_CONFIRMATION'
        : isTerminalRideBookingStatus(bookingStatus) ? 'COMPLETED' : 'IN_PROGRESS';
      return { phase, message: next ? 'Thông tin chuyến đã được xác nhận. Bạn xác nhận thanh toán để hoàn tất nhé.' : 'Chuyến xe đã được cập nhật.', publicItem, authoritative: rideAuthority(result), nextAction: next };
    }
    if (action.kind === 'ride_payment') {
      const result = await this.ride.confirmPayment(user.sub, action.workflow_id ?? task.workflow_id ?? '', correlationId);
      const status = stringValue(result.booking?.status) ?? 'UNKNOWN';
      const message = status === 'NO_DRIVER'
        ? 'Hiện chưa tìm được tài xế phù hợp cho chuyến này.'
        : status === 'COMPLETED'
          ? 'Chuyến xe đã hoàn tất và thanh toán đã được ghi nhận.'
          : 'Thanh toán đã được ghi nhận và chuyến xe đã được cập nhật.';
      return { phase: isTerminalRideBookingStatus(status) ? 'COMPLETED' : 'IN_PROGRESS', message, publicItem: this.rideItem(result, task), authoritative: rideAuthority(result) };
    }
    if (action.kind === 'select_healthcare_slot') {
      const doctors = arrayValue(task.authoritative?.doctors).filter(isRecord);
      const doctorIndex = action.doctor_index ?? action.selection_index ?? 0;
      const candidate = doctors[doctorIndex];
      if (!candidate) throw new ConflictException({ code: 'SELECTION_EXPIRED', detail: 'Lịch khám này không còn hiệu lực. Bạn chọn lại trong danh sách hiện tại nhé.' });
      const exactSlot = action.slot_id === undefined
        ? undefined
        : arrayValue(candidate.available_slots).find((slot) => isRecord(slot) && numberValue(slot.id) === action.slot_id);
      if (action.slot_id !== undefined && !exactSlot) throw new ConflictException({ code: 'SELECTION_EXPIRED', detail: 'Healthcare slot is no longer available.' });
      task.extracted_slots.selection = selectionName(doctorIndex);
      task.authoritative = { ...task.authoritative, selected_doctor_index: doctorIndex, ...(isRecord(exactSlot) ? { selectedSlot: exactSlot } : {}) };
      const result = await this.processHealthcare(task, user, conversationId, correlationId);
      return { phase: result.phase, message: result.phase === 'AWAITING_CONFIRMATION' ? 'Mình đã tạm giữ khung giờ. Bạn xác nhận thanh toán để tiếp tục nhé.' : 'Mình đã cập nhật lịch khám.', publicItem: result.publicItem, authoritative: result.authoritative, nextAction: result.actions?.[0] };
    }
    if (action.kind === 'healthcare_payment') {
      const appointmentId = action.appointment_id;
      if (!appointmentId) throw new ConflictException({ code: 'APPOINTMENT_NOT_FOUND', detail: 'Lịch khám này không còn sẵn sàng.' });
      const payment = await this.acknowledgeHealthcarePayment(appointmentId, user.sub, correlationId, idempotencyKey);
      const tool = {
        tool_name: 'healthcare.confirm_appointment' as const,
        risk_level: 'FINANCIAL_OR_FINAL' as const,
        arguments: { appointment_id: appointmentId },
        workflow_id: action.workflow_id ?? task.workflow_id ?? `wf_${conversationId}_${task.id}`,
        tool_call_id: `call_${randomUUID()}`,
        schema_version: '1',
        idempotency_key: `assistant:healthcare:confirm:${conversationId}:${task.id}`,
      };
      const pending = await this.confirmations.prepareDomainConfirmation(user, tool, undefined, correlationId);
      const publicItem = { kind: 'healthcare_confirmation', title: 'Lịch khám đã sẵn sàng', resource_id: appointmentId, appointment_id: appointmentId, payment_note: 'Thanh toán đã được ghi nhận. Bạn xác nhận lần cuối để hoàn tất.', doctor: task.authoritative?.appointment && isRecord(task.authoritative.appointment) ? task.authoritative.appointment.doctor_name : undefined };
      return { phase: 'AWAITING_CONFIRMATION', message: 'Thanh toán đã được ghi nhận. Bạn xác nhận lần cuối để hoàn tất lịch khám nhé.', publicItem, authoritative: { ...task.authoritative, payment, pending }, nextAction: this.actionFor(task, 'healthcare_confirm', { confirmation_id: String(pending.id), workflow_id: tool.workflow_id }) };
    }
    if (action.kind === 'healthcare_confirm') {
      const result = await this.confirmations.executeDomain(action.confirmation_id ?? '', user, { workflow_id: action.workflow_id }, correlationId, idempotencyKey, 'CONFIRM_HEALTHCARE_APPOINTMENT', action.workflow_id);
      const toolResult = isRecord(result.tool_result) ? result.tool_result : undefined;
      const toolData = toolResult && isRecord(toolResult.data) ? toolResult.data : toolResult;
      const appointment = toolData && isRecord(toolData.appointment)
        ? toolData.appointment
        : isRecord(result.appointment)
          ? result.appointment
          : undefined;
      const status = stringValue(appointment?.status);
      if (!appointment || !status) throw new ConflictException({ code: 'HEALTHCARE_RESULT_INVALID', detail: 'Mình chưa nhận được thông tin lịch khám hoàn tất.' });
      return { phase: 'COMPLETED', message: 'Lịch khám đã được xác nhận thành công.', publicItem: { kind: 'appointment_confirmed', title: 'Lịch khám đã hoàn tất', resource_id: appointment.appointment_id, status, appointment } as JsonObject, authoritative: { ...task.authoritative, result } };
    }
    if (action.kind === 'food_cart_increment' || action.kind === 'food_cart_decrement' || action.kind === 'food_cart_remove') {
      return this.executeFoodCartAction(action, task, user, correlationId, idempotencyKey);
    }
    if (action.kind === 'food_checkout') {
      task.latest_message = 'Mở giỏ hàng và chuẩn bị đặt món';
      const result = await this.processFood(task, user, conversationId, correlationId);
      return {
        phase: result.phase,
        message: result.phase === 'AWAITING_CONFIRMATION' ? 'Mình đã chuẩn bị đơn món. Bạn kiểm tra rồi xác nhận nhé.' : 'Mình đã cập nhật giỏ hàng và thông tin đặt món.',
        publicItem: result.publicItem,
        authoritative: result.authoritative,
        nextActions: result.actions,
      };
    }
    if (action.kind === 'select_food_item') {
      const context = isRecord(task.authoritative?.food_context)
        ? task.authoritative.food_context
        : isRecord(task.authoritative?.state_updates)
          ? task.authoritative.state_updates
          : {};
      const candidates = arrayValue(context.menu_item_candidates ?? context.item_candidates).filter(isRecord);
      const selected = candidates[action.selection_index ?? 0];
      if (!selected || typeof selected.id !== 'string') throw new ConflictException({ code: 'STALE_ACTION', detail: 'Món này không còn trong danh sách hiện tại. Bạn chọn lại nhé.', retryable: false });
      task.authoritative = { ...task.authoritative, food_context: { ...context, menu_item_id: selected.id, restaurant_id: selected.restaurant_id ?? context.restaurant_id } };
      task.latest_message = 'Thêm 1 món đã chọn vào giỏ';
      const result = await this.processFood(task, user, conversationId, correlationId);
      if (result.actions?.length) {
        return { phase: result.phase, message: 'Mình đã cập nhật giỏ hàng.', publicItem: result.publicItem, authoritative: result.authoritative, nextActions: result.actions };
      }
      return { phase: result.phase, message: result.phase === 'AWAITING_CONFIRMATION' ? 'Mình đã chuẩn bị đơn món đã chọn. Bạn kiểm tra rồi xác nhận nhé.' : 'Mình đã chọn món và cập nhật giỏ hàng.', publicItem: result.publicItem, authoritative: result.authoritative, nextAction: result.actions?.[0] };
    }
    if (action.kind === 'food_confirm') {
      const result = await this.confirmations.execute(action.confirmation_id ?? '', user, { payment_method: 'card', conversation_id: conversationId }, correlationId, idempotencyKey);
      const payment = isRecord(result.payment) ? result.payment : undefined;
      const order = isRecord(result.order) ? result.order : undefined;
      return { phase: 'COMPLETED', message: 'Đơn đồ ăn đã được tiếp nhận thành công.', publicItem: { kind: 'food_order', title: 'Đơn đồ ăn đã được tiếp nhận', ...(order?.id ? { resource_id: order.id } : {}), order: result.order, ...(payment ? { payment } : {}) }, authoritative: { result } };
    }
    throw new ConflictException({ code: 'ACTION_NOT_AVAILABLE', detail: 'Lựa chọn này không còn hiệu lực.' });
  }

  private buildTurn(
    conversationId: string,
    _user: AuthUser,
    userMessage: string,
    message: string,
    state: AssistantState,
    items: JsonObject[] = [],
    actions: StoredAction[] = [],
    completed: JsonObject[] = [],
    messageKind: ConversationMessageKind = 'USER',
  ): {
    response: AssistantResponse;
    userMessage: AssistantActionSuccessCommit['userMessage'];
    assistantMessage: AssistantActionSuccessCommit['assistantMessage'];
    stateUpdates: Record<string, unknown>;
  } {
    const safeMessage = safeText(message, 'Mình đã cập nhật thông tin cho bạn.');
    const now = new Date().toISOString();
    const orchestration = state.orchestration ?? buildOrchestrationSnapshot(state.tasks);
    const response: AssistantResponse = {
        conversation_id: conversationId,
        message: safeMessage,
        items: items.map((item) => this.sanitizeConsumerItem(item)),
        actions: actions.map((action) => this.publicAction(action)),
        completed: completed.map((item) => this.sanitizeConsumerItem(item)),
        workflow_status: orchestration.status,
    };
    return {
      response,
      userMessage: { role: 'user', content: messageKind === 'INTERNAL_ACTION' ? `action:${userMessage}` : userMessage, kind: messageKind, visibility: messageKind === 'INTERNAL_ACTION' ? 'INTERNAL' : 'USER_VISIBLE', createdAt: now },
      assistantMessage: { role: 'assistant', content: safeMessage, kind: 'ASSISTANT', visibility: 'USER_VISIBLE', createdAt: now, data: response as unknown as Record<string, unknown> },
      stateUpdates: { ...state, actions, orchestration } as unknown as Record<string, unknown>,
    };
  }

  private async persistTurn(
    conversationId: string,
    user: AuthUser,
    userMessage: string,
    message: string,
    state: AssistantState,
    items: JsonObject[] = [],
    actions: StoredAction[] = [],
    completed: JsonObject[] = [],
  ): Promise<AssistantResponse> {
    const safeMessage = safeText(message, 'Mình đã cập nhật thông tin cho bạn.');
    const orchestration = state.orchestration ?? buildOrchestrationSnapshot(state.tasks);
    const finalState = { ...state, actions, orchestration };
    const response: AssistantResponse = {
      conversation_id: conversationId,
      message: safeMessage,
      items: items.map((item) => this.sanitizeConsumerItem(item)),
      actions: actions.map((action) => this.publicAction(action)),
      completed: completed.map((item) => this.sanitizeConsumerItem(item)),
      workflow_status: orchestration.status,
    };
    await this.store.appendConversationTurn({
      conversationId,
      actorId: user.sub,
      userMessage: { role: 'user', content: userMessage, kind: 'USER', visibility: 'USER_VISIBLE', createdAt: new Date().toISOString() },
      assistantMessage: { role: 'assistant', content: safeMessage, kind: 'ASSISTANT', visibility: 'USER_VISIBLE', createdAt: new Date().toISOString(), data: response as unknown as Record<string, unknown> },
      stateUpdates: finalState as unknown as Record<string, unknown>,
    });
    return response;
  }

  private messageFor(message: string, plan: JsonObject, tasks: StoredTask[], items: JsonObject[], actions: StoredAction[]): string {
    const clarification = stringValue(plan.clarification_question);
    if (clarification) return clarification;
    if (!items.length && !actions.length) return safeText(stringValue(plan.assistant_message), 'Mình sẽ tiếp tục cùng bạn nhé.');
    if (actions.length) return tasks.length > 1 ? 'Mình đã chuẩn bị các bước tiếp theo cho những việc bạn yêu cầu. Bạn kiểm tra rồi xác nhận từng bước nhé.' : 'Mình đã chuẩn bị xong. Bạn kiểm tra lại rồi xác nhận nhé.';
    return message.trim() ? 'Mình đã tìm được thông tin phù hợp cho bạn.' : 'Mình đã cập nhật thông tin cho bạn.';
  }

  private actionFor(task: StoredTask, kind: ActionKind, values: Partial<StoredAction>, cohortId?: string): StoredAction {
    return this.action(kind, task.id, { ...values, task_revision: task.revision }, cohortId);
  }

  private newCohort(task: StoredTask): string {
    return `cohort_${task.id}_${task.revision}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  }

  private action(kind: ActionKind, taskId: string, values: Partial<StoredAction>, cohortId?: string): StoredAction {
    const revision = integerValue(values.task_revision);
    return {
      id: `act_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
      kind,
      task_id: taskId,
      task_revision: revision,
      cohort_id: stringValue(values.cohort_id) ?? cohortId ?? `cohort_${taskId}_${revision}`,
      ...values,
    };
  }

  private publicAction(action: StoredAction): { id: string; kind: ActionKind; label: string } {
    const labels: Record<ActionKind, string> = {
      select_restaurant: 'Chọn nhà hàng này',
      restaurant_confirm: 'Xác nhận đặt bàn',
      ride_service: 'Xác nhận chuyến xe',
      ride_payment: 'Xác nhận thanh toán',
      select_healthcare_slot: 'Chọn lịch này',
      healthcare_payment: 'Xác nhận thanh toán',
      healthcare_confirm: 'Xác nhận lịch khám',
      select_food_item: 'Chọn món này',
      food_cart_increment: 'Tăng món',
      food_cart_decrement: 'Giảm món',
      food_cart_remove: 'Xóa món',
      food_checkout: 'Thanh toán',
      food_confirm: 'Xác nhận đặt món',
    };
    return { id: action.id, kind: action.kind, label: labels[action.kind] };
  }

  private restaurantOptions(candidates: JsonObject[]): JsonObject {
    return { kind: 'restaurant_options', title: 'Nhà hàng phù hợp', options: candidates.map((candidate) => this.publicRestaurant(candidate)) };
  }

  private resultItems(value: unknown): JsonObject[] {
    if (Array.isArray(value)) return value.filter(isRecord);
    if (!isRecord(value)) return [];
    const nested = value.items ?? value.results ?? value.departments ?? value.doctors;
    return arrayValue(nested).filter(isRecord);
  }

  private publicRestaurant(candidate: JsonObject): JsonObject {
    const address = stringValue(candidate.address) ?? stringValue(candidate.location);
    const hasTrustworthyCoordinate = candidate.coordinate_status !== 'suspicious_default'
      && typeof candidate.latitude === 'number'
      && typeof candidate.longitude === 'number';
    return {
      name: stringValue(candidate.name) ?? 'Nhà hàng',
      location: address ?? 'Thông tin địa điểm đang được cập nhật',
      ...(address ? { address } : {}),
      ...(stringValue(candidate.city) ? { city: stringValue(candidate.city) } : {}),
      ...(stringValue(candidate.district) ? { district: stringValue(candidate.district) } : {}),
      ...(stringValue(candidate.cuisine_type) || stringValue(candidate.cuisine) ? { cuisine: stringValue(candidate.cuisine_type) ?? stringValue(candidate.cuisine) } : {}),
      ...(stringValue(candidate.description) ? { description: stringValue(candidate.description) } : {}),
      ...(typeof candidate.rating === 'number' ? { rating: candidate.rating } : {}),
      ...(typeof candidate.review_count === 'number' ? { review_count: candidate.review_count } : {}),
      ...(stringValue(candidate.price_level) ? { price_level: stringValue(candidate.price_level) } : {}),
      ...(stringValue(candidate.image_url) ? { image_url: stringValue(candidate.image_url) } : {}),
      ...(stringValue(candidate.opening_hours) || Array.isArray(candidate.opening_hours) ? { opening_hours: candidate.opening_hours } : {}),
      ...(hasTrustworthyCoordinate ? { latitude: candidate.latitude, longitude: candidate.longitude } : {}),
    };
  }

  private healthcareOptions(doctors: JsonObject[], _taskId: string): JsonObject {
    return {
      kind: 'healthcare_options',
      title: 'Bác sĩ và lịch còn trống',
      note: 'Khung giờ hiển thị là lịch mô phỏng để bạn thử luồng đặt lịch; hãy xác nhận lại với cơ sở trước khi đến.',
      options: this.healthcareOptionRows(doctors),
    };
  }

  private healthcareOptionRows(doctors: JsonObject[]): JsonObject[] {
    const rows: JsonObject[] = [];
    const byIdentity = new Map<string, JsonObject>();
    doctors.forEach((doctor, index) => {
      const facility = isRecord(doctor.facility) ? doctor.facility : undefined;
      const department = isRecord(doctor.department) ? doctor.department : undefined;
      const stableIdentity = stringValue(doctor.id) ?? stringValue(doctor.doctor_id) ?? stringValue(doctor.source_id);
      const identity = stableIdentity
        ? `${stableIdentity}|${stringValue(facility?.name) ?? ''}|${stringValue(department?.name) ?? stringValue(doctor.department) ?? ''}`
        : `${stringValue(doctor.name) ?? ''}|${stringValue(facility?.name) ?? ''}|${stringValue(department?.name) ?? stringValue(doctor.department) ?? ''}|${index}`;
      let row = byIdentity.get(identity);
      if (!row) {
        row = {
          facility,
          doctor: doctor.name,
          department: department?.name ?? doctor.department,
          price: doctor.price,
          slots: [],
        };
        byIdentity.set(identity, row);
        rows.push(row);
      }
      const slots = arrayValue(doctor.available_slots).filter(isRecord);
      const rowSlots = arrayValue(row.slots) as JsonObject[];
      for (const slot of slots) {
        const slotStart = stringValue(slot.start_time) ?? stringValue(slot.start_at);
        if (!slotStart || rowSlots.some((candidate) => candidate.start_time === slotStart && candidate.price === (slot.price ?? doctor.price))) continue;
        rowSlots.push({
          start_time: slotStart,
          ...(stringValue(slot.end_time) ? { end_time: stringValue(slot.end_time) } : {}),
          ...(typeof (slot.price ?? doctor.price) === 'number' ? { price: slot.price ?? doctor.price } : {}),
        });
      }
      row.slots = rowSlots;
      if (!row.start_time && rowSlots[0]?.start_time) row.start_time = rowSlots[0].start_time;
    });
    return rows.filter((row) => arrayValue(row.slots).length > 0);
  }

  private healthcareSelectionActions(doctors: JsonObject[], task: StoredTask): StoredAction[] {
    const cohortId = this.newCohort(task);
    let selectionIndex = 0;
    return doctors.flatMap((doctor, doctorIndex) => arrayValue(doctor.available_slots).filter(isRecord).map((slot, slotIndex) => {
      const slotId = numberValue(slot.id);
      if (slotId === undefined) return undefined;
      const action = this.actionFor(task, 'select_healthcare_slot', {
        selection_index: selectionIndex++,
        doctor_index: doctorIndex,
        slot_index: slotIndex,
        slot_id: slotId,
      }, cohortId);
      return action;
    }).filter((action): action is StoredAction => Boolean(action)));
  }

  private rideItem(result: JsonObject, task?: StoredTask): JsonObject {
    const quote = isRecord(result.quote) ? result.quote : undefined;
    const booking = isRecord(result.booking) ? result.booking : undefined;
    const timing = task?.authoritative && {
      ...(stringValue(task.authoritative.appointment_start_time) ? { appointment_start_time: task.authoritative.appointment_start_time } : {}),
      ...(stringValue(task.authoritative.recommended_departure) ? { recommended_departure: task.authoritative.recommended_departure } : {}),
      ...(numberValue(task.authoritative.departure_buffer_minutes) !== undefined ? { departure_buffer_minutes: task.authoritative.departure_buffer_minutes } : {}),
      ...(typeof task.authoritative.scheduled_pickup === 'boolean' ? { scheduled_pickup: task.authoritative.scheduled_pickup } : {}),
      ...(stringValue(task.authoritative.schedule_note) ? { schedule_note: task.authoritative.schedule_note } : {}),
    };
    return quote ? {
      kind: booking ? 'ride_booking' : 'ride_quote',
      title: booking ? 'Chuyến xe đã cập nhật' : 'Chuyến xe phù hợp',
      pickup: quote.pickup_address,
      dropoff: quote.dropoff_address,
      vehicle: this.vehicleLabel(quote.vehicle_type),
      amount: quote.amount,
      currency: quote.currency,
      ...(quote.duration_minutes !== undefined ? { duration_minutes: quote.duration_minutes } : {}),
      ...(typeof quote.route_distance_meters === 'number' ? { route_distance_meters: quote.route_distance_meters } : {}),
      ...(typeof quote.route_duration_seconds === 'number' ? { route_duration_seconds: quote.route_duration_seconds } : {}),
      ...(Array.isArray(quote.route_geometry) ? { route_geometry: quote.route_geometry } : {}),
      ...(typeof quote.pickup_latitude === 'number' ? { pickup_latitude: quote.pickup_latitude } : {}),
      ...(typeof quote.pickup_longitude === 'number' ? { pickup_longitude: quote.pickup_longitude } : {}),
      ...(typeof quote.dropoff_latitude === 'number' ? { dropoff_latitude: quote.dropoff_latitude } : {}),
      ...(typeof quote.dropoff_longitude === 'number' ? { dropoff_longitude: quote.dropoff_longitude } : {}),
      ...timing,
      ...(booking?.id ? { resource_id: booking.id } : {}),
      ...(booking ? { status: booking.status, driver: this.sanitizeDriver(booking.driver) } : {}),
    } : { kind: 'progress', title: safeText(result.response, 'Mình đã cập nhật chuyến xe.') };
  }

  private vehicleLabel(value: unknown): string {
    if (value === 'CAR_4') return 'Xe 4 chỗ';
    if (value === 'CAR_7') return 'Xe 7 chỗ';
    if (value === 'BIKE') return 'Xe máy';
    return 'Phương tiện phù hợp';
  }

  private sanitizeDriver(value: unknown): JsonObject | undefined {
    if (!isRecord(value)) return undefined;
    const result: JsonObject = {};
    for (const key of ['name', 'full_name', 'display_name', 'phone_masked', 'vehicle_type', 'vehicle_model', 'vehicle_color', 'license_plate']) {
      if (typeof value[key] === 'string' && value[key].trim()) result[key] = value[key].trim();
    }
    for (const key of ['rating', 'rating_average', 'eta_seconds']) {
      if (typeof value[key] === 'number' && Number.isFinite(value[key])) result[key] = value[key];
    }
    if (!result.phone_masked && typeof value.phone === 'string') {
      const masked = maskPublicPhone(value.phone);
      if (masked) result.phone_masked = masked;
    }
    if (isRecord(value.vehicle)) {
      const vehicle: JsonObject = {};
      for (const key of ['type', 'vehicle_type', 'make', 'model', 'vehicle_model', 'color', 'vehicle_color', 'license_plate']) {
        if (typeof value.vehicle[key] === 'string' && value.vehicle[key].trim()) vehicle[key] = value.vehicle[key].trim();
      }
      if (Object.keys(vehicle).length) result.vehicle = vehicle;
    }
    return Object.keys(result).length ? result : undefined;
  }

  private authoritativeRideRouteContext(
    _slots: Record<string, unknown>,
    facility?: JsonObject,
    restaurant?: JsonObject,
  ): RideRouteContext | undefined {
    const destination = facility ?? restaurant;
    const latitude = numberValue(destination?.latitude);
    const longitude = numberValue(destination?.longitude);
    if (latitude === undefined || longitude === undefined || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
    return { dropoff_latitude: latitude, dropoff_longitude: longitude };
  }

  private foodData(data: JsonObject): JsonObject {
    const items = arrayValue(data.items ?? data.results ?? data.options).filter(isRecord).map((entry) => {
      const item = isRecord(entry.item) ? entry.item : entry;
      const restaurant = isRecord(entry.restaurant) ? entry.restaurant : undefined;
      return {
        name: item.name ?? item.title,
        ...(typeof item.price === 'number' ? { price: item.price } : {}),
        ...(stringValue(item.currency) ? { currency: stringValue(item.currency) } : {}),
        ...(stringValue(item.category) ? { category: stringValue(item.category) } : {}),
        ...(stringValue(item.image_url) ? { image_url: stringValue(item.image_url) } : {}),
        ...(Array.isArray(item.option_groups) ? { option_groups: item.option_groups } : {}),
        ...(Array.isArray(item.options) ? { options: item.options } : {}),
        restaurant: restaurant ? {
          name: restaurant.name,
          address: restaurant.address,
          description: restaurant.description,
          rating: restaurant.rating,
          review_count: restaurant.review_count,
          price_level: restaurant.price_level,
          image_url: restaurant.image_url,
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
        } : entry.restaurant_name,
        description: item.description ?? entry.description,
      };
    }).filter((item) => stringValue(item.name));
    return {
      ...(items.length ? { options: items } : {}),
      ...(isRecord(data.cart) ? { cart: data.cart } : {}),
      ...(isRecord(data.preview) ? { preview: data.preview } : {}),
      ...(isRecord(data.order) ? { order: data.order } : {}),
    };
  }

  private foodCandidateDisplay(candidate: JsonObject, restaurantCandidate?: JsonObject): JsonObject {
    const restaurant = isRecord(candidate.restaurant) ? candidate.restaurant : restaurantCandidate;
    return {
      ...(stringValue(candidate.name ?? candidate.title) ? { name: stringValue(candidate.name ?? candidate.title) } : {}),
      ...(typeof candidate.price === 'number' ? { price: candidate.price } : {}),
      ...(stringValue(candidate.currency) ? { currency: stringValue(candidate.currency) } : {}),
      ...(stringValue(candidate.category) ? { category: stringValue(candidate.category) } : {}),
      ...(stringValue(candidate.description) ? { description: stringValue(candidate.description) } : {}),
      ...(stringValue(candidate.image_url) ? { image_url: stringValue(candidate.image_url) } : {}),
      ...(Array.isArray(candidate.option_groups) ? { option_groups: candidate.option_groups } : {}),
      ...(Array.isArray(candidate.options) ? { options: candidate.options } : {}),
      ...(restaurant ? { restaurant } : {}),
    };
  }

  private sanitizeConsumerItem(item: JsonObject): JsonObject {
    const allowed = new Set([
      'kind', 'title', 'note', 'question', 'options', 'departments', 'restaurant',
      'reservation_code', 'party_size', 'start_at', 'status', 'expires_at',
      'pickup', 'dropoff', 'vehicle', 'amount', 'currency', 'duration_minutes',
      'route_distance_meters', 'route_duration_seconds', 'route_geometry',
      'pickup_latitude', 'pickup_longitude', 'dropoff_latitude', 'dropoff_longitude',
      'appointment_start_time', 'recommended_departure', 'departure_buffer_minutes', 'scheduled_pickup', 'schedule_note',
      'driver', 'doctor', 'department', 'start_time', 'price', 'payment_note', 'cart',
      'resource_id',
      'appointment_id', 'appointment', 'facility', 'order', 'payment', 'preview',
      'error_code', 'retryable',
    ]);
    const result: JsonObject = {};
    for (const [key, value] of Object.entries(item)) {
      if (!allowed.has(key) || value === undefined) continue;
      if (key === 'options' || key === 'departments') {
        result[key] = arrayValue(value).filter(isRecord).map((entry) => this.sanitizeOption(entry));
      } else if (key === 'restaurant') {
        result[key] = this.sanitizeRestaurant(value);
      } else if (key === 'appointment') {
        result[key] = this.sanitizeAppointment(value);
      } else if (key === 'facility') {
        result[key] = this.sanitizeFacility(value);
      } else if (key === 'order') {
        result[key] = this.sanitizeOrder(value);
      } else if (key === 'payment') {
        result[key] = this.sanitizePayment(value);
      } else if (key === 'preview') {
        result[key] = this.sanitizePreview(value);
      } else if (key === 'cart') {
        result[key] = this.sanitizeCart(value);
      } else if (key === 'driver') {
        result[key] = this.sanitizeDriver(value);
      } else if (key === 'route_geometry') {
        result[key] = arrayValue(value).filter(isRecord).map((point) => ({
          ...(typeof point.latitude === 'number' ? { latitude: point.latitude } : {}),
          ...(typeof point.longitude === 'number' ? { longitude: point.longitude } : {}),
        })).filter((point) => typeof point.latitude === 'number' && typeof point.longitude === 'number');
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        result[key] = value;
      }
    }
    return result;
  }

  private sanitizeOption(value: JsonObject): JsonObject {
    const result: JsonObject = {};
    for (const key of ['name', 'title', 'location', 'cuisine', 'description', 'doctor', 'department', 'start_time', 'price', 'currency', 'category', 'rating', 'review_count', 'price_level', 'image_url', 'address', 'city', 'district', 'latitude', 'longitude']) {
      const item = value[key];
      if (typeof item === 'string' || typeof item === 'number') result[key] = item;
    }
    if (typeof value.opening_hours === 'string' || Array.isArray(value.opening_hours) && value.opening_hours.every((item) => typeof item === 'string')) result.opening_hours = value.opening_hours;
    if (Array.isArray(value.option_groups)) result.option_groups = this.sanitizeFoodOptionGroups(value.option_groups);
    if (Array.isArray(value.options)) result.options = this.sanitizeFoodOptions(value.options);
    if (isRecord(value.restaurant)) result.restaurant = this.sanitizeRestaurant(value.restaurant);
    else if (typeof value.restaurant === 'string') result.restaurant = value.restaurant;
    if (isRecord(value.facility)) result.facility = this.sanitizeFacility(value.facility);
    return result;
  }

  private sanitizeRestaurant(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    return {
      ...(stringValue(value.name) ? { name: stringValue(value.name) } : {}),
      ...(stringValue(value.location) ? { location: stringValue(value.location) } : {}),
      ...(stringValue(value.address) ? { address: stringValue(value.address) } : {}),
      ...(stringValue(value.cuisine) ? { cuisine: stringValue(value.cuisine) } : {}),
      ...(stringValue(value.description) ? { description: stringValue(value.description) } : {}),
      ...(typeof value.rating === 'number' ? { rating: value.rating } : {}),
      ...(typeof value.review_count === 'number' ? { review_count: value.review_count } : {}),
      ...(typeof value.price_level === 'number' ? { price_level: value.price_level } : {}),
      ...(stringValue(value.image_url) ? { image_url: stringValue(value.image_url) } : {}),
      ...(stringValue(value.city) ? { city: stringValue(value.city) } : {}),
      ...(stringValue(value.district) ? { district: stringValue(value.district) } : {}),
      ...(typeof value.latitude === 'number' ? { latitude: value.latitude } : {}),
      ...(typeof value.longitude === 'number' ? { longitude: value.longitude } : {}),
    };
  }

  private sanitizeFoodOptionGroups(value: unknown): JsonObject[] {
    return arrayValue(value).filter(isRecord).map((group) => {
      const options = arrayValue(group.options).filter(isRecord).map((option) => ({
        ...(stringValue(option.name) ? { name: stringValue(option.name) } : {}),
        ...(typeof option.price === 'number' ? { price: option.price } : {}),
      })).filter((option) => Object.keys(option).length > 0);
      return {
        ...(stringValue(group.name) ? { name: stringValue(group.name) } : {}),
        ...(typeof group.required === 'boolean' ? { required: group.required } : {}),
        ...(typeof group.min_select === 'number' ? { min_select: group.min_select } : {}),
        ...(typeof group.max_select === 'number' ? { max_select: group.max_select } : {}),
        ...(options.length ? { options } : {}),
      };
    }).filter((group) => Object.keys(group).length > 0);
  }

  private sanitizeFoodOptions(value: unknown): JsonObject[] {
    return arrayValue(value).filter(isRecord).map((option) => ({
      ...(stringValue(option.name ?? option.title) ? { name: stringValue(option.name ?? option.title) } : {}),
      ...(typeof option.price === 'number' ? { price: option.price } : {}),
      ...(stringValue(option.description) ? { description: stringValue(option.description) } : {}),
    })).filter((option) => Object.keys(option).length > 0);
  }

  private sanitizeCart(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    const result: JsonObject = {};
    for (const key of ['status', 'subtotal', 'discount', 'total', 'delivery_fee', 'currency']) {
      const item = value[key];
      if (typeof item === 'string' || typeof item === 'number') result[key] = item;
    }
    if (isRecord(value.total)) {
      result.total = {
        ...(typeof value.total.amount === 'number' ? { amount: value.total.amount } : {}),
        ...(stringValue(value.total.currency) ? { currency: stringValue(value.total.currency) } : {}),
      };
    }
    const items = arrayValue(value.items).filter(isRecord).map((item) => ({
      ...(stringValue(item.name ?? item.title) ? { name: stringValue(item.name ?? item.title) } : {}),
      ...(typeof item.quantity === 'number' ? { quantity: item.quantity } : {}),
      ...(typeof item.price === 'number' ? { price: item.price } : {}),
      ...(typeof item.unit_price === 'number' ? { unit_price: item.unit_price } : {}),
      ...(stringValue(item.description) ? { description: stringValue(item.description) } : {}),
      ...(stringValue(item.image_url) ? { image_url: stringValue(item.image_url) } : {}),
      ...(Array.isArray(item.selected_options) ? { selected_options: this.sanitizeFoodOptions(item.selected_options) } : {}),
      ...(isRecord(item.restaurant) ? { restaurant: this.sanitizeRestaurant(item.restaurant) } : {}),
    })).filter((item) => Object.keys(item).length > 0);
    if (items.length) result.items = items;
    return result;
  }

  private sanitizeAppointment(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    const result: JsonObject = {};
    for (const key of ['appointment_id', 'doctor_name', 'department', 'start_time', 'price', 'status']) {
      const item = value[key];
      if (typeof item === 'string' || typeof item === 'number') result[key] = item;
    }
    if (isRecord(value.doctor)) {
      if (stringValue(value.doctor.name)) result.doctor_name = stringValue(value.doctor.name);
      if (typeof value.doctor.price === 'number') result.price = value.doctor.price;
    }
    if (isRecord(value.department) && stringValue(value.department.name)) result.department = stringValue(value.department.name);
    if (isRecord(value.slot) && stringValue(value.slot.start_time)) result.start_time = stringValue(value.slot.start_time);
    if (isRecord(value.facility)) result.facility = this.sanitizeFacility(value.facility);
    return result;
  }

  private sanitizeFacility(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    return {
      ...(stringValue(value.name) ? { name: stringValue(value.name) } : {}),
      ...(stringValue(value.address) ? { address: stringValue(value.address) } : {}),
      ...(typeof value.latitude === 'number' ? { latitude: value.latitude } : {}),
      ...(typeof value.longitude === 'number' ? { longitude: value.longitude } : {}),
    };
  }

  private sanitizeOrder(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    const result: JsonObject = {};
    for (const key of ['id', 'status', 'amount', 'currency', 'subtotal', 'discount', 'restaurant']) {
      const item = value[key];
      if (typeof item === 'string' || typeof item === 'number') result[key] = item;
      if (key === 'restaurant' && isRecord(item)) result[key] = this.sanitizeRestaurant(item);
    }
    return result;
  }

  private sanitizePayment(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    const result: JsonObject = {};
    for (const key of ['status', 'amount', 'currency']) {
      const item = value[key];
      if (typeof item === 'string' || typeof item === 'number') result[key] = item;
    }
    return result;
  }

  private sanitizePreview(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    const result: JsonObject = {};
    for (const key of ['subtotal', 'discount', 'quote_version', 'cart_version']) {
      const item = value[key];
      if (typeof item === 'string' || typeof item === 'number') result[key] = item;
    }
    if (isRecord(value.total)) {
      result.total = {
        ...(typeof value.total.amount === 'number' ? { amount: value.total.amount } : {}),
        ...(stringValue(value.total.currency) ? { currency: stringValue(value.total.currency) } : {}),
      };
    }
    if (isRecord(value.delivery)) {
      result.delivery = {
        ...(typeof value.delivery.eta_minutes === 'number' ? { eta_minutes: value.delivery.eta_minutes } : {}),
        ...(isRecord(value.delivery.fee) ? {
          fee: {
            ...(typeof value.delivery.fee.amount === 'number' ? { amount: value.delivery.fee.amount } : {}),
            ...(stringValue(value.delivery.fee.currency) ? { currency: stringValue(value.delivery.fee.currency) } : {}),
          },
        } : {}),
      };
    }
    return result;
  }

  private modelSafeValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.slice(0, 8).map((item) => this.modelSafeValue(item));
    if (!isRecord(value)) return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined;
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (/(^id$|_id$|confirmation|workflow|tool[_ -]?call|provider_reference|resource_version|snapshot_hash|quote_version|cart_version|reservation_code)/i.test(key)) continue;
      const safe = this.modelSafeValue(item);
      if (safe !== undefined) result[key] = safe;
    }
    return result;
  }

  private modelSafeItem(item: JsonObject): JsonObject {
    return this.modelSafeValue(this.sanitizeConsumerItem(item)) as JsonObject;
  }
}

function isTerminalRideBookingStatus(status: string | undefined): boolean {
  return status !== undefined && ['COMPLETED', 'NO_DRIVER', 'FAILED', 'PAYMENT_FAILED', 'CANCELLED'].includes(status.toUpperCase());
}

function maskPublicPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
