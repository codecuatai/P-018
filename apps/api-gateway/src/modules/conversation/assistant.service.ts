import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, Optional, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

import {
  AgentClient,
  FoodClient,
  HealthcareClient,
  JsonObject,
  RestaurantClient,
  RestaurantTool,
  RideClient,
} from '../../clients/service.clients';
import { AuthUser } from '../auth/auth.types';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { AssistantActionExecutionClaim, AssistantActionExecutionRecord, AssistantActionSuccessCommit, CoreStore, isUserVisibleConversationMessage, ConversationMessageKind } from '../core/core.module';
import { ServiceCallError } from '../../resilience/service-call-error';
import { ToolProposal, ToolService } from '../tools/tool.module';
import { RideConversationService as RideWorkflowService, RideRouteContext, RideWorkflowHydration } from './ride-conversation.service';
import {
  buildOrchestrationSnapshot,
  hasFailedDependency,
  OrchestrationSnapshot,
  WorkflowStatus,
} from './orchestration';

type Domain = 'ride' | 'food' | 'restaurant' | 'healthcare';
type TaskPhase = 'PLANNING' | 'NEEDS_INFO' | 'IN_PROGRESS' | 'AWAITING_CONFIRMATION' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'DISCARDED';
type InteractionMode = 'service' | 'chitchat' | 'advisory' | 'unsupported';
type ReplanDirective = 'CONTINUE' | 'ASK_USER' | 'REFRESH_AUTHORITY' | 'REQUOTE_OR_REPREVIEW' | 'WAIT_AND_RETRY_SAME_KEY' | 'BLOCK_DEPENDENTS' | 'TERMINAL_FAILURE' | 'RECONCILIATION_REQUIRED';
type PlannedCapabilityStep = {
  step_kind: 'CAPABILITY' | 'WAIT_FOR_CONFIRMATION';
  capability?: string;
  schema_version?: string;
  risk_ceiling: 'READ' | 'REVERSIBLE_WRITE' | 'FINANCIAL_OR_FINAL';
  confirmation_gate: 'NONE' | 'SERVICE_DETAILS' | 'FINAL_COMMIT' | 'PAYMENT' | 'CANCELLATION';
  phase: string;
  requires_authority: JsonObject[];
};

type ActionKind = 'select_restaurant' | 'restaurant_confirm' | 'ride_service' | 'ride_payment' | 'select_healthcare_slot' | 'healthcare_payment' | 'healthcare_confirm' | 'healthcare_cancel' | 'select_food_item' | 'food_cart_increment' | 'food_cart_decrement' | 'food_cart_remove' | 'food_checkout' | 'food_confirm' | 'food_payment';

function isFoodCartAction(kind: ActionKind): boolean {
  return kind === 'food_cart_increment' || kind === 'food_cart_decrement' || kind === 'food_cart_remove' || kind === 'food_checkout';
}

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
  blocking_task_id?: string;
  block_reason?: string;
  missing_information?: string[];
  planned_step?: PlannedCapabilityStep;
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

type PlanResolution = {
  tasks: AgentPlanTask[];
  clarificationQuestion?: string;
  interactionMode: InteractionMode;
  discardedTaskRefs: number[];
  replanDirective?: ReplanDirective;
  confirmationInvalidated: boolean;
};

type DiscardResult = {
  discardedIds: Set<string>;
  domains: Domain[];
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
  quantity?: number;
};

export type AssistantResponse = {
  conversation_id: string;
  message: string;
  items: JsonObject[];
  actions: Array<{ id: string; kind: ActionKind; label: string; target_index?: number }>;
  completed: JsonObject[];
  workflow_status: WorkflowStatus;
};

type AgentPlanTask = {
  domain?: unknown;
  goal?: unknown;
  normalized_request?: unknown;
  extracted_slots?: unknown;
  depends_on?: unknown;
  disposition?: unknown;
  missing_information?: unknown;
  planned_step?: PlannedCapabilityStep;
};

type CapabilityDefinition = {
  name: string;
  domain: Domain;
  schema_version: string;
  risk_level: 'READ' | 'REVERSIBLE_WRITE' | 'FINANCIAL_OR_FINAL';
  confirmation_gate: 'NONE' | 'SERVICE_DETAILS' | 'FINAL_COMMIT' | 'PAYMENT' | 'CANCELLATION';
  status: 'implemented' | 'skeleton';
  input_fields: string[];
};

const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  ['search_food', 'food', 'READ', 'NONE'], ['view_menu', 'food', 'READ', 'NONE'],
  ['view_menu_item', 'food', 'READ', 'NONE'], ['list_food_delivery_addresses', 'food', 'READ', 'NONE'],
  ['get_food_cart', 'food', 'READ', 'NONE'], ['create_cart', 'food', 'REVERSIBLE_WRITE', 'NONE'],
  ['add_to_cart', 'food', 'REVERSIBLE_WRITE', 'NONE'], ['update_food_cart_item', 'food', 'REVERSIBLE_WRITE', 'NONE'],
  ['remove_food_cart_item', 'food', 'REVERSIBLE_WRITE', 'NONE'], ['apply_voucher', 'food', 'REVERSIBLE_WRITE', 'NONE'],
  ['remove_food_voucher', 'food', 'REVERSIBLE_WRITE', 'NONE'], ['quote_delivery', 'food', 'READ', 'NONE'],
  ['preview_order', 'food', 'READ', 'NONE'], ['get_food_order', 'food', 'READ', 'NONE'],
  ['track_food_order', 'food', 'READ', 'NONE'], ['preview_food_order_cancellation', 'food', 'READ', 'NONE'],
  ['restaurant.search', 'restaurant', 'READ', 'NONE'], ['restaurant.get', 'restaurant', 'READ', 'NONE'],
  ['restaurant.check_availability', 'restaurant', 'READ', 'NONE'],
  ['restaurant.create_hold', 'restaurant', 'REVERSIBLE_WRITE', 'SERVICE_DETAILS'],
  ['restaurant.create_reservation', 'restaurant', 'FINANCIAL_OR_FINAL', 'FINAL_COMMIT'],
  ['healthcare.list_departments', 'healthcare', 'READ', 'NONE'],
  ['healthcare.list_slots', 'healthcare', 'READ', 'NONE'],
  ['healthcare.hold_slot', 'healthcare', 'REVERSIBLE_WRITE', 'SERVICE_DETAILS'],
  ['healthcare.confirm_appointment', 'healthcare', 'FINANCIAL_OR_FINAL', 'PAYMENT'],
  ['healthcare.cancel_appointment', 'healthcare', 'REVERSIBLE_WRITE', 'CANCELLATION'],
  ['ride.quote.create', 'ride', 'READ', 'NONE'],
  ['ride.booking.prepare', 'ride', 'REVERSIBLE_WRITE', 'SERVICE_DETAILS'],
  ['ride.booking.status.get', 'ride', 'READ', 'NONE'],
  ['ride.booking.cancel.prepare', 'ride', 'REVERSIBLE_WRITE', 'CANCELLATION'],
].map(([name, domain, risk_level, confirmation_gate]) => ({
  name,
  domain,
  schema_version: '1',
  risk_level,
  confirmation_gate,
  status: 'implemented',
  input_fields: [],
})) as CapabilityDefinition[];

const CAPABILITY_SNAPSHOT = {
  version: 'gateway-observed.v1',
  capabilities: CAPABILITY_DEFINITIONS,
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

const DEFAULT_RESTAURANT_OPENING_HOURS: JsonObject[] = [{ day: 'Hằng ngày', open: '08:00', close: '22:00' }];

function hasOpeningHours(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => hasOpeningHours(entry));
  if (isRecord(value)) return Object.values(value).some((entry) => hasOpeningHours(entry));
  if (typeof value !== 'string') return false;
  const folded = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replaceAll('đ', 'd').trim();
  return Boolean(folded)
    && !['dang cap nhat', 'unknown', 'n/a'].includes(folded)
    && !(folded.includes('dang cap nhat') && !/\d/.test(folded));
}

function prioritizeRestaurantCandidates(candidates: JsonObject[]): JsonObject[] {
  // Keep the service ranking stable while placing restaurants with a real image first.
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const leftHasImage = Boolean(stringValue(left.candidate.image_url));
      const rightHasImage = Boolean(stringValue(right.candidate.image_url));
      return Number(rightHasImage) - Number(leftHasImage) || left.index - right.index;
    })
    .map(({ candidate }) => candidate);
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

const FINAL_SUCCESS_PATTERNS: Record<Domain, RegExp[]> = {
  ride: [/(?:chuyen xe|cuoc xe|ride).*(?:da (?:duoc )?dat thanh cong|booked successfully|has been booked)/],
  restaurant: [/(?:dat ban|reservation).*(?:thanh cong|confirmed)/],
  healthcare: [/(?:lich kham|lich hen|appointment).*(?:da (?:duoc )?(?:xac nhan|tao thanh cong)|confirmed)/],
  food: [/(?:don hang|don do an|food order).*(?:da (?:duoc )?(?:dat|tiep nhan) thanh cong|confirmed|succeeded)/],
};

function hasUnsupportedFinalSuccessClaim(message: string, tasks: StoredTask[]): boolean {
  const folded = plainText(message);
  const incompleteDomains = new Set(
    tasks.filter((task) => task.phase !== 'COMPLETED').map((task) => task.domain),
  );
  return [...incompleteDomains].some((domain) => (
    FINAL_SUCCESS_PATTERNS[domain].some((pattern) => pattern.test(folded))
  ));
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

function buildTaskErrorItem(code: string, retryable: boolean, context?: Record<string, unknown>) {
  let title = 'Dịch vụ gặp sự cố';
  let note = 'Mình chưa thể hoàn tất dịch vụ. Bạn hãy thử lại sau nhé.';

  switch (code) {
    case 'DEPENDENCY_BLOCKED':
      title = 'Chưa đủ điều kiện';
      note = 'Bạn cần hoàn tất thông tin khác trước khi thực hiện bước này.';
      break;
    case 'PATIENT_LINK_REQUIRED':
      title = 'Cần hồ sơ người bệnh';
      note = 'Bạn cần liên kết hồ sơ người bệnh trước khi đặt lịch khám.';
      break;
    case 'NOT_FOUND':
      title = 'Không tìm thấy thông tin';
      note = 'Dịch vụ hoặc thông tin bạn yêu cầu không khả dụng.';
      break;
    case 'INVALID_PAYLOAD':
    case 'BAD_REQUEST':
      title = 'Thông tin chưa hợp lệ';
      note = 'Có vẻ thông tin cung cấp chưa chính xác, bạn hãy kiểm tra lại nhé.';
      break;
  }

  return {
    kind: 'task_error',
    error_code: code,
    retryable,
    title,
    note,
    ...context
  };
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

function publicDateTime(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return parseAuthoritativeDate(raw) ? raw : undefined;
  return parseAuthoritativeDate(raw)?.toISOString();
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

function healthcareAppointmentDate(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const parsed = parseAuthoritativeDate(`${raw}T00:00:00+07:00`);
  return parsed && healthcareDateKey(parsed) === raw ? raw : undefined;
}

function requestedHealthcareDate(slots: Record<string, unknown>): string | undefined {
  return healthcareAppointmentDate(slots.appointment_date)
    ?? (() => {
      const requested = parseAuthoritativeDate(slots.start_at);
      return requested ? healthcareDateKey(requested) : undefined;
    })();
}

function requestedHealthcareStart(slots: Record<string, unknown>): Date | undefined {
  const requested = parseAuthoritativeDate(slots.start_at);
  const appointmentDate = healthcareAppointmentDate(slots.appointment_date);
  // A date-only follow-up intentionally clears the prior exact clock in the
  // Agent. This guard also protects persisted legacy state if it still has one.
  return requested && (!appointmentDate || healthcareDateKey(requested) === appointmentDate)
    ? requested
    : undefined;
}

function filterDoctorsByRequestedTime(doctors: JsonObject[], slots: Record<string, unknown>): JsonObject[] {
  const requested = requestedHealthcareStart(slots);
  const preference = stringValue(slots.time_preference)?.toLowerCase();
  const appointmentDate = requestedHealthcareDate(slots);
  const hasDateOrPreference = Boolean(appointmentDate || preference);
  if (!hasDateOrPreference) return doctors;

  const targetDate = appointmentDate
    ? appointmentDate
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
  return value === 'NEEDS_INFO' || value === 'IN_PROGRESS' || value === 'AWAITING_CONFIRMATION' || value === 'COMPLETED' || value === 'FAILED' || value === 'BLOCKED' || value === 'DISCARDED' || value === 'PLANNING'
    ? value
    : 'PLANNING';
}

function interactionModeFrom(value: unknown): InteractionMode {
  return value === 'chitchat' || value === 'advisory' || value === 'unsupported'
    ? value
    : 'service';
}

function discardedTaskRefsFrom(value: unknown): number[] {
  return [...new Set(arrayValue(value).filter((item): item is number => (
    typeof item === 'number'
    && Number.isInteger(item)
    && item >= 0
    && item < 8
  )))];
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
    ...(stringValue(task.blocking_task_id) ? { blocking_task_id: task.blocking_task_id as string } : {}),
    ...(stringValue(task.block_reason) ? { block_reason: task.block_reason as string } : {}),
    ...(Array.isArray(task.missing_information) ? { missing_information: task.missing_information.filter((i): i is string => typeof i === 'string') } : {}),
    ...(isRecord(task.planned_step) ? {
      planned_step: {
        step_kind: task.planned_step.step_kind === 'WAIT_FOR_CONFIRMATION' ? 'WAIT_FOR_CONFIRMATION' : 'CAPABILITY',
        ...(stringValue(task.planned_step.capability) ? { capability: stringValue(task.planned_step.capability) } : {}),
        ...(stringValue(task.planned_step.schema_version) ? { schema_version: stringValue(task.planned_step.schema_version) } : {}),
        risk_ceiling: task.planned_step.risk_ceiling as PlannedCapabilityStep['risk_ceiling'],
        confirmation_gate: task.planned_step.confirmation_gate as PlannedCapabilityStep['confirmation_gate'],
        phase: stringValue(task.planned_step.phase) ?? 'PLANNING',
        requires_authority: arrayValue(task.planned_step.requires_authority).filter(isRecord),
      } as PlannedCapabilityStep,
    } : {}),
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
  })).filter((action) => action.task_id && ['select_restaurant', 'restaurant_confirm', 'ride_service', 'ride_payment', 'select_healthcare_slot', 'healthcare_payment', 'healthcare_confirm', 'healthcare_cancel', 'select_food_item', 'food_cart_increment', 'food_cart_decrement', 'food_cart_remove', 'food_checkout', 'food_confirm', 'food_payment'].includes(action.kind)) as StoredAction[];
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
  const publicItem = task.public_item;
  const quoteId = stringValue(quote?.id) ?? stringValue(booking?.quote_id);
  const bookingId = stringValue(booking?.id) ?? stringValue(publicItem?.booking_id) ?? stringValue(publicItem?.resource_id);
  if (!quoteId && !bookingId) return undefined;
  return { ...(quoteId ? { quoteId } : {}), ...(bookingId ? { bookingId } : {}) };
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
    @Optional() private readonly tools?: ToolService,
    @Optional() private readonly rideClient?: RideClient,
  ) {}

  private validateCoreAHandoff(planner: JsonObject): void {
    const rawDecision = planner.planning_decision;
    if (!isRecord(rawDecision)) {
      throw new ServiceUnavailableException({ code: 'AGENT_PLAN_VERSION_REJECTED', detail: 'A versioned Core A planning decision is required.' });
    }
    const decision: JsonObject = rawDecision;
    if (decision.contract_version !== 'core-a.v1') {
      throw new ServiceUnavailableException({ code: 'AGENT_PLAN_VERSION_REJECTED', detail: 'Agent planning contract version is unsupported.' });
    }
    if (decision.capability_catalog_version !== CAPABILITY_SNAPSHOT.version) {
      throw new ServiceUnavailableException({ code: 'AGENT_PLAN_VERSION_REJECTED', detail: 'Agent capability catalog version does not match Gateway.' });
    }
    if (!Array.isArray(decision.tasks)) {
      throw new ServiceUnavailableException({ code: 'AGENT_PLAN_INVALID', detail: 'Agent planning contract is invalid.' });
    }
    const tasks = arrayValue(decision.tasks);
    if (tasks.length > 4 || tasks.some((task) => !isRecord(task))) {
      throw new ServiceUnavailableException({ code: 'AGENT_PLAN_INVALID', detail: 'Agent planning contract is invalid.' });
    }
    if (!['SINGLE_TASK', 'INDEPENDENT_TASKS', 'DEPENDENT_TASKS', 'MIXED'].includes(String(decision.workflow_relation))) {
      throw new ServiceUnavailableException({ code: 'AGENT_PLAN_INVALID', detail: 'Agent workflow relation is invalid.' });
    }
    const interactionMode = decision.interaction_mode;
    if (!['service', 'chitchat', 'advisory', 'unsupported'].includes(String(interactionMode))) {
      throw new ServiceUnavailableException({ code: 'AGENT_PLAN_INVALID', detail: 'Agent interaction mode is invalid.' });
    }
    const replanDirective = decision.replan_directive;
    const validReplanDirectives: ReplanDirective[] = ['CONTINUE', 'ASK_USER', 'REFRESH_AUTHORITY', 'REQUOTE_OR_REPREVIEW', 'WAIT_AND_RETRY_SAME_KEY', 'BLOCK_DEPENDENTS', 'TERMINAL_FAILURE', 'RECONCILIATION_REQUIRED'];
    if (
      replanDirective !== undefined
      && replanDirective !== null
      && !validReplanDirectives.includes(String(replanDirective) as ReplanDirective)
    ) {
      throw new ServiceUnavailableException({ code: 'AGENT_REPLAN_REJECTED', detail: 'Agent re-plan directive is invalid.' });
    }
    if (typeof decision.confirmation_invalidated !== 'boolean') {
      throw new ServiceUnavailableException({ code: 'AGENT_REPLAN_REJECTED', detail: 'Agent confirmation invalidation flag is invalid.' });
    }
    if (!Array.isArray(decision.discarded_task_refs) || !Array.isArray(decision.blocked_task_refs)) {
      throw new ServiceUnavailableException({ code: 'AGENT_PLAN_INVALID', detail: 'Agent task-reference lists are invalid.' });
    }
    const discardedTaskRefs = arrayValue(decision.discarded_task_refs);
    if (
      discardedTaskRefs.length > 8
      || discardedTaskRefs.some((value) => typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= 8)
      || new Set(discardedTaskRefs).size !== discardedTaskRefs.length
    ) {
      throw new ServiceUnavailableException({ code: 'AGENT_CONTEXT_ACTION_REJECTED', detail: 'Agent context action is invalid.' });
    }
    const definitions = new Map(CAPABILITY_DEFINITIONS.map((definition) => [definition.name, definition]));
    const refs = new Set<number>();
    for (const [index, value] of tasks.entries()) {
      const task = value as JsonObject;
      const taskRef = numberValue(task.task_ref);
      const domain = stringValue(task.domain);
      if (taskRef !== index || refs.has(taskRef) || !['ride', 'food', 'restaurant', 'healthcare'].includes(domain ?? '')) {
        throw new ServiceUnavailableException({ code: 'AGENT_PLAN_INVALID', detail: 'Agent task reference or domain is invalid.' });
      }
      refs.add(taskRef);
      if (!['READY', 'NEEDS_INFO', 'WAITING', 'BLOCKED', 'FAILED', 'COMPLETED'].includes(stringValue(task.disposition) ?? '')) {
        throw new ServiceUnavailableException({ code: 'AGENT_PLAN_INVALID', detail: 'Agent task disposition is invalid.' });
      }
      const steps = arrayValue(task.steps);
      if (steps.length > 16) {
        throw new ServiceUnavailableException({ code: 'AGENT_PLAN_INVALID', detail: 'Agent task has too many steps.' });
      }
      for (const rawStep of steps) {
        if (!isRecord(rawStep)) throw new ServiceUnavailableException({ code: 'AGENT_PLAN_INVALID', detail: 'Agent step is invalid.' });
        const stepKind = stringValue(rawStep.step_kind);
        const capability = stringValue(rawStep.capability);
        if (stepKind === 'WAIT_FOR_CONFIRMATION') {
          const expectedGates: Record<string, string> = {
            SERVICE_CONFIRMATION: 'SERVICE_DETAILS',
            PAYMENT_CONFIRMATION: 'PAYMENT',
            CANCELLATION_CONFIRMATION: 'CANCELLATION',
          };
          if (
            capability
            || rawStep.risk_ceiling !== 'FINANCIAL_OR_FINAL'
            || expectedGates[stringValue(rawStep.phase) ?? ''] !== rawStep.confirmation_gate
          ) {
            throw new ServiceUnavailableException({ code: 'AGENT_CAPABILITY_REJECTED', detail: 'Agent confirmation waiting step is invalid.' });
          }
          continue;
        }
        if (stepKind !== 'CAPABILITY' || !capability) {
          throw new ServiceUnavailableException({ code: 'AGENT_CAPABILITY_REJECTED', detail: 'Agent step must name a supported capability.' });
        }
        const definition = definitions.get(capability);
        if (
          !definition
          || definition.domain !== domain
          || definition.risk_level !== rawStep.risk_ceiling
          || definition.confirmation_gate !== rawStep.confirmation_gate
        ) {
          throw new ServiceUnavailableException({ code: 'AGENT_CAPABILITY_REJECTED', detail: 'Agent capability metadata does not match the Gateway snapshot.' });
        }
      }
    }
    for (const value of tasks) {
      const task = value as JsonObject;
      const taskRef = numberValue(task.task_ref) as number;
      const dependencies = arrayValue(task.depends_on);
      if (dependencies.some((dependency) => typeof dependency !== 'number' || !refs.has(dependency) || dependency === taskRef)) {
        throw new ServiceUnavailableException({ code: 'AGENT_DEPENDENCY_REJECTED', detail: 'Agent dependency reference is invalid.' });
      }
    }
    const blockedTaskRefs = arrayValue(decision.blocked_task_refs);
    if (
      blockedTaskRefs.length > 4
      || blockedTaskRefs.some((value) => typeof value !== 'number' || !Number.isInteger(value) || !refs.has(value))
      || new Set(blockedTaskRefs).size !== blockedTaskRefs.length
    ) {
      throw new ServiceUnavailableException({ code: 'AGENT_REPLAN_REJECTED', detail: 'Agent blocked-task references are invalid.' });
    }
    const dependenciesByRef = new Map(tasks.map((value) => {
      const task = value as JsonObject;
      return [numberValue(task.task_ref) as number, arrayValue(task.depends_on) as number[]];
    }));
    const visiting = new Set<number>();
    const visited = new Set<number>();
    const visit = (taskRef: number): void => {
      if (visiting.has(taskRef)) {
        throw new ServiceUnavailableException({ code: 'AGENT_DEPENDENCY_REJECTED', detail: 'Agent dependency graph contains a cycle.' });
      }
      if (visited.has(taskRef)) return;
      visiting.add(taskRef);
      for (const dependency of dependenciesByRef.get(taskRef) ?? []) visit(dependency);
      visiting.delete(taskRef);
      visited.add(taskRef);
    };
    for (const taskRef of refs) visit(taskRef);
  }

  private typedPlan(planner: JsonObject): PlanResolution {
    const rawDecision = planner.planning_decision;
    if (!isRecord(rawDecision)) {
      throw new ServiceUnavailableException({ code: 'AGENT_PLAN_INVALID', detail: 'Agent planning contract is invalid.' });
    }
    const decision: JsonObject = rawDecision;
    const blockedTaskRefs = new Set(arrayValue(decision.blocked_task_refs).filter((value): value is number => typeof value === 'number'));
    const tasks = arrayValue(decision.tasks).filter(isRecord).map((task) => {
      const rawStep = arrayValue(task.steps).find(isRecord);
      const plannedStep: PlannedCapabilityStep | undefined = rawStep
        ? {
          step_kind: rawStep.step_kind === 'WAIT_FOR_CONFIRMATION' ? 'WAIT_FOR_CONFIRMATION' : 'CAPABILITY',
          ...(stringValue(rawStep.capability) ? { capability: stringValue(rawStep.capability) } : {}),
          schema_version: '1',
          risk_ceiling: rawStep.risk_ceiling as PlannedCapabilityStep['risk_ceiling'],
          confirmation_gate: rawStep.confirmation_gate as PlannedCapabilityStep['confirmation_gate'],
          phase: stringValue(rawStep.phase) ?? 'PLANNING',
          requires_authority: arrayValue(rawStep.requires_authority).filter(isRecord),
        }
        : undefined;
      return {
        domain: task.domain,
        goal: task.goal,
        normalized_request: task.normalized_request,
        extracted_slots: this.semanticSlotValues(task.semantic_slots),
        depends_on: arrayValue(task.depends_on),
        disposition: blockedTaskRefs.has(numberValue(task.task_ref) ?? -1) ? 'BLOCKED' : task.disposition,
        missing_information: arrayValue(task.missing_information),
        ...(plannedStep ? { planned_step: plannedStep } : {}),
      };
    });
    const clarification = isRecord(decision.clarification_need) ? decision.clarification_need : undefined;
    const requestedClarification = clarification
      ? this.typedClarification(arrayValue(clarification.missing_fields))
      : undefined;
    const directive = stringValue(decision.replan_directive) as ReplanDirective | undefined;
    const clarificationQuestion = requestedClarification
      ?? (directive === 'RECONCILIATION_REQUIRED'
        ? 'Tráº¡ng thĂ¡i thao tĂ¡c trÆ°á»›c chÆ°a thá»ƒ xĂ¡c Ä‘á»‹nh. MĂ¬nh cáº§n Ä‘á»‘i soĂ¡t trÆ°á»›c khi tiáº¿p tá»¥c.'
        : directive === 'ASK_USER'
          ? 'MĂ¬nh cáº§n báº¡n xĂ¡c nháº­n thĂªm thĂ´ng tin trÆ°á»›c khi tiáº¿p tá»¥c.'
          : undefined);
    return {
      tasks,
      ...(clarificationQuestion ? { clarificationQuestion } : {}),
      interactionMode: interactionModeFrom(decision.interaction_mode),
      discardedTaskRefs: discardedTaskRefsFrom(decision.discarded_task_refs),
      ...(directive ? { replanDirective: directive } : {}),
      confirmationInvalidated: decision.confirmation_invalidated === true,
    };
  }

  private semanticSlotValues(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) return {};
    const result: Record<string, unknown> = {};
    for (const [field, raw] of Object.entries(value)) {
      if (!isRecord(raw)) continue;
      const slotValue = raw.value;
      const source = stringValue(raw.source);
      if (
        ['USER_EXPLICIT', 'CONVERSATION_REFERENCE', 'INFERRED_PREFERENCE'].includes(source ?? '')
        && (typeof slotValue === 'string' || typeof slotValue === 'number' || typeof slotValue === 'boolean')
      ) {
        result[field] = slotValue;
      }
    }
    return sanitizedSlots(result);
  }

  private typedClarification(fields: unknown[]): string {
    const labels: Record<string, string> = {
      location: 'khu vực',
      party_size: 'số người',
      start_at: 'thời gian',
      department: 'khoa khám',
      pickup_address: 'điểm đón',
      dropoff_address: 'điểm đến',
      'query|dish_query': 'món bạn muốn tìm',
      'location|cuisine_query|cuisine_type|cuisine': 'khu vực hoặc loại món',
      selection_domain: 'bạn muốn chọn đồ ăn hay lịch khám',
    };
    const values = fields
      .filter((field): field is string => typeof field === 'string')
      .map((field) => labels[field] ?? field)
      .slice(0, 2);
    return values.length
      ? `Bạn cho mình biết thêm ${values.join(' và ')} nhé?`
      : 'Bạn cho mình biết thêm một chút thông tin nhé?';
  }

  private propagateDependencyFailures(tasks: StoredTask[]): void {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    if (byId.size !== tasks.length) {
      throw new ServiceUnavailableException({ code: 'CONVERSATION_STATE_INVALID', detail: 'Conversation task state contains duplicate task identifiers.' });
    }
    const dependents = new Map<string, StoredTask[]>();
    for (const task of tasks) {
      for (const dependencyId of task.depends_on) {
        if (dependencyId === task.id || !byId.has(dependencyId)) {
          throw new ServiceUnavailableException({ code: 'CONVERSATION_STATE_INVALID', detail: 'Conversation task dependency is invalid.' });
        }
        const children = dependents.get(dependencyId) ?? [];
        children.push(task);
        dependents.set(dependencyId, children);
      }
    }

    const queue = tasks.filter((task) => task.phase === 'FAILED' || task.phase === 'BLOCKED');
    for (let index = 0; index < queue.length; index += 1) {
      const blocker = queue[index];
      for (const task of dependents.get(blocker.id) ?? []) {
        if (task.phase === 'COMPLETED' || task.phase === 'FAILED' || task.phase === 'BLOCKED') continue;
        task.phase = 'BLOCKED';
        task.blocking_task_id = blocker.id;
        task.block_reason = 'DEPENDENCY_FAILED';
        queue.push(task);
      }
    }
  }

  private workflowStatus(tasks: StoredTask[]): WorkflowStatus {
    const active = tasks.filter((task) => task.phase !== 'DISCARDED');
    if (!active.length) return 'PENDING';
    if (active.every((task) => task.phase === 'COMPLETED')) return 'COMPLETED';
    const completed = active.some((task) => task.phase === 'COMPLETED');
    const unsuccessful = active.some((task) => task.phase === 'FAILED' || task.phase === 'BLOCKED');
    if (completed && unsuccessful) return 'PARTIAL_SUCCESS';
    if (!completed && active.every((task) => task.phase === 'FAILED' || task.phase === 'BLOCKED')) return 'FAILED';
    return 'RUNNING';
  }

  private plannerSafeState(state: AssistantState): JsonObject {
    const taskIndexes = new Map(state.tasks.map((task, index) => [task.id, index]));
    
    const activeTasks = state.tasks.filter((t) => ['PLANNING', 'NEEDS_INFO', 'IN_PROGRESS', 'AWAITING_CONFIRMATION'].includes(t.phase));
    const activeDomains = Array.from(new Set(activeTasks.map((t) => t.domain)));
    const focusTask = activeTasks.find((t) => t.phase === 'NEEDS_INFO' || t.phase === 'AWAITING_CONFIRMATION') ?? activeTasks[0];
    const activeDomain = focusTask ? focusTask.domain : undefined;
    const workflowPhase = focusTask ? focusTask.phase : undefined;
    
    const workingMemory = {
      active_task_refs: activeTasks.map((t) => taskIndexes.get(t.id)).filter((ref) => ref !== undefined),
      active_domain: activeDomain,
      active_domains: activeDomains,
      workflow_phase: workflowPhase,
    };

    const conversationSummary = {
      conversation_goal: state.tasks.length > 0 ? state.tasks[0].goal : undefined,
      active_domain: activeDomain,
      active_domains: activeDomains,
    };

    return {
      working_memory: workingMemory,
      conversation_summary: conversationSummary,
      tasks: state.tasks.slice(0, 8).map((task, index) => {
        const pendingActions = Array.from(new Set(state.actions.filter((action) => action.task_id === task.id).map((action) => action.kind)));
        const pendingChoice = this.plannerPendingChoice(task);
        return {
          task_ref: index,
          domain: task.domain,
          goal: this.plannerText(task.goal),
          normalized_request: this.plannerText(task.normalized_request),
          phase: task.phase,
          extracted_slots: sanitizedSlots(task.extracted_slots),
          depends_on: task.depends_on.map((dependency) => taskIndexes.get(dependency)).filter((value): value is number => value !== undefined),
          facts: this.authoritativeFacts(task, index),
          ...(pendingActions.length ? { pending_actions: pendingActions } : {}),
          ...(pendingChoice ? { pending_choice: pendingChoice } : {}),
        };
      }),
    };
  }

  private authoritativeFacts(task: StoredTask, taskRef: number): JsonObject[] {
    const authoritative = task.authoritative ?? {};
    const facts: JsonObject[] = [];
    const add = (
      factType: 'selected_candidate' | 'saved_address' | 'resource_snapshot' | 'quote' | 'booking_state',
      field: string,
      value: unknown,
      resourceVersion?: unknown,
      expiresAt?: unknown,
    ): void => {
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return;
      if (typeof value === 'string' && !value) return;
      facts.push({
        fact_type: factType,
        field,
        value,
        source_task_ref: taskRef,
        ...((typeof resourceVersion === 'string' || typeof resourceVersion === 'number') ? { resource_version: resourceVersion } : {}),
        ...(stringValue(expiresAt) ? { expires_at: stringValue(expiresAt) } : {}),
      });
    };
    if (task.domain === 'food') {
      const context = isRecord(authoritative.food_context) ? authoritative.food_context : isRecord(authoritative.state_updates) ? authoritative.state_updates : {};
      const response = isRecord(authoritative.response) ? authoritative.response : {};
      const data = isRecord(response.data) ? response.data : {};
      const cart = isRecord(authoritative.cart) ? authoritative.cart : isRecord(data.cart) ? data.cart : {};
      add('selected_candidate', 'restaurant_id', context.restaurant_id);
      add('resource_snapshot', 'cart_id', context.cart_id, cart.version);
      add('selected_candidate', 'menu_item_id', context.menu_item_id);
      add('saved_address', 'address_id', context.address_id);
    } else if (task.domain === 'restaurant') {
      const selected = isRecord(authoritative.selected) ? authoritative.selected : {};
      const hold = isRecord(authoritative.hold) ? authoritative.hold : {};
      const availability = isRecord(authoritative.availability) ? authoritative.availability : {};
      const reservation = isRecord(authoritative.reservation) ? authoritative.reservation : {};
      add('selected_candidate', 'restaurant_id', selected.id);
      add('resource_snapshot', 'availability_version', availability.snapshot_id, availability.resource_version ?? availability.version, availability.expires_at);
      add('resource_snapshot', 'hold_id', hold.id, hold.resource_version ?? hold.version, hold.expires_at);
      add('booking_state', 'reservation_id', reservation.id, reservation.resource_version ?? reservation.version);
    } else if (task.domain === 'healthcare') {
      const department = isRecord(authoritative.department) ? authoritative.department : {};
      const selectedSlot = isRecord(authoritative.selectedSlot) ? authoritative.selectedSlot : {};
      const appointment = isRecord(authoritative.appointment) ? authoritative.appointment : {};
      add('selected_candidate', 'department_id', department.id);
      add('selected_candidate', 'slot_id', selectedSlot.id, selectedSlot.resource_version ?? selectedSlot.version, selectedSlot.expires_at);
      add('booking_state', 'appointment_id', appointment.appointment_id ?? appointment.id, appointment.resource_version ?? appointment.version, appointment.expires_at);
    } else {
      const result = isRecord(authoritative.result) ? authoritative.result : {};
      const quote = [authoritative.quote, result.quote].find(isRecord) ?? {};
      const booking = [authoritative.booking, result.booking].find(isRecord) ?? {};
      add('quote', 'quote_id', quote.id, quote.quote_version ?? quote.resource_version, quote.expires_at);
      add('booking_state', 'booking_id', booking.id, booking.resource_version ?? booking.version);
    }
    return facts.slice(0, 32);
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
    const active = current.filter((task) => task.phase !== 'COMPLETED' && task.phase !== 'FAILED' && task.phase !== 'BLOCKED' && task.phase !== 'DISCARDED');
    if (!active.length) return { tasks: planned };
    // The Agent plan is the typed semantic decision. Do not reclassify it with
    // a second keyword classifier in the Gateway; heuristics are only for
    // short follow-up turns where the Agent intentionally returned no tasks.
    if (planned.length) return { tasks: planned };
    const folded = plainText(message);

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
      missing_information: task.missing_information,
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

    const foodSignal = textHasAny(folded, ['pho', 'bun', 'com', 'bat', 'co lon', 'khong cay', 'giao ve', 'giao toi', 'ship', 'dia chi', 'ap ma', 'tong tien', 'xem tong', 'dat luon', 'ga ran', 'ga chien', 'fast food', 'do an nhanh', 'goi y', 'gan day']);
    if (foodSignal && available.has('food')) return ['food'];
    if (textHasAny(folded, ['lich kham', 'bac si', 'kham', 'than kinh']) && available.has('healthcare')) return ['healthcare'];
    if (textHasAny(folded, ['dat ban', 'nha hang', 'so nguoi']) && available.has('restaurant')) return ['restaurant'];
    if (textHasAny(folded, ['dat xe', 'goi xe', 'xe may', 'xe 4 cho', 'xe 7 cho']) && available.has('ride')) return ['ride'];

    if (textHasAny(folded, ['chon cai', 'chon thu', 'chon dau'])) {
      if (candidates.length) return candidates;
      return [...available];
    }
    if (active.length === 1 && (textHasAny(folded, ['nguoi', 'hoan kiem', 'ha noi', 'cau giay', 'tay ho', 'ba dinh', 'sang mai', 'toi nay', 'ngay mai', 'ngay kia', 'dong y', 'xac nhan']) || /\b\d{1,2}\s*(gio|h)\b/.test(folded))) return [active[0].domain];
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
    const savedAddresses = (await this.store.listSavedAddresses(user.sub)).slice(0, 5).map((address) => ({ label: address.label, address_text: address.addressText }));
    const foldedMessage = plainText(message);
    if (textHasAny(foldedMessage, ['huy chuyen', 'huy dat xe', 'huy cuoc', 'huy xe', 'dung dat xe'])) {
      const activeRideIndex = state.tasks.findIndex((t) => t.domain === 'ride' && t.phase !== 'COMPLETED' && t.phase !== 'FAILED' && t.phase !== 'DISCARDED');
      if (activeRideIndex >= 0) {
        const activeRide = state.tasks[activeRideIndex];
        const result = isRecord(activeRide.authoritative?.result) ? activeRide.authoritative.result : undefined;
        const booking = [activeRide.authoritative?.booking, result?.booking].find(isRecord);
        const bookingId = stringValue(booking?.id);
        if (bookingId && !this.rideClient) {
          throw new ServiceUnavailableException({ code: 'RIDE_CLIENT_UNAVAILABLE', detail: 'Ride cancellation is temporarily unavailable.' });
        }
        if (bookingId && this.rideClient) {
          const cancelResult = await this.rideClient.cancelBooking(user.sub, `${correlationId}:cancel`, { correlationId }, bookingId, '{}');
          activeRide.phase = 'COMPLETED';
          activeRide.revision += 1;
          activeRide.authoritative = rideAuthority(cancelResult);
          activeRide.public_item = this.rideItem(cancelResult, activeRide);
          return this.persistTurn(conversationId, user, message, 'Đã hủy chuyến xe thành công.', state, [], state.actions);
        } else {
          activeRide.phase = 'DISCARDED';
          activeRide.revision += 1;
          return this.persistTurn(conversationId, user, message, 'Đã hủy yêu cầu đặt xe.', state, [], state.actions);
        }
      }
    }
    const planner = await this.agent.assistantChat(
      {
        conversation_id: conversationId,
        user_id: user.sub,
        message,
        messages: (current?.messages ?? []).filter(isUserVisibleConversationMessage).slice(-20).map((entry) => ({ role: entry.role, content: entry.content })),
        conversation_state: { ...this.plannerSafeState(state), saved_addresses: savedAddresses },
        user_profile: {
          id: user.id ?? user.sub,
          name: user.full_name ?? '',
          email: user.email,
          saved_addresses: savedAddresses,
        },
        capability_snapshot: CAPABILITY_SNAPSHOT,
        correlation_id: correlationId,
      },
      correlationId,
    );
    this.validateCoreAHandoff(planner);
    const rawPlan = isRecord(planner.plan) ? planner.plan : {};
    const resolution = this.typedPlan(planner);
    const discardedTaskRefs = resolution.discardedTaskRefs;
    const discardResult = this.applyTaskDiscards(state.tasks, discardedTaskRefs);
    const plan: JsonObject = { ...rawPlan, ...(resolution.clarificationQuestion ? { clarification_question: resolution.clarificationQuestion } : {}) };
    const planTasks = resolution.tasks;
    const merge = this.mergeTasks(state.tasks, planTasks, message, resolution.replanDirective);
    for (const taskId of discardResult.discardedIds) merge.touchedIds.add(taskId);
    const merged = merge.tasks;
    if (resolution.confirmationInvalidated) {
      this.invalidateCoreAConfirmations(merged, planTasks, merge.touchedIds);
    }
    const actions: StoredAction[] = state.actions.filter((action) => {
      const task = merged.find((candidate) => candidate.id === action.task_id);
      return Boolean(task && !merge.touchedIds.has(task.id) && action.task_revision === task.revision);
    });
    const items: JsonObject[] = [];
    const completed: JsonObject[] = [];
    const resultsForComposition: JsonObject[] = [];

    if (resolution.interactionMode !== 'service' && !planTasks.length && !discardResult.discardedIds.size) {
      const candidateMessage = safeText(
        plan.assistant_message,
        'Mình vẫn ở đây và sẵn sàng trò chuyện cùng bạn.',
      );
      const conversationalMessage = hasUnsupportedFinalSuccessClaim(candidateMessage, merged)
        ? 'Mình vẫn ở đây và sẵn sàng trò chuyện cùng bạn.'
        : candidateMessage;
      const conversationalState: AssistantState = {
        ...state,
        tasks: merged.slice(0, 8),
        actions,
        decision_source: stringValue(planner.decision_source) ?? 'deterministic',
      };
      return this.persistTurn(
        conversationId,
        user,
        message,
        conversationalMessage,
        conversationalState,
        [],
        actions,
        [],
        [],
      );
    }

    if (!planTasks.length && !discardResult.discardedIds.size && stringValue(plan.clarification_question)) {
      // Clarification is informational only: retain every task, revision,
      // authoritative choice, and public action exactly as persisted.
      return this.persistTurn(conversationId, user, message, safeText(plan.clarification_question, 'Bạn cho mình biết thêm một chút thông tin nhé?'), state, [], state.actions);
    }
    if (stringValue(plan.clarification_question)) {
      const clarificationState: AssistantState = {
        ...state,
        tasks: merged.slice(0, 8),
        actions,
        decision_source: stringValue(planner.decision_source) ?? 'deterministic',
      };
      return this.persistTurn(
        conversationId,
        user,
        message,
        safeText(plan.clarification_question, 'Bạn cho mình biết thêm một chút thông tin nhé?'),
        clarificationState,
        [],
        actions,
      );
    }

    for (const task of merged) {
      if (task.phase === 'DISCARDED') continue;
      if (task.phase === 'COMPLETED' && task.public_item) {
        completed.push(task.public_item);
        continue;
      }
      if (!merge.touchedIds.has(task.id)) {
        if (task.public_item) {
          if (task.phase === 'FAILED') {
            const isActiveDomain = merged.some((candidate) => candidate.domain === task.domain && merge.touchedIds.has(candidate.id));
            const isSoleTask = merged.length === 1;
            const hasDependents = merged.some((candidate) => candidate.depends_on?.includes(task.id));
            if (isActiveDomain || isSoleTask || hasDependents) {
              items.push(task.public_item);
            }
          } else {
            items.push(task.public_item);
          }
        }
        continue;
      }
      if (hasFailedDependency(task, merged)) {
        const publicItem = buildTaskErrorItem('DEPENDENCY_BLOCKED', false);
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
        const publicItem = buildTaskErrorItem(code, assistantActionFailureStatus(error) === 'FAILED_RETRYABLE');
        task.phase = 'FAILED';
        task.failure_code = code;
        task.public_item = publicItem;
        items.push(publicItem);
        resultsForComposition.push(publicItem);
      }
    }
    this.propagateDependencyFailures(merged);

    actions.sort((left, right) => {
      const leftIndex = merged.findIndex((task) => task.id === left.task_id);
      const rightIndex = merged.findIndex((task) => task.id === right.task_id);
      return leftIndex - rightIndex;
    });

    const foodTask = merged.find((task) => task.domain === 'food' && task.phase !== 'DISCARDED');
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
    const activeTasks = merged.filter((task) => task.phase !== 'DISCARDED');
    const composed = planner.decision_source === 'deterministic'
      ? baseMessage
      : await this.compose(message, conversationId, user.sub, activeTasks, resultsForComposition, correlationId, baseMessage);
    const finalMessage = this.withDiscardAcknowledgement(composed, discardResult.domains, planTasks.length > 0);
    const response = await this.persistTurn(conversationId, user, message, finalMessage, nextState, items, actions, completed);
    return response;
  }

  async act(
    user: AuthUser,
    request: AssistantActionRequest,
    correlationId: string,
    idempotencyKey: string,
  ): Promise<AssistantResponse> {
    const requestHash = stableHash({ conversation_id: request.conversation_id, action_id: request.action_id, ...(request.quantity !== undefined ? { quantity: request.quantity } : {}) });
    const conversation = await this.store.getConversation(request.conversation_id, user.sub);
    if (!conversation) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', detail: 'Không tìm thấy cuộc trò chuyện.' });
    const state = storedState(conversation.state);
    const action = state.actions.find((candidate) => candidate.id === request.action_id);
    const previousExecution = await this.getAssistantActionExecution(user.sub, request.conversation_id, request.action_id);
    let executionIdempotencyKey = idempotencyKey;
    if (previousExecution) {
      if (previousExecution.requestHash !== requestHash) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Mã yêu cầu đã được dùng cho một lựa chọn khác.' });
      if (previousExecution.status === 'SUCCEEDED') {
        if (previousExecution.idempotencyKey !== idempotencyKey) {
          throw new ConflictException({ code: 'ACTION_NOT_AVAILABLE', detail: 'Lựa chọn này không còn hiệu lực.' });
        }
        if (previousExecution.response) return previousExecution.response as unknown as AssistantResponse;
      }
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
      const effectiveAction = action.kind === 'select_food_item' && request.quantity !== undefined
        ? { ...action, quantity: request.quantity }
        : action;
      const preservesFoodSiblings = effectiveAction.kind === 'select_food_item';
      if (!preservesFoodSiblings) task.revision += 1;
      const result = await this.executeAction(effectiveAction, task, user, request.conversation_id, correlationId, executionIdempotencyKey);
      task.phase = result.phase;
      task.authoritative = result.authoritative ?? task.authoritative;
      task.public_item = result.publicItem ?? task.public_item;
      state.actions = preservesFoodSiblings
        ? state.actions.filter((candidate) => candidate.id !== action.id && !(candidate.task_id === task.id && isFoodCartAction(candidate.kind)))
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
          const publicItem = buildTaskErrorItem('DEPENDENCY_BLOCKED', false);
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
          const publicItem = buildTaskErrorItem(code, assistantActionFailureStatus(error) === 'FAILED_RETRYABLE');
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
        result.publicItem && (result.phase === 'COMPLETED' || action.kind === 'ride_payment') ? [result.publicItem] : [],
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
        const publicItem = buildTaskErrorItem(code, false);
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
    const message = code === 'PATIENT_LINK_REQUIRED'
      ? 'Bạn cần liên kết hồ sơ người bệnh trước khi chọn lịch khám. Mở Hồ sơ người bệnh để thêm hoặc chọn hồ sơ mặc định, rồi gửi lại yêu cầu đặt lịch.'
      : code === 'SELECTION_EXPIRED' || code === 'STALE_ACTION'
      ? 'Lựa chọn này không còn hiệu lực. Bạn chọn lại trong danh sách hiện tại nhé.'
      : ['APPOINTMENT_EXPIRED', 'SLOT_UNAVAILABLE', 'SLOT_ALREADY_HELD'].includes(code)
        ? 'Khung giờ này không còn trống. Mình đã cập nhật các lựa chọn để bạn chọn lại nhé.'
        : 'Mình chưa thể hoàn tất lựa chọn này. Bạn thử lại với thông tin hiện tại nhé.';
    const item: JsonObject = buildTaskErrorItem(code, false, { note: message });
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
      throw new UnprocessableEntityException({
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
      const candidate = safeText(response.assistant_message, fallback);
      return hasUnsupportedFinalSuccessClaim(candidate, tasks)
        ? safeText(fallback, 'Mình đã cập nhật các lựa chọn và bước xác nhận tiếp theo cho bạn.')
        : candidate;
    } catch {
      return safeText(fallback, 'Mình đã cập nhật thông tin cho bạn.');
    }
  }

  private canDiscardConversationTask(task: StoredTask): boolean {
    if (task.phase === 'PLANNING' || task.phase === 'NEEDS_INFO') return true;
    if (task.phase !== 'IN_PROGRESS') return false;
    if (task.domain === 'ride') {
      const result = isRecord(task.authoritative?.result) ? task.authoritative.result : undefined;
      const booking = [task.authoritative?.booking, result?.booking].find(isRecord);
      const status = stringValue(booking?.status);
      return !status || ['AWAITING_CONFIRMATION', 'AWAITING_PAYMENT_CONFIRMATION'].includes(status);
    }
    if (task.domain === 'food') {
      const result = isRecord(task.authoritative?.result) ? task.authoritative.result : undefined;
      const order = isRecord(result?.order) ? result.order : undefined;
      return !order && stringValue(task.public_item?.kind) !== 'food_order';
    }
    return true;
  }

  private applyTaskDiscards(tasks: StoredTask[], taskRefs: number[]): DiscardResult {
    if (taskRefs.some((taskRef) => taskRef < 0 || taskRef >= tasks.length)) {
      throw new ServiceUnavailableException({
        code: 'AGENT_CONTEXT_ACTION_REJECTED',
        detail: 'Agent context action does not reference a current conversation task.',
      });
    }
    const discardedIds = new Set<string>();
    const domains = new Set<Domain>();
    for (const taskRef of taskRefs) {
      const root = tasks[taskRef];
      if (!root || discardedIds.has(root.id)) continue;
      const group = new Set<string>([root.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const candidate of tasks) {
          if (
            candidate.phase !== 'COMPLETED'
            && candidate.phase !== 'FAILED'
            && candidate.phase !== 'BLOCKED'
            && candidate.phase !== 'DISCARDED'
            && candidate.depends_on.some((dependency) => group.has(dependency))
            && !group.has(candidate.id)
          ) {
            group.add(candidate.id);
            changed = true;
          }
        }
      }
      const groupTasks = tasks.filter((task) => group.has(task.id));
      if (!groupTasks.length || groupTasks.some((task) => !this.canDiscardConversationTask(task))) continue;
      for (const task of groupTasks) {
        task.phase = 'DISCARDED';
        task.revision += 1;
        task.missing_information = [];
        task.failure_code = undefined;
        task.blocking_task_id = undefined;
        task.block_reason = undefined;
        discardedIds.add(task.id);
        domains.add(task.domain);
      }
    }
    return {
      discardedIds,
      domains: (['food', 'restaurant', 'healthcare', 'ride'] as Domain[]).filter((domain) => domains.has(domain)),
    };
  }

  private invalidateCoreAConfirmations(tasks: StoredTask[], planned: AgentPlanTask[], touchedIds: Set<string>): void {
    const domains = new Set(planned.map((task) => task.domain).filter((domain): domain is Domain => domain === 'food' || domain === 'ride' || domain === 'restaurant' || domain === 'healthcare'));
    for (const task of tasks) {
      if (!domains.has(task.domain) || task.phase === 'COMPLETED' || task.phase === 'DISCARDED') continue;
      if (!touchedIds.has(task.id)) task.revision += 1;
      touchedIds.add(task.id);
      if (task.phase === 'AWAITING_CONFIRMATION') task.phase = 'PLANNING';
      task.public_item = undefined;
      if (task.authoritative) {
        const { pending: _pending, ...safeAuthority } = task.authoritative;
        task.authoritative = safeAuthority;
      }
    }
  }

  private mergeTasks(current: StoredTask[], planned: AgentPlanTask[], latestMessage: string, replanDirective?: ReplanDirective): MergeResult {
    const next = current.map((task) => ({ ...task, extracted_slots: { ...task.extracted_slots } }));
    const touchedIds = new Set<string>();
    const plannedIds: string[] = [];
    for (const candidate of planned.slice(0, 4)) {
      const domain = candidate.domain;
      if (domain !== 'ride' && domain !== 'food' && domain !== 'restaurant' && domain !== 'healthcare') continue;
      const request = stringValue(candidate.normalized_request) ?? '';
      const retrySameKey = replanDirective === 'WAIT_AND_RETRY_SAME_KEY';
      const sameRequest = next.find((task) => task.domain === domain && task.phase !== 'COMPLETED' && (retrySameKey || task.phase !== 'FAILED') && task.phase !== 'BLOCKED' && task.phase !== 'DISCARDED' && (!request || task.normalized_request === request));
      // A new destination or pickup is an update to the active journey, not a
      // second ride request. Other domains retain their request-based merge.
      const activeRide = domain === 'ride'
        ? next.find((task) => task.domain === 'ride' && task.phase !== 'COMPLETED' && (retrySameKey || task.phase !== 'FAILED') && task.phase !== 'BLOCKED' && task.phase !== 'DISCARDED')
        : undefined;
      const match = sameRequest ?? activeRide ?? (planned.length === 1
        ? next.find((task) => task.domain === domain && task.phase !== 'COMPLETED' && (retrySameKey || task.phase !== 'FAILED') && task.phase !== 'BLOCKED' && task.phase !== 'DISCARDED')
        : undefined);
      const slots = sanitizedSlots(candidate.extracted_slots);
      const requestedPhase: TaskPhase | undefined = candidate.disposition === 'BLOCKED'
        ? 'BLOCKED'
        : candidate.disposition === 'FAILED'
          ? 'FAILED'
          : candidate.disposition === 'NEEDS_INFO' || candidate.disposition === 'WAITING'
            ? 'NEEDS_INFO'
            : retrySameKey
              ? 'PLANNING'
              : undefined;
      if (match) {
        const nextSlots = { ...match.extracted_slots, ...slots };
        const changed = !sameJson(match.extracted_slots, nextSlots);
        const stepChanged = !sameJson(match.planned_step, candidate.planned_step);
        const foodContinuation = domain === 'food' && match.phase !== 'COMPLETED';
        const phaseChanged = requestedPhase !== undefined && requestedPhase !== match.phase;
        if (changed || stepChanged || foodContinuation || phaseChanged) {
          const exactSameKeyRetry = retrySameKey && !changed && !stepChanged;
          if (!exactSameKeyRetry) match.revision += 1;
          if (changed) this.resetTaskForRevision(match, nextSlots);
          else if (stepChanged) match.phase = 'PLANNING';
          touchedIds.add(match.id);
          match.extracted_slots = nextSlots;
          match.latest_message = latestMessage;
        }
        if (requestedPhase !== undefined) match.phase = requestedPhase;
        match.goal = stringValue(candidate.goal) ?? match.goal;
        match.normalized_request = request || match.normalized_request;
        match.missing_information = arrayValue(candidate.missing_information) as string[];
        match.planned_step = candidate.planned_step;
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
        phase: requestedPhase ?? 'PLANNING',
        revision: 0,
        latest_message: latestMessage,
        missing_information: arrayValue(candidate.missing_information).filter((value): value is string => typeof value === 'string'),
        ...(candidate.planned_step ? { planned_step: candidate.planned_step } : {}),
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
    task.blocking_task_id = undefined;
    task.block_reason = undefined;
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
    const planned = task.planned_step;
    if (planned?.step_kind === 'WAIT_FOR_CONFIRMATION') {
      return {
        phase: 'AWAITING_CONFIRMATION',
        authoritative: task.authoritative,
        publicItem: task.public_item,
      };
    }
    if (planned) {
      const definition = CAPABILITY_DEFINITIONS.find((item) => item.name === planned.capability);
      if (
        !definition
        || definition.domain !== task.domain
        || definition.schema_version !== planned.schema_version
        || definition.risk_level !== planned.risk_ceiling
        || definition.confirmation_gate !== planned.confirmation_gate
      ) {
        throw new ServiceUnavailableException({ code: 'CORE_A_DISPATCH_REJECTED', detail: 'Persisted Core A capability metadata is invalid.' });
      }
      const authorityAvailable = planned.requires_authority.every((requirement) => {
        const sourceRef = numberValue(requirement.source_task_ref);
        const sourceTask = sourceRef === undefined ? task : allTasks[sourceRef];
        if (!sourceTask) return false;
        const fact = this.authoritativeFacts(sourceTask, sourceRef ?? allTasks.indexOf(sourceTask))
          .find((candidate) => candidate.field === requirement.fact);
        if (!fact) return false;
        if (requirement.required_version === true && fact.resource_version === undefined) return false;
        if (requirement.must_be_unexpired === true) {
          const expiry = stringValue(fact.expires_at);
          if (!expiry || Number.isNaN(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()) return false;
        }
        return true;
      });
      if (!authorityAvailable) {
        return {
          phase: 'NEEDS_INFO',
          authoritative: task.authoritative,
          publicItem: { kind: 'clarification', question: 'Thông tin xác thực đã thiếu hoặc hết hạn. Mình cần tải lại trước khi tiếp tục.' },
        };
      }
    }

    let result: TaskProcessResult;
    if (task.domain === 'restaurant') result = await this.processRestaurant(task, user, conversationId, correlationId);
    else if (task.domain === 'ride') result = await this.processRide(task, allTasks, user, conversationId, correlationId);
    else if (task.domain === 'healthcare') result = await this.processHealthcare(task, user, conversationId, correlationId);
    else result = await this.processFood(task, user, conversationId, correlationId);
    if (!planned?.capability) return result;
    return {
      ...result,
      authoritative: {
        ...(result.authoritative ?? {}),
        core_a_dispatch: {
          capability: planned.capability,
          schema_version: planned.schema_version,
          risk_ceiling: planned.risk_ceiling,
          confirmation_gate: planned.confirmation_gate,
        },
      },
    };
  }

  private async processRestaurant(task: StoredTask, user: AuthUser, conversationId: string, correlationId: string): Promise<TaskProcessResult> {
    const slots = task.extracted_slots;
    const location = stringValue(slots.location);
    const cuisineType = stringValue(slots.cuisine_type);
    const budgetRange = stringValue(slots.budget_range);
    const partySize = numberValue(slots.party_size);
    const startAt = stringValue(slots.start_at);
    const cuisineQuery = cuisineType ?? stringValue(slots.cuisine_query) ?? stringValue(slots.cuisine);
    const existing = task.authoritative;
    const selection = stringValue(slots.selection);
    const existingSelected = isRecord(existing?.selected);
    const discoveryMissing = !location && !cuisineQuery;
    const bookingDetailsMissing = Boolean(selection || existingSelected) && (!partySize || !startAt);
    if (discoveryMissing || bookingDetailsMissing) {
      const missing = [discoveryMissing ? 'khu vực hoặc loại món' : '', !partySize && (selection || existingSelected) ? 'số người' : '', !startAt && (selection || existingSelected) ? 'thời gian' : ''].filter(Boolean);
      const question = missing.length === 1 && missing[0] === 'thời gian'
        ? 'Bạn muốn đặt bàn lúc mấy giờ?'
        : `Bạn cho mình biết ${missing.join(' và ')} nhé?`;
      return { phase: 'NEEDS_INFO' as TaskPhase, items: [{ kind: 'clarification', question }] };
    }
    const startAtMilliseconds = Date.parse(startAt ?? '');
    if (Number.isFinite(startAtMilliseconds) && startAtMilliseconds <= Date.now()) {
      return {
        phase: 'NEEDS_INFO' as TaskPhase,
        items: [{ kind: 'clarification'}],
      };
    }
    const candidates = arrayValue(existing?.candidates).filter(isRecord);
    let selected = isRecord(existing?.selected) ? existing.selected : undefined;
    const requestedIndex = selectionIndexFromText(task.latest_message, candidates);
    if (!selected && selection) selected = candidates[selectionIndex(selection) ?? 0];
    if (!selected && requestedIndex !== undefined) selected = candidates[requestedIndex];
    if (!candidates.length) {
      const result = await this.restaurant.executeTool({
        tool_name: 'restaurant.search',
        risk_level: 'READ',
        arguments: {
          location,
          limit: 20,
          ...(cuisineQuery ? { cuisine_type: cuisineQuery } : {}),
          ...(budgetRange ? { budget_range: budgetRange } : {}),
        },
        workflow_id: task.workflow_id ?? `wf_${conversationId}_${task.id}`,
        tool_call_id: `call_${randomUUID()}`,
        schema_version: '1',
      }, user.sub, correlationId);
      let list = this.resultItems(result);
      let fallbackReason: 'location' | 'cuisine' | 'broad' | undefined;
      if (!list.length && cuisineQuery) {
        const locationFallback = await this.restaurant.executeTool({
          tool_name: 'restaurant.search',
          risk_level: 'READ',
          arguments: { location, limit: 20 },
          workflow_id: task.workflow_id ?? `wf_${conversationId}_${task.id}`,
          tool_call_id: `call_${randomUUID()}`,
          schema_version: '1',
        }, user.sub, correlationId);
        list = this.resultItems(locationFallback);
        if (list.length) fallbackReason = 'location';
      }
      if (!list.length && cuisineQuery) {
        const cuisineFallback = await this.restaurant.executeTool({
          tool_name: 'restaurant.search',
          risk_level: 'READ',
          arguments: { cuisine_type: cuisineQuery, limit: 20 },
          workflow_id: task.workflow_id ?? `wf_${conversationId}_${task.id}`,
          tool_call_id: `call_${randomUUID()}`,
          schema_version: '1',
        }, user.sub, correlationId);
        list = this.resultItems(cuisineFallback);
        if (list.length) fallbackReason = 'cuisine';
      }
      if (!list.length) {
        const broadFallback = await this.restaurant.executeTool({
          tool_name: 'restaurant.search',
          risk_level: 'READ',
          arguments: { limit: 20 },
          workflow_id: task.workflow_id ?? `wf_${conversationId}_${task.id}`,
          tool_call_id: `call_${randomUUID()}`,
          schema_version: '1',
        }, user.sub, correlationId);
        list = this.resultItems(broadFallback);
        if (list.length) fallbackReason = 'broad';
      }
      list = prioritizeRestaurantCandidates(list);
      const publicItem = this.restaurantOptions(list);
      if (fallbackReason) {
        publicItem.note = fallbackReason === 'location'
          ? 'Mình chưa tìm thấy kết quả khớp hoàn toàn với ưu tiên món ăn này; dưới đây là các nhà hàng phù hợp trong khu vực để bạn chọn.'
          : fallbackReason === 'cuisine'
            ? 'Mình chưa lọc được đúng khu vực bạn yêu cầu; dưới đây là các nhà hàng có cùng ưu tiên món ăn từ dữ liệu hiện có.'
            : 'Mình chưa lọc được đúng khu vực và ưu tiên món ăn; dưới đây là các nhà hàng hiện có để bạn chọn.';
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
      const alternativeOptions = alternatives.map((candidate) => ({
        ...this.publicRestaurant(candidate),
        target_index: candidates.indexOf(candidate),
      }));
      const publicItem = { kind: 'restaurant_unavailable', restaurant: this.publicRestaurant(selected), alternatives: alternatives.map((candidate) => this.publicRestaurant(candidate)) };
      (publicItem as JsonObject).options = alternativeOptions;
      (publicItem as JsonObject).note = alternatives.length
        ? 'Bạn có thể chọn một nhà hàng khác trong cùng khu vực để giữ nguyên thời gian và số khách.'
        : 'Bạn hãy thử một thời gian khác; mình sẽ kiểm tra lại số bàn còn trống.';
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
    const holdExpiresAt = publicDateTime(hold.expires_at);
    const publicStartAt = publicDateTime(startAt);
    if (!holdExpiresAt || !publicStartAt) {
      throw new ConflictException({ code: 'HOLD_RESULT_INVALID', detail: 'The restaurant hold did not include valid timestamps.' });
    }
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
    const publicItem = { kind: 'restaurant_confirmation', restaurant: this.publicRestaurant(selected), party_size: partySize, start_at: publicStartAt, expires_at: holdExpiresAt};
    const action = this.actionFor(task, 'restaurant_confirm', { confirmation_id: String(pending.id), workflow_id: tool.workflow_id });
    return { phase: 'AWAITING_CONFIRMATION' as TaskPhase, authoritative: { ...existing, selected, availability, hold, pending }, publicItem, items: [publicItem], actions: [action], workflowId: tool.workflow_id };
  }

  private async addressOptionsItem(userId: string, purpose: "PICKUP" | "DROPOFF" | "DELIVERY"): Promise<JsonObject> {
    const addresses = (await this.store.listSavedAddresses(userId)).slice(0, 5).map((address) => ({ label: address.label, address_text: address.addressText, is_default: address.isDefault }));
    const label = purpose === "PICKUP" ? "điểm đón" : purpose === "DROPOFF" ? "điểm đến" : "địa chỉ giao hàng";
    return { kind: "address_options", title: `Chọn ${label}`, purpose, addresses, allow_new: true, note: `Bạn có thể chọn ${label} đã lưu hoặc nhập một địa chỉ mới cụ thể.` };
  }

  private async processRide(task: StoredTask, allTasks: StoredTask[], user: AuthUser, conversationId: string, correlationId: string): Promise<TaskProcessResult> {
    const authoritativeResult = isRecord(task.authoritative?.result) ? task.authoritative.result : undefined;
    const existingBooking = [task.authoritative?.booking, authoritativeResult?.booking].find(isRecord);
    const existingBookingId = stringValue(existingBooking?.id);
    if (existingBookingId && !this.rideClient) {
      throw new ServiceUnavailableException({ code: 'RIDE_CLIENT_UNAVAILABLE', detail: 'Ride status verification is temporarily unavailable.' });
    }
    if (existingBookingId && this.rideClient) {
      try {
        const liveBooking = await this.rideClient.getBooking(user.sub, { correlationId }, existingBookingId);
        if (isTerminalRideBookingStatus(liveBooking.status)) {
          return { phase: 'COMPLETED' as TaskPhase, publicItem: this.rideItem({ booking: liveBooking }, task), authoritative: rideAuthority({ booking: liveBooking }) };
        }
      } catch (error) {
        // Ignore errors and proceed
      }
    }
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
      return { phase: 'IN_PROGRESS' as TaskPhase, items: [{ kind: 'progress'}] };
    }
    if (dependency) {
      const selected = dependency.authoritative?.selected;
      const destination = stringValue(selected && isRecord(selected) ? selected.location : undefined);
      if (destination) slots.dropoff_address = destination;
    }
    if (healthcareDependency) {
      if (!dependentHealthcareAppointment) {
        return { phase: 'IN_PROGRESS' as TaskPhase, items: [{ kind: 'progress'}] };
      }
      const facility = isRecord(dependentHealthcareAppointment.facility) ? dependentHealthcareAppointment.facility : undefined;
      // A model-proposed destination is never accepted for this dependency.
      // Only the Healthcare response can supply the facility address.
      delete slots.dropoff_address;
      const facilityAddress = stringValue(facility?.address);
      healthcareFacility = facility;
      if (facilityAddress) slots.dropoff_address = facilityAddress;
    }
    let pickup = stringValue(slots.pickup_address);
    let dropoff = stringValue(slots.dropoff_address);
    const savedAddresses = await this.store.listSavedAddresses(user.sub);
    const sortedAddresses = [...savedAddresses].sort((a, b) => (b.label?.length ?? 0) - (a.label?.length ?? 0));
    if (pickup) {
      const match = sortedAddresses.find((a) => plainText(pickup!).includes(plainText(a.label)));
      if (match) pickup = match.addressText;
    }
    if (dropoff) {
      const match = sortedAddresses.find((a) => plainText(dropoff!).includes(plainText(a.label)));
      if (match) dropoff = match.addressText;
    }
    // Update slots so the resolved address persists
    if (pickup) slots.pickup_address = pickup;
    if (dropoff) slots.dropoff_address = dropoff;
    const passengerCount = numberValue(slots.passenger_count) ?? 1;
    if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 20) {
      return { phase: 'NEEDS_INFO' as TaskPhase, items: [{ kind: 'clarification'}] };
    }
    if (!pickup || !dropoff || dropoff.toLowerCase() === 'nhà hàng đó') {
      if (!pickup) return { phase: 'NEEDS_INFO' as TaskPhase, items: [await this.addressOptionsItem(user.sub, 'PICKUP')] };
      if (!dropoff) return { phase: 'NEEDS_INFO' as TaskPhase, items: [await this.addressOptionsItem(user.sub, 'DROPOFF')] };
      if (healthcareDependency) {
        const publicItem = {
          kind: 'ride_timing_conflict',
          };
        return { phase: 'FAILED' as TaskPhase, authoritative: { appointment: dependentHealthcareAppointment }, publicItem, items: [publicItem] };
      }
      return { phase: 'NEEDS_INFO' as TaskPhase, items: [{ kind: 'clarification'}] };
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
      || numberValue(previousQuote.passenger_count) !== passengerCount
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
    const request = `Đặt xe từ ${pickup} đến ${dropoff}${slots.vehicle_type === 'BIKE' ? ' bằng xe máy' : slots.vehicle_type === 'CAR_4' ? ' bằng xe 4 chỗ' : slots.vehicle_type === 'CAR_7' ? ' bằng xe 7 chỗ' : ''} cho ${passengerCount} người`;
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
        const publicItem = { kind: 'ride_timing_conflict'};
        return { phase: 'FAILED' as TaskPhase, authoritative: rideAuthority(result, { quote }), publicItem, items: [publicItem], workflowId: result.workflow_id };
      }
      const appointmentStart = parseAuthoritativeDate(heldAppointment.start_time ?? (isRecord(heldAppointment.slot) ? heldAppointment.slot.start_time : undefined));
      const durationMinutes = numberValue(quote.duration_minutes);
      if (!appointmentStart || durationMinutes === undefined) {
        const publicItem = {
          kind: 'ride_timing_conflict',
          };
        return { phase: 'FAILED' as TaskPhase, authoritative: rideAuthority(result, { quote, appointment: heldAppointment }), publicItem, items: [publicItem], workflowId: result.workflow_id };
      }
      const recommendedDeparture = new Date(appointmentStart.getTime() - (durationMinutes + HEALTHCARE_RIDE_DEPARTURE_BUFFER_MINUTES) * 60_000);
      if (appointmentStart.getTime() <= Date.now() || recommendedDeparture.getTime() <= Date.now()) {
        const publicItem = {
          kind: 'ride_timing_conflict',
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
    const publicItem = quote ? this.rideItem({ quote }, task) : { kind: 'progress'};
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
      const publicItem = { kind: 'healthcare_options', departments: departments.map((item) => ({ name: item.name, description: item.description })) };
      return { phase: 'NEEDS_INFO' as TaskPhase, authoritative: { departments }, publicItem, items: [publicItem], workflowId };
    }
    const existing = task.authoritative;
    const doctors = arrayValue(existing?.doctors).filter(isRecord);
    if (!doctors.length || existing?.department !== department) {
      const result = await this.healthcare.executeTool({ tool_name: 'healthcare.list_slots', risk_level: 'READ', arguments: { department }, workflow_id: workflowId, tool_call_id: `call_${randomUUID()}`, schema_version: '1' }, user.sub, correlationId);
      const availableDoctors = this.resultItems(result).filter((doctor) => arrayValue(doctor.available_slots).some(isRecord));
      const requestedDoctors = filterDoctorsByRequestedTime(availableDoctors, slots);
      const requestedStart = requestedHealthcareStart(slots);
      const requestedDate = requestedHealthcareDate(slots);
      const exactRequested = hasExactHealthcareSlot(requestedDoctors, requestedStart);
      const doctorsForSelection = requestedDoctors.length ? requestedDoctors : availableDoctors;
      const publicItem = doctorsForSelection.length > 0
        ? this.healthcareOptions(doctorsForSelection, task.id)
        : {
          kind: 'healthcare_no_availability',
          note: requestedStart
            ? 'Mình không tự đổi giờ bạn yêu cầu. Dưới đây là các khung giờ khác từ dữ liệu lịch hiện có để bạn chọn nếu phù hợp.'
            : 'Mình chưa thấy lịch phù hợp với buổi bạn muốn. Dưới đây là các khung giờ từ dữ liệu lịch hiện có để bạn chọn.',
          options: this.healthcareOptionRows(doctorsForSelection),
        };
      const selectionActions = this.healthcareSelectionActions(doctorsForSelection, task);
      return {
        phase: doctorsForSelection.length ? 'NEEDS_INFO' as TaskPhase : 'FAILED' as TaskPhase,
        authoritative: { department, doctors: doctorsForSelection, requested_start_at: slots.start_at, requested_date: requestedDate, time_preference: slots.time_preference, matching_mode: requestedStart ? (exactRequested ? 'exact' : 'nearest') : (requestedDate ? 'date' : (slots.time_preference ? 'daypart' : 'available')) },
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
    const publicAppointment = isRecord(appointment) ? this.publicHealthcareAppointment(appointment) : {};
    const alternativeSlots = this.healthcareOptionRows(doctors, numberValue(selectedSlot.id));
    const publicItem = {
      kind: 'appointment',
      resource_id: appointmentId,
      ...publicAppointment,
      ...(alternativeSlots.length ? { alternative_slots: alternativeSlots } : {}),
      note: alternativeSlots.length
        ? 'Bạn có thể đổi sang khung giờ khác trước khi thanh toán.'
        : 'Bạn xác nhận thanh toán trước khi hoàn tất lịch khám.',
    };
    const action = this.actionFor(task, 'healthcare_payment', { appointment_id: appointmentId, workflow_id: workflowId });
    const cancelAction = this.actionFor(task, 'healthcare_cancel', { appointment_id: appointmentId, workflow_id: workflowId });
    const changeActions = this.healthcareSelectionActions(doctors, task, numberValue(selectedSlot.id), appointmentId);
    return { phase: 'AWAITING_CONFIRMATION' as TaskPhase, authoritative: { department, doctors, selectedSlot, appointment }, publicItem, items: [publicItem], actions: [action, cancelAction, ...changeActions], workflowId };
  }

  private async dispatchFoodProposals(
    values: JsonObject[],
    context: JsonObject,
    selectedCandidate: JsonObject | undefined,
    user: AuthUser,
    correlationId: string,
    workflowId: string,
    trustedExecutionScope: string,
    expectedCapability?: string,
  ): Promise<{ data: JsonObject; stateUpdates: JsonObject; pending?: JsonObject }> {
    if (!this.tools) throw new ServiceUnavailableException({ code: 'GATEWAY_DISPATCH_UNAVAILABLE', detail: 'Gateway proposal dispatcher is unavailable.' });
    if (expectedCapability && !values.some((value) => value.capability_name === expectedCapability)) {
      throw new UnprocessableEntityException({
        code: 'CORE_A_PROPOSAL_MISMATCH',
        detail: 'Food proposals do not contain the capability selected by Core A.',
      });
    }
    const stateUpdates: JsonObject = {};
    let data: JsonObject = {};
    let pending: JsonObject | undefined;
    let cartId = stringValue(context.cart_id);
    let menuItemId = stringValue(selectedCandidate?.id) ?? stringValue(context.menu_item_id);
    let restaurantId = stringValue(selectedCandidate?.restaurant_id) ?? stringValue(context.restaurant_id);
    let addressId = stringValue(context.address_id);
    let selectedOptions: JsonObject[] = [];

    for (const [proposalIndex, value] of values.entries()) {
      const proposal = value as unknown as ToolProposal;
      const semantic = isRecord(value.semantic_arguments) ? value.semantic_arguments : {};
      const name = stringValue(value.capability_name) ?? '';
      let args: JsonObject;
      if (name === 'search_food') {
        args = {};
        for (const key of ['keyword', 'district', 'category', 'max_price']) {
          if (semantic[key] !== undefined) args[key] = semantic[key];
        }
      } else if (name === 'view_menu_item') {
        if (!menuItemId) throw new ConflictException({ code: 'FOOD_SELECTION_REQUIRED', detail: 'A current Food selection is required.' });
        args = { menu_item_id: menuItemId };
      } else if (name === 'create_cart') {
        if (!restaurantId) throw new ConflictException({ code: 'FOOD_SELECTION_REQUIRED', detail: 'A current restaurant selection is required.' });
        args = { restaurant_id: restaurantId };
      } else if (name === 'add_to_cart') {
        if (!cartId || !menuItemId) throw new ConflictException({ code: 'FOOD_SELECTION_REQUIRED', detail: 'Current cart and menu item selections are required.' });
        args = { cart_id: cartId, menu_item_id: menuItemId, quantity: numberValue(semantic.quantity) ?? 1, selected_options: selectedOptions };
      } else if (name === 'list_food_delivery_addresses') {
        args = { ...(stringValue(semantic.label) ? { label: stringValue(semantic.label) } : {}) };
      } else if (name === 'quote_delivery') {
        if (!restaurantId || !addressId) break;
        args = { restaurant_id: restaurantId, address_id: addressId };
      } else if (name === 'preview_order' || name === 'prepare_food_order_confirmation') {
        if (!cartId || !addressId) break;
        args = { cart_id: cartId, address_id: addressId };
      } else {
        throw new UnprocessableEntityException({ code: 'UNSUPPORTED_TOOL_PROPOSAL', detail: 'The proposed Food capability is not supported by this flow.' });
      }

      const executed = await this.tools.executeProposal(
        proposal,
        args,
        user,
        correlationId,
        workflowId,
        `${trustedExecutionScope}:p${proposalIndex}`,
      );
      if (name === 'search_food') {
        const rows = (Array.isArray(executed) ? executed : arrayValue(executed.items)).filter(isRecord);
        const restaurants: JsonObject[] = [];
        const items: JsonObject[] = [];
        for (const row of rows) {
          const restaurant = isRecord(row.restaurant) ? row.restaurant : {};
          const item = isRecord(row.item) ? row.item : row;
          if (stringValue(restaurant.id) && !restaurants.some((entry) => entry.id === restaurant.id)) restaurants.push(restaurant);
          if (stringValue(item.id)) items.push({ ...item, ...(stringValue(item.restaurant_id ?? restaurant.id) ? { restaurant_id: item.restaurant_id ?? restaurant.id } : {}), ...(Object.keys(restaurant).length ? { restaurant } : {}) });
        }
        stateUpdates.restaurant_candidates = restaurants;
        stateUpdates.menu_item_candidates = items;
        data = { items: rows };
      } else if (name === 'view_menu_item') {
        const groups = arrayValue(executed.option_groups).filter(isRecord);
        const preferences = arrayValue(semantic.option_preferences).filter(isRecord);
        selectedOptions = groups.filter((group) => group.required).flatMap((group) => {
          const options = arrayValue(group.options).filter(isRecord);
          const matched = options.find((option) => preferences.some((preference) => plainText(String(preference.value ?? '')).includes(plainText(String(option.name ?? '')))));
          const option = matched ?? options[0];
          return option && group.id !== undefined && option.id !== undefined ? [{ group_id: String(group.id), option_id: String(option.id) }] : [];
        });
      } else if (name === 'create_cart') {
        cartId = stringValue(executed.id);
        if (cartId) stateUpdates.cart_id = cartId;
        data = { cart: executed };
      } else if (name === 'add_to_cart') {
        cartId = stringValue(executed.id) ?? cartId;
        stateUpdates.cart_id = cartId;
        stateUpdates.cart_items = arrayValue(executed.items).filter(isRecord);
        data = { cart: executed };
      } else if (name === 'list_food_delivery_addresses') {
        const addresses = arrayValue(executed.addresses ?? executed.items).filter(isRecord);
        stateUpdates.address_candidates = addresses;
        const query = plainText(stringValue(context.address_query) ?? '');
        const matched = addresses.find((address) => query && plainText(String(address.label ?? address.name ?? '')).includes(query));
        const chosen = matched ?? (addresses.length === 1 ? addresses[0] : undefined);
        addressId = stringValue(chosen?.id);
        if (addressId) stateUpdates.address_id = addressId;
        data = { addresses };
      } else if (name === 'prepare_food_order_confirmation') {
        pending = executed;
        data = executed;
      } else {
        data = name === 'preview_order' ? { preview: executed } : executed;
      }
    }
    return { data, stateUpdates, ...(pending ? { pending } : {}) };
  }

  private async processFood(task: StoredTask, user: AuthUser, conversationId: string, correlationId: string): Promise<TaskProcessResult> {
    const storedContext = isRecord(task.authoritative?.food_context)
      ? task.authoritative.food_context
      : isRecord(task.authoritative?.state_updates)
        ? task.authoritative.state_updates
        : {};
    const semanticContext: JsonObject = {};
    for (const name of ['dish_query', 'district', 'category', 'delivery_preference'] as const) {
      const value = stringValue(task.extracted_slots[name]);
      if (value) semanticContext[name] = value;
    }
    const maxPrice = numberValue(task.extracted_slots.max_price);
    if (maxPrice !== undefined) semanticContext.max_price = maxPrice;
    const location = stringValue(task.extracted_slots.location);
    if (location && !semanticContext.district) semanticContext.district = location;
    const baseContext = { ...storedContext, ...semanticContext };
    const storedCandidates = arrayValue(storedContext.menu_item_candidates ?? storedContext.item_candidates).filter(isRecord);
    const selectedIndex = foodSelectionIndex(task.latest_message ?? '', storedCandidates);
    const selectedCandidate = selectedIndex !== undefined
      ? storedCandidates[selectedIndex]
      : storedCandidates.find((candidate) => candidate.id === storedContext.menu_item_id);
    const previousContext = selectedIndex === undefined
      ? baseContext
      : (() => {
        return {
          ...baseContext,
          menu_item_id: selectedCandidate?.id,
          restaurant_id: selectedCandidate?.restaurant_id ?? storedContext.restaurant_id,
        };
      })();
    const message = selectedIndex === undefined ? task.latest_message ?? task.normalized_request : 'Thêm 1 món đã chọn vào giỏ';
    const response = await this.agent.chat({ conversation_id: conversationId, user_id: user.sub, message, workflow_context: previousContext, correlation_id: correlationId }, correlationId);
    let stateUpdates = isRecord(response.state_updates) ? response.state_updates : {};
    let pending = isRecord(response.pending_confirmation) ? response.pending_confirmation : undefined;
    let data = isRecord(response.data) ? response.data : {};
    const proposals = arrayValue(data.proposals).filter(isRecord);
    const expectedCapability = task.planned_step?.capability;
    if (expectedCapability && !proposals.length) {
      throw new ServiceUnavailableException({
        code: 'CORE_A_PROPOSAL_MISSING',
        detail: 'Food Core A dispatch requires a validated Agent proposal.',
      });
    }
    if (proposals.length) {
      const dispatched = await this.dispatchFoodProposals(
        proposals,
        previousContext,
        selectedCandidate,
        user,
        correlationId,
        conversationId,
        `food:${task.id}:r${task.revision}`,
        expectedCapability,
      );
      stateUpdates = { ...stateUpdates, ...dispatched.stateUpdates };
      pending = dispatched.pending;
      data = dispatched.data;
    }
    const responseCart = isRecord(data.cart) ? data.cart : undefined;
    const cartIdHint = stringValue(stateUpdates.cart_id) ?? stringValue(responseCart?.id) ?? stringValue((previousContext as JsonObject).cart_id);
    const authoritativeCart = cartIdHint && this.food && typeof this.food.getCart === 'function'
      ? await this.food.getCart(user.sub, correlationId, cartIdHint)
      : responseCart;
    const responseCartItems = arrayValue(authoritativeCart?.items ?? data.items).filter(isRecord);
    const returnedCartItems = arrayValue(authoritativeCart?.items ?? stateUpdates.cart_items).filter(isRecord);
    const returnedCartId = stringValue(stateUpdates.cart_id) ?? stringValue(authoritativeCart?.id);
    const nextContext: JsonObject = {
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
    if (authoritativeCart) foodData = { ...foodData, cart: authoritativeCart };
    const cartUpdated = Boolean(authoritativeCart) && Boolean(nextContext.cart_id) && responseCartItems.length > 0;
    // A user may supply the delivery address after choosing quantities locally.
    // At that point the cart is already authoritative, so continue to the
    // checkout form instead of re-rendering the old menu candidates.
    const addressContinuation = /(?:địa\s*chỉ|giao\s+(?:đến|tới|về)|nhà|tại)/iu.test(task.latest_message ?? '')
      || Boolean(stringValue(nextContext.address_query));
    const effectiveAddressQuery = stringValue(nextContext.address_query)
      || (addressContinuation ? stringValue(task.latest_message) : undefined);
    if (!pending && cartUpdated && addressContinuation && effectiveAddressQuery) {
      const checkout = await this.prepareFoodCheckout(
        { ...task, authoritative: { ...(task.authoritative ?? {}), food_context: { ...nextContext, address_query: effectiveAddressQuery } } },
        user,
        correlationId,
      );
      return {
        phase: checkout.phase,
        authoritative: checkout.authoritative,
        publicItem: checkout.publicItem,
        items: checkout.publicItem ? [checkout.publicItem] : [],
        actions: checkout.nextAction ? [checkout.nextAction] : [],
      };
    }
    if (selectedCandidate) {
      const selectedRestaurant = arrayValue(storedContext.restaurant_candidates).find(
        (candidate): candidate is JsonObject => isRecord(candidate) && candidate.id === selectedCandidate.restaurant_id,
      );
      const selectedDisplay = this.foodCandidateDisplay(selectedCandidate, selectedRestaurant);
      const selectedName = stringValue(selectedDisplay.name);
      const selectedLine = responseCartItems.find((line) => selectedName && stringValue(line.name) === selectedName);
      const hydratedSelected = {
        ...selectedDisplay,
        ...(selectedLine && numberValue(selectedLine.unit_price ?? selectedLine.price) !== undefined ? { price: numberValue(selectedLine.unit_price ?? selectedLine.price) } : {}),
        ...(selectedLine && stringValue(selectedLine.currency) ? { currency: stringValue(selectedLine.currency) } : {}),
        ...(selectedLine && stringValue(selectedLine.description) ? { description: stringValue(selectedLine.description) } : {}),
        ...(selectedLine && stringValue(selectedLine.image_url) ? { image_url: stringValue(selectedLine.image_url) } : {}),
        ...(selectedLine && selectedLine.restaurant ? { restaurant: selectedLine.restaurant } : {}),
      };
      const options = arrayValue(foodData.options).filter(isRecord);
      const optionMatches = options.some((option) => selectedName && stringValue(option.name) === selectedName);
      foodData = {
        ...foodData,
        options: optionMatches
          ? options.map((option) => selectedName && stringValue(option.name) === selectedName ? { ...option, ...hydratedSelected } : option)
          : options.length ? options : [hydratedSelected],
      };
    }
    // Keep the original search set on screen after a selection.  Every menu
    // card remains independently actionable, so a single Food cart can hold
    // items from more than one restaurant without forcing the user to search
    // again between picks.
    if (!pending && storedCandidates.length) {
      foodData = {
        ...foodData,
        options: storedCandidates.map((candidate) => this.foodCandidateDisplay(
          candidate,
          arrayValue(storedContext.restaurant_candidates).find((restaurant): restaurant is JsonObject => isRecord(restaurant) && restaurant.id === candidate.restaurant_id),
        )),
      };
    }
    const publicItem: JsonObject = {
      kind: pending ? 'food_confirmation' : arrayValue(foodData.options).length ? 'food_options' : 'food_empty',
      ...foodData,
      ...(cartUpdated ? { kind: 'food_cart' } : {}),
      ...(!pending && !cartUpdated && !arrayValue(foodData.options).length ? { note: safeText(response.message, 'Hiện chưa có món phù hợp để chọn.') } : {}),
    };
    const optionActions = !pending
      ? [
        ...(!cartUpdated ? (() => {
          const cohortId = this.newCohort(task);
          return arrayValue(foodData.options).map((_, index) => this.actionFor(task, 'select_food_item', { selection_index: index }, cohortId));
        })() : []),
        ...this.foodCartActions(task, nextContext),
      ]
      : [];
    if (pending?.id) {
      const action = this.actionFor(task, 'food_confirm', { confirmation_id: String(pending.id) });
      return { phase: 'AWAITING_CONFIRMATION' as TaskPhase, authoritative: { response, state_updates: nextContext, food_context: nextContext, ...(authoritativeCart ? { cart: authoritativeCart } : {}), pending }, publicItem, items: [publicItem], actions: [action] };
    }
    return { phase: response.response_type === 'error' ? 'FAILED' as TaskPhase : 'IN_PROGRESS' as TaskPhase, authoritative: { response, state_updates: nextContext, food_context: nextContext, ...(authoritativeCart ? { cart: authoritativeCart } : {}) }, publicItem, items: [publicItem], actions: optionActions };
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

  private foodConfirmationItem(cart: JsonObject, preview: JsonObject, context: JsonObject, confirmationState: 'DETAILS_REQUIRED' | 'PAYMENT_REQUIRED'): JsonObject {
    const delivery = isRecord(preview.delivery) ? preview.delivery : {};
    const address = isRecord(preview.address) ? preview.address : {};
    const pickupStops = arrayValue(delivery.pickup_stops ?? preview.restaurants).filter(isRecord);
    return {
      kind: 'food_confirmation',
      title: confirmationState === 'DETAILS_REQUIRED' ? 'Kiểm tra đơn giao hàng' : 'Sẵn sàng thanh toán',
      cart,
      preview,
      pickup_stops: pickupStops,
      delivery_address: stringValue(address.address ?? address.address_text) ?? stringValue(context.delivery_address) ?? 'Chưa có địa chỉ giao hàng',
      confirmation_state: confirmationState,
      note: confirmationState === 'DETAILS_REQUIRED'
        ? 'Kiểm tra món, các điểm lấy hàng và địa chỉ giao trước khi xác nhận đơn.'
        : 'Thông tin đơn đã được xác nhận. Thanh toán để bắt đầu dịch vụ giao hàng.',
    };
  }

  private async prepareFoodCheckout(
    task: StoredTask,
    user: AuthUser,
    correlationId: string,
  ): Promise<{ phase: TaskPhase; message: string; publicItem?: JsonObject; authoritative?: JsonObject; nextAction?: StoredAction }> {
    const context = isRecord(task.authoritative?.food_context) ? task.authoritative.food_context : {};
    const cartId = stringValue(context.cart_id);
    if (!this.food || !cartId) throw new ConflictException({ code: 'FOOD_CART_ACTION_UNAVAILABLE', detail: 'Giỏ hàng chưa sẵn sàng để đặt món.' });
    const cart = await this.food.getCart(user.sub, correlationId, cartId);
    let savedAddresses = await this.store.listSavedAddresses(user.sub);
    const requestedAddress = stringValue(context.address_query);
    // A saved/default profile address is reusable context, not permission to
    // choose a delivery destination. Only resolve it after the user names an
    // address or label in this Food workflow.
    let addressId = requestedAddress
      ? stringValue(context.address_id) ?? savedAddresses.find((address) => {
        const query = plainText(requestedAddress);
        const candidate = plainText(`${address.label} ${address.addressText}`);
        return query.includes(plainText(address.label)) || candidate.includes(query);
      })?.id
      : undefined;
    // The assistant can receive a concrete delivery address in chat before the
    // user has visited the profile page. Persist that user-provided address in
    // Core so ConfirmationService can build the Food-owned immutable snapshot.
    // Generic phrases such as "giao về nhà" still require an actual address.
    const normalizedRequestedAddress = requestedAddress ? plainText(requestedAddress) : '';
    const isConcreteRequestedAddress = Boolean(requestedAddress)
      && requestedAddress!.length >= 8
      && !['nha', 'nha toi', 'nha rieng', 'giao ve nha'].includes(normalizedRequestedAddress);
    if (!addressId && requestedAddress && isConcreteRequestedAddress) {
      const now = new Date().toISOString();
      const savedAddress = await this.store.createSavedAddress({
        id: `addr_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
        actorId: user.sub,
        label: 'Địa chỉ giao hàng',
        addressText: requestedAddress,
        source: 'manual',
        isDefault: savedAddresses.length === 0,
        createdAt: now,
        updatedAt: now,
      });
      savedAddresses = [...savedAddresses, savedAddress];
      addressId = savedAddress.id;
    }
    if (!addressId) {
      const labels = savedAddresses.slice(0, 5).map((address) => address.label).filter(Boolean);
      const addressHint = labels.length
        ? `Bạn có thể trả lời bằng nhãn ${labels.map((label) => `“${label}”`).join(', ')} hoặc gửi một địa chỉ mới.`
        : 'Bạn hãy gửi một địa chỉ cụ thể hoặc lưu địa chỉ trong Hồ sơ.';
      return {
        phase: 'NEEDS_INFO',
        message: `Bạn muốn giao đơn hàng tới địa chỉ nào? ${addressHint}`,
        publicItem: { kind: 'address_options', title: 'Chọn địa chỉ giao hàng', purpose: 'DELIVERY', addresses: savedAddresses.slice(0, 5).map((address) => ({ label: address.label, address_text: address.addressText, is_default: address.isDefault })), allow_new: true, note: `Bạn muốn giao đơn hàng tới địa chỉ nào? ${addressHint}` },
        authoritative: { ...(task.authoritative ?? {}), food_context: context },
      };
    }
    const confirmation = await this.confirmations.prepare(user, { cart_id: cartId, address_id: addressId }, correlationId);
    const preview = isRecord(confirmation.preview) ? confirmation.preview : {};
    const selectedAddress = savedAddresses.find((address) => address.id === addressId);
    const nextContext: JsonObject = {
      ...context,
      address_id: addressId,
      ...(selectedAddress ? { delivery_address: selectedAddress.addressText } : {}),
    };
    const publicItem = this.foodConfirmationItem(cart, preview, nextContext, 'PAYMENT_REQUIRED');
    return {
      phase: 'AWAITING_CONFIRMATION',
      message: 'Mình đã chuẩn bị form xác nhận đơn với địa chỉ giao, món và tổng tiền. Bạn thanh toán để dịch vụ bắt đầu xử lý.',
      publicItem,
      authoritative: { ...(task.authoritative ?? {}), food_context: nextContext, state_updates: nextContext, pending: confirmation as unknown as JsonObject },
      nextAction: this.actionFor(task, 'food_payment', { confirmation_id: confirmation.id }),
    };
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
    if (!this.food || !cartId) throw new ConflictException({ code: 'FOOD_CART_ACTION_UNAVAILABLE', detail: 'Giỏ hàng chưa sẵn sàng để cập nhật.' });

    const cart = await this.food.getCart(user.sub, correlationId, cartId);
    const cartItems = arrayValue(cart.items).filter(isRecord);
    const currentItem = cartItems.find((item) => stringValue(item.id ?? item.cart_item_id) === action.cart_item_id);
    if (!currentItem) throw new ConflictException({ code: 'CART_CHANGED', detail: 'Giỏ hàng đã thay đổi. Bạn chọn lại từ thông tin mới nhất nhé.' });

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
    const publicItem = { kind: 'food_cart', title: 'Giỏ hàng đã được cập nhật', cart: refreshedCart };
    const authoritative = { ...(task.authoritative ?? {}), food_context: context, state_updates: context, cart: refreshedCart };
    return {
      phase: 'IN_PROGRESS',
      message: 'Mình đã cập nhật giỏ hàng.',
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
      const reservationCode = stringValue(reservation.reservation_code);
      const reservationStartAt = publicDateTime(reservation.start_at);
      const reservationPartySize = numberValue(reservation.party_size);
      if (!reservationCode || !reservationStartAt || typeof reservationPartySize !== 'number' || !Number.isInteger(reservationPartySize) || reservationPartySize < 1) {
        throw new ConflictException({ code: 'RESERVATION_RESULT_INVALID', detail: 'The reservation response did not include valid confirmation details.' });
      }
      const publicItem = {
        kind: 'reservation',
        ...(stringValue(reservation.id) ? { resource_id: reservation.id } : {}),
        restaurant: { name: restaurantName, ...(restaurantLocation ? { location: restaurantLocation } : {}) },
        reservation_code: reservationCode,
        start_at: reservationStartAt,
        party_size: reservationPartySize,
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
      const heldAppointmentId = action.appointment_id;
      if (heldAppointmentId !== undefined) {
        // Changing a pre-payment hold is an explicit reversible action.  The
        // previous hold is released before this selected slot is held; a paid
        // or final appointment never receives these actions.
        await this.healthcare.cancelAppointment(user.sub, correlationId, `${idempotencyKey}:cancel`, heldAppointmentId);
      }
      task.extracted_slots.selection = selectionName(doctorIndex);
      task.authoritative = { ...task.authoritative, selected_doctor_index: doctorIndex, ...(isRecord(exactSlot) ? { selectedSlot: exactSlot } : {}) };
      const result = await this.processHealthcare(task, user, conversationId, correlationId);
      return {
        phase: result.phase,
        message: result.phase === 'AWAITING_CONFIRMATION'
          ? heldAppointmentId !== undefined ? 'Mình đã đổi sang khung giờ mới và tạm giữ lịch này. Bạn xác nhận thanh toán để tiếp tục nhé.' : 'Mình đã tạm giữ khung giờ. Bạn xác nhận thanh toán để tiếp tục nhé.'
          : 'Mình đã cập nhật lịch khám.',
        publicItem: result.publicItem,
        authoritative: result.authoritative,
        nextActions: result.actions,
      };
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
      const publicAppointment = task.authoritative?.appointment && isRecord(task.authoritative.appointment)
        ? this.publicHealthcareAppointment(task.authoritative.appointment)
        : {};
      const publicItem = { kind: 'healthcare_confirmation', resource_id: appointmentId, appointment_id: appointmentId, ...publicAppointment};
      return { phase: 'AWAITING_CONFIRMATION', message: 'Thanh toán đã được ghi nhận. Bạn xác nhận lần cuối để hoàn tất lịch khám nhé.', publicItem, authoritative: { ...task.authoritative, payment, pending }, nextAction: this.actionFor(task, 'healthcare_confirm', { confirmation_id: String(pending.id), workflow_id: tool.workflow_id }) };
    }
    if (action.kind === 'healthcare_cancel') {
      const appointmentId = action.appointment_id;
      if (!appointmentId) throw new ConflictException({ code: 'APPOINTMENT_NOT_FOUND', detail: 'Giữ chỗ lịch khám này không còn sẵn sàng.' });
      const cancellation = await this.healthcare.cancelAppointment(user.sub, correlationId, idempotencyKey, appointmentId);
      const appointment = isRecord(task.authoritative?.appointment) ? task.authoritative.appointment : {};
      return {
        phase: 'COMPLETED',
        message: 'Mình đã hủy giữ chỗ lịch khám. Chưa có thanh toán nào được thực hiện.',
        publicItem: {
          kind: 'appointment',
          resource_id: appointmentId,
          ...this.publicHealthcareAppointment(appointment),
          status: 'CANCELLED',
          },
        authoritative: { ...task.authoritative, cancellation },
      };
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
      const publicAppointment = this.publicHealthcareAppointment(appointment);
      return { phase: 'COMPLETED', message: 'Lịch khám đã được xác nhận thành công.', publicItem: { kind: 'appointment_confirmed', resource_id: appointment.appointment_id, ...publicAppointment, status } as JsonObject, authoritative: { ...task.authoritative, result } };
    }
    if (action.kind === 'food_cart_increment' || action.kind === 'food_cart_decrement' || action.kind === 'food_cart_remove') {
      return this.executeFoodCartAction(action, task, user, correlationId, idempotencyKey);
    }
    if (action.kind === 'food_checkout') {
      return this.prepareFoodCheckout(task, user, correlationId);
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
      const quantity = Math.max(1, Math.min(50, action.quantity ?? 1));
      task.authoritative = { ...task.authoritative, food_context: { ...context, menu_item_id: selected.id, restaurant_id: selected.restaurant_id ?? context.restaurant_id } };
      task.latest_message = `Thêm ${quantity} món đã chọn vào giỏ`;
      task.extracted_slots.quantity = quantity;
      const result = await this.processFood(task, user, conversationId, correlationId);
      if (result.actions?.length) {
        return { phase: result.phase, message: 'Mình đã cập nhật giỏ hàng.', publicItem: result.publicItem, authoritative: result.authoritative, nextActions: result.actions.filter((candidate) => candidate.kind !== 'select_food_item') };
      }
      return { phase: result.phase, message: result.phase === 'AWAITING_CONFIRMATION' ? 'Mình đã chuẩn bị đơn món đã chọn. Bạn kiểm tra rồi xác nhận nhé.' : 'Mình đã chọn món và cập nhật giỏ hàng.', publicItem: result.publicItem, authoritative: result.authoritative, nextAction: result.actions?.[0] };
    }
    if (action.kind === 'food_confirm') {
      const confirmation = await this.confirmations.get(action.confirmation_id ?? '', user.sub);
      const pending = isRecord(task.authoritative?.pending) ? task.authoritative.pending : {};
      const foodContext = isRecord(task.authoritative?.food_context) ? task.authoritative.food_context : {};
      const cartId = stringValue(foodContext.cart_id);
      if (!cartId || confirmation.status !== 'PENDING') throw new ConflictException({ code: 'CONFIRMATION_NOT_AVAILABLE', detail: 'Xác nhận đơn không còn hiệu lực. Bạn mở lại tổng đơn để tạo xác nhận mới.' });
      const cart = this.food ? await this.food.getCart(user.sub, correlationId, cartId) : {};
      const preview = isRecord(pending.preview) ? pending.preview : {};
      const publicItem = this.foodConfirmationItem(cart, preview, foodContext, 'PAYMENT_REQUIRED');
      return {
        phase: 'AWAITING_CONFIRMATION',
        message: 'Thông tin đơn đã được xác nhận. Bạn xác nhận thanh toán để dịch vụ bắt đầu xử lý.',
        publicItem,
        authoritative: { ...(task.authoritative ?? {}), food_context: foodContext, pending },
        nextAction: this.actionFor(task, 'food_payment', { confirmation_id: confirmation.id }),
      };
    }
    if (action.kind === 'food_payment') {
      const result = await this.confirmations.execute(action.confirmation_id ?? '', user, { payment_method: 'card', conversation_id: conversationId }, correlationId, idempotencyKey);
      const payment = isRecord(result.payment) ? result.payment : undefined;
      const order = isRecord(result.order) ? result.order : undefined;
      return { phase: 'IN_PROGRESS', message: 'Thanh toán đã được ghi nhận. Tài xế sẽ lấy món theo lộ trình đã xác nhận.', publicItem: { kind: 'food_order', ...(order?.id ? { resource_id: order.id } : {}), order: result.order, ...(payment ? { payment } : {}) }, authoritative: { result } };
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
    responseActions: StoredAction[] = actions,
  ): Promise<AssistantResponse> {
    const safeMessage = safeText(message, 'Mình đã cập nhật thông tin cho bạn.');
    const orchestration = state.orchestration ?? buildOrchestrationSnapshot(state.tasks);
    const finalState = { ...state, actions, orchestration };
    const response: AssistantResponse = {
      conversation_id: conversationId,
      message: safeMessage,
      items: items.map((item) => this.sanitizeConsumerItem(item)),
      actions: responseActions.map((action) => this.publicAction(action)),
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

  private withDiscardAcknowledgement(message: string, domains: Domain[], hasNewWork: boolean): string {
    if (!domains.length) return message;
    const labels: Record<Domain, string> = {
      food: 'tìm và đặt món',
      restaurant: 'đặt bàn',
      healthcare: 'tìm lịch khám',
      ride: 'đặt xe',
    };
    const values = domains.map((domain) => labels[domain]);
    const joined = values.length === 1
      ? values[0]
      : values.length === 2
        ? values.join(' và ')
        : `${values.slice(0, -1).join(', ')} và ${values[values.length - 1]}`;
    const acknowledgement = `Được, mình đã bỏ phần ${joined} còn dang dở trong cuộc trò chuyện này.`;
    return hasNewWork ? `${acknowledgement} ${message}` : acknowledgement;
  }

  private messageFor(message: string, plan: JsonObject, tasks: StoredTask[], items: JsonObject[], actions: StoredAction[]): string {
    const clarification = stringValue(plan.clarification_question);
    if (clarification) return clarification;
    if (!items.length && !actions.length) return safeText(stringValue(plan.assistant_message), 'Mình sẽ tiếp tục cùng bạn nhé.');
    const activeTasks = tasks.filter((task) => task.phase !== 'DISCARDED');
    if (actions.length) return activeTasks.length > 1
      ? 'Mình đã chuẩn bị các bước tiếp theo cho những việc bạn yêu cầu. Bạn kiểm tra rồi xác nhận từng bước nhé.'
      : 'Mình đã chuẩn bị xong. Bạn kiểm tra lại rồi xác nhận nhé.';
    const kinds = new Set(items.map((item) => stringValue(item.kind)).filter((kind): kind is string => Boolean(kind)));
    if (kinds.has('clarification')) return 'Mình cần thêm một vài thông tin để tiếp tục xử lý yêu cầu của bạn.';
    if (kinds.has('task_error') || kinds.has('ride_timing_conflict')) return 'Một bước trong yêu cầu chưa thể hoàn tất an toàn. Bạn kiểm tra thông tin và thử lại nhé.';
    if (kinds.has('restaurant_confirmation') || kinds.has('healthcare_confirmation') || kinds.has('food_confirmation')) return 'Thông tin đã sẵn sàng. Bạn kiểm tra lại các chi tiết rồi xác nhận bước tiếp theo nhé.';
    if (kinds.has('restaurant_options') || kinds.has('healthcare_options') || kinds.has('food_options') || kinds.has('ride_quote')) return 'Mình đã tìm thấy các lựa chọn phù hợp dựa trên dữ liệu hiện có.';
    if (kinds.has('reservation') || kinds.has('appointment_confirmed') || kinds.has('food_order')) return 'Yêu cầu của bạn đã được cập nhật theo kết quả xác thực từ dịch vụ.';
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

  private publicAction(action: StoredAction): { id: string; kind: ActionKind; label: string; target_index?: number } {
    const labels: Record<ActionKind, string> = {
      select_restaurant: 'Chọn nhà hàng này',
      restaurant_confirm: 'Xác nhận đặt bàn',
      ride_service: 'Xác nhận chuyến xe',
      ride_payment: 'Xác nhận thanh toán',
      select_healthcare_slot: 'Chọn lịch này',
      healthcare_payment: 'Xác nhận thanh toán',
      healthcare_confirm: 'Xác nhận lịch khám',
      healthcare_cancel: 'Hủy giữ chỗ',
      select_food_item: 'Chọn món này',
      food_cart_increment: 'Tăng món',
      food_cart_decrement: 'Giảm món',
      food_cart_remove: 'Xóa món',
      food_checkout: 'Xác nhận',
      food_confirm: 'Xác nhận đặt món',
      food_payment: 'Thanh toán đơn hàng',
    };
    return { id: action.id, kind: action.kind, label: labels[action.kind], ...(action.selection_index !== undefined ? { target_index: action.selection_index } : {}) };
  }

  private restaurantOptions(candidates: JsonObject[]): JsonObject {
    if (!candidates.length) {
      return {
        kind: 'restaurant_unavailable',
        options: [],
        };
    }
    return { kind: 'restaurant_options', options: candidates.map((candidate) => this.publicRestaurant(candidate)) };
  }

  private resultItems(value: unknown): JsonObject[] {
    if (Array.isArray(value)) return value.filter(isRecord);
    if (!isRecord(value)) return [];
    const nested = value.items ?? value.results ?? value.departments ?? value.doctors;
    return arrayValue(nested).filter(isRecord);
  }

  private publicRestaurant(candidate: JsonObject): JsonObject {
    const address = stringValue(candidate.address) ?? stringValue(candidate.location);
    const openingHours = hasOpeningHours(candidate.opening_hours)
      ? candidate.opening_hours
      : DEFAULT_RESTAURANT_OPENING_HOURS;
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
      opening_hours: openingHours,
      ...(hasTrustworthyCoordinate ? { latitude: candidate.latitude, longitude: candidate.longitude } : {}),
    };
  }

  private healthcareOptions(doctors: JsonObject[], _taskId: string): JsonObject {
    return {
      kind: 'healthcare_options',
      options: this.healthcareOptionRows(doctors),
    };
  }

  private publicHealthcareAppointment(value: JsonObject): JsonObject {
    const doctor = isRecord(value.doctor) ? value.doctor : undefined;
    const department = isRecord(value.department) ? value.department : undefined;
    const facility = isRecord(value.facility) ? value.facility : undefined;
    const slot = isRecord(value.slot) ? value.slot : undefined;
    const publicFacility = facility ? {
      ...(stringValue(facility.name) ? { name: stringValue(facility.name) } : {}),
      ...(stringValue(facility.address) ? { address: stringValue(facility.address) } : {}),
      ...(typeof facility.latitude === 'number' ? { latitude: facility.latitude } : {}),
      ...(typeof facility.longitude === 'number' ? { longitude: facility.longitude } : {}),
    } : undefined;
    return {
      ...(numberValue(value.appointment_id) !== undefined ? { appointment_id: value.appointment_id } : {}),
      ...(stringValue(value.doctor_name) ?? stringValue(doctor?.name) ? { doctor: stringValue(value.doctor_name) ?? stringValue(doctor?.name) } : {}),
      ...(stringValue(value.department) ?? stringValue(value.department_name) ?? stringValue(department?.name) ? { department: stringValue(value.department) ?? stringValue(value.department_name) ?? stringValue(department?.name) } : {}),
      ...(stringValue(value.start_time) ?? stringValue(value.start_at) ?? stringValue(slot?.start_time) ? { start_time: stringValue(value.start_time) ?? stringValue(value.start_at) ?? stringValue(slot?.start_time) } : {}),
      ...(typeof value.price === 'number' ? { price: value.price } : typeof doctor?.price === 'number' ? { price: doctor.price } : {}),
      ...(stringValue(value.status) ? { status: stringValue(value.status) } : {}),
      ...(publicFacility && Object.keys(publicFacility).length ? { facility: publicFacility } : {}),
    };
  }

  private healthcareOptionRows(doctors: JsonObject[], excludedSlotId?: number): JsonObject[] {
    // Public card rows and selection actions must have exactly the same order.
    // One row represents one authoritative slot; the Web groups these rows by
    // doctor purely for presentation and can safely switch between time slots.
    let selectionIndex = 0;
    return doctors.flatMap((doctor) => {
      const facility = isRecord(doctor.facility) ? doctor.facility : undefined;
      const department = isRecord(doctor.department) ? doctor.department : undefined;
      return arrayValue(doctor.available_slots).filter(isRecord).flatMap((slot) => {
        const slotId = numberValue(slot.id);
        const targetIndex = selectionIndex++;
        if (slotId === undefined || slotId === excludedSlotId) return [];
        const startTime = stringValue(slot.start_time) ?? stringValue(slot.start_at);
        const publicStartTime = publicDateTime(startTime);
        if (!publicStartTime) return [];
        return [{
          ...(facility ? { facility: this.sanitizeFacility(facility) } : {}),
          doctor: doctor.name,
          department: department?.name ?? doctor.department,
          start_time: publicStartTime,
          target_index: targetIndex,
          ...(stringValue(slot.end_time) ? { end_time: stringValue(slot.end_time) } : {}),
          ...(typeof (slot.price ?? doctor.price) === 'number' ? { price: slot.price ?? doctor.price } : {}),
        }];
      });
    });
  }

  private healthcareSelectionActions(doctors: JsonObject[], task: StoredTask, excludedSlotId?: number, appointmentId?: number): StoredAction[] {
    const cohortId = this.newCohort(task);
    let selectionIndex = 0;
    return doctors.flatMap((doctor, doctorIndex) => arrayValue(doctor.available_slots).filter(isRecord).map((slot, slotIndex) => {
      const slotId = numberValue(slot.id);
      const targetIndex = selectionIndex++;
      if (slotId === undefined || slotId === excludedSlotId) return undefined;
      const action = this.actionFor(task, 'select_healthcare_slot', {
        selection_index: targetIndex,
        doctor_index: doctorIndex,
        slot_index: slotIndex,
        slot_id: slotId,
        ...(appointmentId !== undefined ? { appointment_id: appointmentId } : {}),
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
      pickup: quote.pickup_address,
      dropoff: quote.dropoff_address,
      vehicle: this.vehicleLabel(quote.vehicle_type),
      ...(typeof quote.passenger_count === 'number' ? { passenger_count: quote.passenger_count } : {}),
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
    } : { kind: 'progress'};
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
      'driver', 'doctor', 'department', 'start_time', 'price', 'payment_note', 'cart', 'pickup_stops', 'delivery_address', 'confirmation_state',
      'resource_id',
      'appointment_id', 'appointment', 'facility', 'alternative_slots', 'order', 'payment', 'preview',
      'error_code', 'retryable', 'purpose', 'addresses', 'allow_new',
    ]);
    const result: JsonObject = {};
    for (const [key, value] of Object.entries(item)) {
      if (!allowed.has(key) || value === undefined) continue;
      if (key === 'options' || key === 'departments' || key === 'alternative_slots') {
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
      } else if (key === 'pickup_stops') {
        result[key] = arrayValue(value).filter(isRecord).map((stop) => this.sanitizeRestaurant(stop));
      } else if (key === 'addresses') {
        result[key] = arrayValue(value).filter(isRecord).map((address) => ({
          ...(stringValue(address.label) ? { label: stringValue(address.label) } : {}),
          ...(stringValue(address.address_text) ? { address_text: stringValue(address.address_text) } : {}),
          ...(typeof address.is_default === 'boolean' ? { is_default: address.is_default } : {}),
        })).filter((address) => address.label && address.address_text);
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
    for (const key of ['name', 'title', 'location', 'cuisine', 'description', 'doctor', 'department', 'start_time', 'price', 'currency', 'category', 'rating', 'review_count', 'price_level', 'image_url', 'address', 'city', 'district', 'latitude', 'longitude', 'target_index']) {
      const item = value[key];
      if (key === 'start_time') {
        const normalized = publicDateTime(item);
        if (normalized) result[key] = normalized;
      } else if (typeof item === 'string' || typeof item === 'number') result[key] = item;
    }
    const openingHours = this.sanitizeOpeningHours(value.opening_hours);
    if (openingHours !== undefined) result.opening_hours = openingHours;
    if (Array.isArray(value.option_groups)) result.option_groups = this.sanitizeFoodOptionGroups(value.option_groups);
    if (Array.isArray(value.options)) result.options = this.sanitizeFoodOptions(value.options);
    if (isRecord(value.restaurant)) result.restaurant = this.sanitizeRestaurant(value.restaurant);
    else if (typeof value.restaurant === 'string') result.restaurant = value.restaurant;
    if (isRecord(value.facility)) result.facility = this.sanitizeFacility(value.facility);
    return result;
  }

  private sanitizeOpeningHours(value: unknown): string | string[] | JsonObject[] | undefined {
    if (typeof value === 'string') return value;
    if (!Array.isArray(value)) return undefined;
    if (value.every((item) => typeof item === 'string')) return value as string[];
    const entries = value.filter(isRecord).map((entry) => ({
      ...(stringValue(entry.day ?? entry.weekday ?? entry.name) ? { day: stringValue(entry.day ?? entry.weekday ?? entry.name) } : {}),
      ...(stringValue(entry.open ?? entry.open_time ?? entry.opens) ? { open: stringValue(entry.open ?? entry.open_time ?? entry.opens) } : {}),
      ...(stringValue(entry.close ?? entry.close_time ?? entry.closes) ? { close: stringValue(entry.close ?? entry.close_time ?? entry.closes) } : {}),
    })).filter((entry) => Object.keys(entry).length > 0);
    return entries.length ? entries : undefined;
  }

  private sanitizeRestaurant(value: unknown): JsonObject {
    if (!isRecord(value)) return {};
    const openingHours = this.sanitizeOpeningHours(value.opening_hours);
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
      ...(openingHours !== undefined ? { opening_hours: openingHours } : {}),
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
      if (key === 'start_time') {
        const normalized = publicDateTime(item);
        if (normalized) result[key] = normalized;
      } else if (typeof item === 'string' || typeof item === 'number') result[key] = item;
    }
    if (isRecord(value.doctor)) {
      if (stringValue(value.doctor.name)) result.doctor_name = stringValue(value.doctor.name);
      if (typeof value.doctor.price === 'number') result.price = value.doctor.price;
    }
    if (isRecord(value.department) && stringValue(value.department.name)) result.department = stringValue(value.department.name);
    if (isRecord(value.slot) && publicDateTime(value.slot.start_time)) result.start_time = publicDateTime(value.slot.start_time);
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
        ...(arrayValue(value.delivery.pickup_stops).filter(isRecord).length ? {
          pickup_stops: arrayValue(value.delivery.pickup_stops).filter(isRecord).map((stop) => this.sanitizeRestaurant(stop)),
        } : {}),
      };
    }
    if (isRecord(value.address)) {
      result.address = {
        ...(stringValue(value.address.address ?? value.address.address_text) ? { address: stringValue(value.address.address ?? value.address.address_text) } : {}),
        ...(typeof value.address.latitude === 'number' ? { latitude: value.address.latitude } : {}),
        ...(typeof value.address.longitude === 'number' ? { longitude: value.address.longitude } : {}),
      };
    }
    if (Array.isArray(value.restaurants)) result.restaurants = value.restaurants.filter(isRecord).map((restaurant) => this.sanitizeRestaurant(restaurant));
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
