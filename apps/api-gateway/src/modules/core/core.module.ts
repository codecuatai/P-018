import { Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { CoreProductOpsStore } from './product-ops.store';

export type PaymentMethod = 'bank_transfer' | 'card' | 'e_wallet';
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'UNKNOWN';
export type RefundStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
export type ConfirmationStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'EXPIRED';

export interface ConfirmationRecord {
  id: string;
  actorId: string;
  action: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  quoteVersion: string;
  amount: number;
  currency: string;
  expiresAt: number;
  createdAt: string;
  status: ConfirmationStatus;
  executionKey?: string;
  processingStartedAt?: number;
  completedAt?: number;
  failureCode?: string;
  result?: Record<string, unknown>;
  version: number;
  recoveryClaimedAt?: number;
  recoveryAttempts?: number;
  nextRecoveryAt?: number;
}

export type ConfirmationClaimState = 'CLAIMED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'EXPIRED' | 'CONFIRMATION_ALREADY_USED' | 'IDEMPOTENCY_KEY_REUSED';
export interface ConfirmationClaim { state: ConfirmationClaimState; confirmation?: ConfirmationRecord; result?: Record<string, unknown> }

export interface PaymentRecord {
  id: string;
  actorId: string;
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  idempotencyKey: string;
  payloadHash: string;
  createdAt: string;
  receiptId?: string;
  intentId?: string;
  providerReference?: string;
  providerStatus?: string;
  authorizedAt?: string;
  lastCheckedAt?: string;
  confirmationId?: string;
  confirmationExecutionKey?: string;
  conversationId?: string;
  recoveryAttempts?: number;
  nextRecoveryAt?: string;
  lastRecoveryError?: string;
  recoveredAt?: string;
  recoveryClaimedAt?: string;
  recoveryClaimOwner?: string;
}

export interface RefundRecord {
  id: string;
  paymentId: string;
  actorId: string;
  amount: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  idempotencyKey: string;
  payloadHash: string;
  createdAt: string;
  completedAt?: string;
  providerRefundReference?: string;
  paymentProviderReference?: string;
  providerStatus?: string;
  attemptedAt?: string;
  statusAvailableAt?: string;
  lastCheckedAt?: string;
  refundScope?: string;
  recoveryAttempts?: number;
  nextRecoveryAt?: string;
}

export interface ConversationRecord {
  conversationId: string;
  actorId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string; data?: Record<string, unknown> }>;
  state: Record<string, unknown>;
  title?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: string;
  serviceContext?: string;
  version?: number;
}

export interface SavedAddressRecord {
  id: string;
  actorId: string;
  label: string;
  addressText: string;
  city?: string;
  district?: string;
  ward?: string;
  latitude?: number;
  longitude?: number;
  provider?: string;
  source: 'manual' | 'geocoded' | 'imported';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentProviderTransaction {
  providerReference: string;
  paymentId: string;
  actorId: string;
  orderId: string;
  requestHash: string;
  providerStatus: 'CREATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  intendedFinalStatus?: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  confirmationId?: string;
  executionKey?: string;
  confirmAttemptedAt?: string;
  statusAvailableAt?: string;
  lastStatusCheckAt?: string;
  attemptCount: number;
}
export interface PaymentProviderConfirmationClaim { transaction: PaymentProviderTransaction; claimed: boolean }

export interface RefundProviderTransaction {
  providerRefundReference: string;
  refundId: string;
  paymentProviderReference: string;
  requestHash: string;
  providerStatus: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  attemptedAt?: string;
  statusAvailableAt?: string;
  lastCheckedAt?: string;
}

export interface ExecutionRecord { status: string; payloadHash: string; result?: Record<string, unknown>; payload?: Record<string, unknown> }
export interface WorkflowReconciliationRecord { orderId: string; actorId: string; paymentId: string; refundId?: string; status: string; lastErrorCode?: string; attemptCount: number; nextAttemptAt?: string; completedAt?: string; claimedAt?: string; claimOwner?: string }

export interface MultiServiceWorkflowRecord {
  workflowId: string;
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  kind: string;
  status: string;
  plan: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type AssistantActionExecutionStatus = 'PROCESSING' | 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'FAILED_FINAL';
export interface AssistantActionExecutionRecord {
  actorId: string;
  conversationId: string;
  actionId: string;
  idempotencyKey: string;
  requestHash: string;
  status: AssistantActionExecutionStatus;
  response?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  processingExpiresAt?: string;
  completedAt?: string;
}
export type AssistantActionExecutionClaimState = 'CLAIMED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'IDEMPOTENCY_KEY_REUSED' | 'ACTION_NOT_AVAILABLE';
export interface AssistantActionExecutionClaim {
  state: AssistantActionExecutionClaimState;
  execution?: AssistantActionExecutionRecord;
}

/**
 * The Core-owned unit of persistence for a successful Assistant action.
 * Conversation advancement and receipt completion must never be committed
 * separately: a downstream side effect may be retried with its idempotency key
 * only while the original public action remains present in persisted state.
 */
export interface AssistantActionSuccessCommit {
  actorId: string;
  conversationId: string;
  actionId: string;
  idempotencyKey: string;
  requestHash: string;
  userMessage: ConversationRecord['messages'][number];
  assistantMessage: ConversationRecord['messages'][number];
  stateUpdates: Record<string, unknown>;
  response: Record<string, unknown>;
}

export interface CoreRepository {
  createConfirmation(value: ConfirmationRecord): Promise<ConfirmationRecord>;
  getConfirmation(id: string): Promise<ConfirmationRecord | undefined>;
  claimConfirmation(id: string, actorId: string, executionKey: string, payloadHash: string, now: number, executionPayload?: Record<string, unknown>): Promise<ConfirmationClaim>;
  completeConfirmation(id: string, actorId: string, executionKey: string, status: Exclude<ConfirmationStatus, 'PENDING' | 'PROCESSING' | 'EXPIRED'>, result: Record<string, unknown>, failureCode?: string): Promise<void>;
  getExecution(key: string): Promise<ExecutionRecord | undefined>;
  createPayment(value: PaymentRecord): Promise<PaymentRecord>;
  updatePayment(id: string, status: PaymentStatus, receiptId?: string, recovery?: { nextRecoveryAt?: string; error?: string; providerStatus?: string }): Promise<PaymentRecord>;
  getPayment(id: string): Promise<PaymentRecord | undefined>;
  findPayment(actorId: string, idempotencyKey: string): Promise<PaymentRecord | undefined>;
  findPaymentByOrder(orderId: string, actorId: string): Promise<PaymentRecord | undefined>;
  createRefund(value: RefundRecord): Promise<RefundRecord>;
  updateRefund(id: string, status: RefundStatus, providerStatus?: string, recovery?: { nextRecoveryAt?: string }): Promise<RefundRecord>;
  getRefundByKey(paymentId: string, idempotencyKey: string): Promise<RefundRecord | undefined>;
  listRefunds(paymentId: string): Promise<RefundRecord[]>;
  listAllPayments(page: number, pageSize: number): Promise<{ items: PaymentRecord[]; total: number }>;
  listAllRefunds(page: number, pageSize: number): Promise<{ items: RefundRecord[]; total: number }>;
  listPaymentsForReconciliation(): Promise<PaymentRecord[]>;
  listPaymentsForRecovery(now: number): Promise<PaymentRecord[]>;
  claimPaymentsForRecovery(now: number, owner: string, limit: number): Promise<PaymentRecord[]>;
  createPaymentProviderTransaction(value: PaymentProviderTransaction): Promise<PaymentProviderTransaction>;
  getPaymentProviderTransaction(providerReference: string): Promise<PaymentProviderTransaction | undefined>;
  markPaymentProviderConfirmation(providerReference: string, values: { intendedFinalStatus: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; statusAvailableAt?: string; confirmationId?: string; executionKey?: string }): Promise<PaymentProviderTransaction>;
  claimPaymentProviderConfirmation(providerReference: string, values: { intendedFinalStatus: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; statusAvailableAt?: string; confirmationId?: string; executionKey?: string }): Promise<PaymentProviderConfirmationClaim>;
  markPaymentProviderChecked(providerReference: string, status: PaymentProviderTransaction['providerStatus']): Promise<PaymentProviderTransaction>;
  createRefundProviderTransaction(value: RefundProviderTransaction): Promise<RefundProviderTransaction>;
  getRefundProviderTransaction(providerRefundReference: string): Promise<RefundProviderTransaction | undefined>;
  markRefundProviderChecked(providerRefundReference: string, status: RefundProviderTransaction['providerStatus']): Promise<RefundProviderTransaction>;
  claimStaleConfirmations(cutoff: number, now: number, limit: number): Promise<ConfirmationRecord[]>;
  releaseConfirmationRecovery(id: string): Promise<void>;
  upsertWorkflowReconciliation(value: WorkflowReconciliationRecord): Promise<WorkflowReconciliationRecord>;
  listDueWorkflowReconciliations(now: string, limit: number): Promise<WorkflowReconciliationRecord[]>;
  listWorkflowReconciliations(page: number, pageSize: number): Promise<{ items: WorkflowReconciliationRecord[]; total: number }>;
  claimDueWorkflowReconciliations(now: string, limit: number, owner: string): Promise<WorkflowReconciliationRecord[]>;
  getMultiServiceWorkflow(workflowId: string, actorId: string): Promise<MultiServiceWorkflowRecord | undefined>;
  saveMultiServiceWorkflow(value: MultiServiceWorkflowRecord): Promise<MultiServiceWorkflowRecord>;
  getReceipt(paymentId: string): Promise<Record<string, unknown> | undefined>;
  saveConversation(value: ConversationRecord): Promise<void>;
  getConversation(id: string, actorId: string): Promise<ConversationRecord | undefined>;
  listConversations(actorId: string, options?: { includeArchived?: boolean }): Promise<ConversationRecord[]>;
  createConversation(value: { conversationId: string; actorId: string; title?: string; serviceContext?: string }): Promise<ConversationRecord>;
  updateConversation(id: string, actorId: string, patch: { title?: string; status?: 'ACTIVE' | 'ARCHIVED' }): Promise<ConversationRecord | undefined>;
  deleteConversation(id: string, actorId: string): Promise<boolean>;
  listSavedAddresses(actorId: string): Promise<SavedAddressRecord[]>;
  getSavedAddress(id: string, actorId: string): Promise<SavedAddressRecord | undefined>;
  createSavedAddress(value: SavedAddressRecord): Promise<SavedAddressRecord>;
  updateSavedAddress(id: string, actorId: string, patch: Partial<Pick<SavedAddressRecord, 'label' | 'addressText' | 'city' | 'district' | 'ward' | 'latitude' | 'longitude' | 'provider' | 'source' | 'isDefault'>>): Promise<SavedAddressRecord | undefined>;
  deleteSavedAddress(id: string, actorId: string): Promise<boolean>;
  appendConversationTurn(value: { conversationId: string; actorId: string; userMessage: ConversationRecord['messages'][number]; assistantMessage: ConversationRecord['messages'][number]; stateUpdates: Record<string, unknown> }): Promise<ConversationRecord>;
  mergeConversationState(conversationId: string, actorId: string, stateUpdates: Record<string, unknown>): Promise<void>;
  getAssistantActionExecution(actorId: string, conversationId: string, actionId: string): Promise<AssistantActionExecutionRecord | undefined>;
  claimAssistantActionExecution(actorId: string, conversationId: string, actionId: string, idempotencyKey: string, requestHash: string): Promise<AssistantActionExecutionClaim>;
  commitAssistantActionSuccess(value: AssistantActionSuccessCommit): Promise<ConversationRecord>;
  completeAssistantActionExecution(actorId: string, conversationId: string, actionId: string, idempotencyKey: string, requestHash: string, status: Exclude<AssistantActionExecutionStatus, 'SUCCEEDED'>, response?: Record<string, unknown>): Promise<void>;
  audit(value: { action: string; actorId?: string; correlationId?: string; resourceId?: string; metadata?: Record<string, unknown> }): Promise<void>;
  checkHealth(): Promise<boolean>;
  close(): Promise<void>;
}

function clone<T>(value: T): T { return structuredClone(value); }

/** Test-only repository. It preserves the same claim and idempotency semantics without network I/O. */
export class InMemoryCoreRepository implements CoreRepository {
  private readonly confirmations = new Map<string, ConfirmationRecord>();
  private readonly executions = new Map<string, { confirmationId: string; actorId: string; key: string; payloadHash: string; status: string; result?: Record<string, unknown>; payload?: Record<string, unknown> }>();
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly refunds = new Map<string, RefundRecord>();
  private readonly providerPayments = new Map<string, PaymentProviderTransaction>();
  private readonly providerRefunds = new Map<string, RefundProviderTransaction>();
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly savedAddresses = new Map<string, SavedAddressRecord>();
  private readonly assistantActionExecutions = new Map<string, AssistantActionExecutionRecord>();
  private readonly multiServiceWorkflows = new Map<string, MultiServiceWorkflowRecord>();
  private readonly workflowReconciliations = new Map<string, WorkflowReconciliationRecord>();
  private readonly audits: Array<Record<string, unknown>> = [];

  async createConfirmation(value: ConfirmationRecord): Promise<ConfirmationRecord> { const saved = { ...value, status: value.status ?? 'PENDING', version: value.version ?? 0 }; this.confirmations.set(saved.id, clone(saved)); return clone(saved); }
  async getConfirmation(id: string): Promise<ConfirmationRecord | undefined> { const value = this.confirmations.get(id); return value ? clone(value) : undefined; }

  async claimConfirmation(id: string, actorId: string, executionKey: string, payloadHash: string, now: number, executionPayload?: Record<string, unknown>): Promise<ConfirmationClaim> {
    const confirmation = this.confirmations.get(id);
    if (!confirmation || confirmation.actorId !== actorId) return { state: 'CONFIRMATION_ALREADY_USED' };
    const existing = [...this.executions.values()].find((value) => value.confirmationId === id && value.key === executionKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) return { state: 'IDEMPOTENCY_KEY_REUSED' };
      if (existing.status === 'FAILED_RETRYABLE') {
        existing.status = 'PROCESSING';
        existing.result = undefined;
        confirmation.status = 'PROCESSING';
        confirmation.processingStartedAt = now;
        return { state: 'CLAIMED', confirmation: clone(confirmation) };
      }
      if (existing.result) return { state: existing.status as ConfirmationClaimState, confirmation: clone(confirmation), result: clone(existing.result) };
      return { state: 'PROCESSING', confirmation: clone(confirmation) };
    }
    if (confirmation.expiresAt <= now && confirmation.status === 'PENDING') {
      confirmation.status = 'EXPIRED';
      confirmation.version += 1;
      return { state: 'EXPIRED', confirmation: clone(confirmation) };
    }
    if (confirmation.status === 'PENDING') {
      confirmation.status = 'PROCESSING';
      confirmation.executionKey = executionKey;
      confirmation.processingStartedAt = now;
      confirmation.version += 1;
      this.executions.set(executionKey, { confirmationId: id, actorId, key: executionKey, payloadHash, status: 'PROCESSING', payload: executionPayload });
      return { state: 'CLAIMED', confirmation: clone(confirmation) };
    }
    if (confirmation.result) return { state: confirmation.status, confirmation: clone(confirmation), result: clone(confirmation.result) };
    return { state: ['SUCCEEDED', 'FAILED_FINAL', 'EXPIRED'].includes(confirmation.status) ? 'CONFIRMATION_ALREADY_USED' : 'PROCESSING', confirmation: clone(confirmation) };
  }

  async completeConfirmation(id: string, actorId: string, executionKey: string, status: Exclude<ConfirmationStatus, 'PENDING' | 'PROCESSING' | 'EXPIRED'>, result: Record<string, unknown>, failureCode?: string): Promise<void> {
    const confirmation = this.confirmations.get(id);
    if (!confirmation || confirmation.actorId !== actorId || confirmation.executionKey !== executionKey) return;
    if (['SUCCEEDED', 'FAILED_FINAL', 'EXPIRED'].includes(confirmation.status) && confirmation.status !== status) return;
    confirmation.status = status;
    confirmation.completedAt = Date.now();
    confirmation.failureCode = failureCode;
    confirmation.result = clone(result);
    confirmation.version += 1;
    const execution = this.executions.get(executionKey);
    if (execution) { execution.status = status; execution.result = clone(result); }
  }

  async getExecution(key: string): Promise<ExecutionRecord | undefined> { const value = this.executions.get(key); return value ? { status: value.status, payloadHash: value.payloadHash, result: value.result ? clone(value.result) : undefined, payload: value.payload ? clone(value.payload) : undefined } : undefined; }
  async createPayment(value: PaymentRecord): Promise<PaymentRecord> { const existing = [...this.payments.values()].find((item) => item.actorId === value.actorId && item.idempotencyKey === value.idempotencyKey); if (existing) return clone(existing); this.payments.set(value.id, clone(value)); return clone(value); }
  async updatePayment(id: string, status: PaymentStatus, receiptId?: string, recovery?: { nextRecoveryAt?: string; error?: string; providerStatus?: string }): Promise<PaymentRecord> { const payment = this.payments.get(id); if (!payment) throw new Error('PAYMENT_NOT_FOUND'); if (['SUCCEEDED', 'FAILED'].includes(payment.status) && payment.status !== status) return clone(payment); payment.status = status; payment.providerStatus = recovery?.providerStatus ?? status; payment.lastCheckedAt = new Date().toISOString(); payment.authorizedAt = status === 'SUCCEEDED' ? payment.authorizedAt ?? new Date().toISOString() : payment.authorizedAt; payment.receiptId = receiptId ?? payment.receiptId; payment.recoveryAttempts = status === 'SUCCEEDED' || status === 'FAILED' ? payment.recoveryAttempts : (payment.recoveryAttempts ?? 0) + 1; payment.nextRecoveryAt = recovery?.nextRecoveryAt ?? (status === 'SUCCEEDED' || status === 'FAILED' ? undefined : new Date(Date.now() + 1000).toISOString()); payment.lastRecoveryError = recovery?.error; payment.recoveredAt = status === 'SUCCEEDED' || status === 'FAILED' ? new Date().toISOString() : payment.recoveredAt; payment.recoveryClaimedAt = undefined; payment.recoveryClaimOwner = undefined; return clone(payment); }
  async getPayment(id: string): Promise<PaymentRecord | undefined> { const value = this.payments.get(id); return value ? clone(value) : undefined; }
  async findPayment(actorId: string, idempotencyKey: string): Promise<PaymentRecord | undefined> { const value = [...this.payments.values()].find((item) => item.actorId === actorId && item.idempotencyKey === idempotencyKey); return value ? clone(value) : undefined; }
  async findPaymentByOrder(orderId: string, actorId: string): Promise<PaymentRecord | undefined> { const value = [...this.payments.values()].find((item) => item.orderId === orderId && item.actorId === actorId); return value ? clone(value) : undefined; }
  async createRefund(value: RefundRecord): Promise<RefundRecord> { const existing = [...this.refunds.values()].find((item) => item.paymentId === value.paymentId && (item.idempotencyKey === value.idempotencyKey || (Boolean(value.refundScope) && item.refundScope === value.refundScope))); if (existing) return clone(existing); const payment = this.payments.get(value.paymentId); const refunded = [...this.refunds.values()].filter((item) => item.paymentId === value.paymentId && ['PENDING', 'SUCCEEDED'].includes(item.status)).reduce((sum, item) => sum + item.amount, 0); if (!payment || refunded + value.amount > payment.amount) throw new Error('REFUND_AMOUNT_EXCEEDED'); this.refunds.set(value.id, clone(value)); return clone(value); }
  async updateRefund(id: string, status: RefundStatus, providerStatus?: string, recovery?: { nextRecoveryAt?: string }): Promise<RefundRecord> { const refund = this.refunds.get(id); if (!refund) throw new Error('REFUND_NOT_FOUND'); refund.status = status; refund.providerStatus = providerStatus ?? status; refund.lastCheckedAt = new Date().toISOString(); refund.completedAt = status === 'SUCCEEDED' || status === 'FAILED' ? new Date().toISOString() : undefined; refund.recoveryAttempts = (refund.recoveryAttempts ?? 0) + (status === 'SUCCEEDED' || status === 'FAILED' ? 0 : 1); refund.nextRecoveryAt = recovery?.nextRecoveryAt; return clone(refund); }
  async getRefundByKey(paymentId: string, idempotencyKey: string): Promise<RefundRecord | undefined> { const value = [...this.refunds.values()].find((item) => item.paymentId === paymentId && item.idempotencyKey === idempotencyKey); return value ? clone(value) : undefined; }
  async listRefunds(paymentId: string): Promise<RefundRecord[]> { return [...this.refunds.values()].filter((item) => item.paymentId === paymentId).map(clone); }
  async listAllPayments(page: number, pageSize: number): Promise<{ items: PaymentRecord[]; total: number }> { const all = [...this.payments.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)); const start = (Math.max(page, 1) - 1) * pageSize; return { total: all.length, items: all.slice(start, start + pageSize).map(clone) }; }
  async listAllRefunds(page: number, pageSize: number): Promise<{ items: RefundRecord[]; total: number }> { const all = [...this.refunds.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)); const start = (Math.max(page, 1) - 1) * pageSize; return { total: all.length, items: all.slice(start, start + pageSize).map(clone) }; }
  async listPaymentsForReconciliation(): Promise<PaymentRecord[]> { return [...this.payments.values()].filter((item) => item.status === 'SUCCEEDED').map(clone); }
  async listPaymentsForRecovery(now: number): Promise<PaymentRecord[]> { return [...this.payments.values()].filter((item) => ['PENDING', 'TIMED_OUT', 'UNKNOWN'].includes(item.status) && (!item.nextRecoveryAt || Date.parse(item.nextRecoveryAt) <= now)).map(clone); }
  async claimPaymentsForRecovery(now: number, owner: string, limit: number): Promise<PaymentRecord[]> { const claimed: PaymentRecord[] = []; for (const payment of this.payments.values()) { if (claimed.length >= limit) break; if (!['PENDING', 'TIMED_OUT', 'UNKNOWN'].includes(payment.status) || (payment.nextRecoveryAt && Date.parse(payment.nextRecoveryAt) > now) || (payment.recoveryClaimedAt && Date.parse(payment.recoveryClaimedAt) > now - 30000)) continue; payment.recoveryClaimedAt = new Date(now).toISOString(); payment.recoveryClaimOwner = owner; claimed.push(clone(payment)); } return claimed; }
  async createPaymentProviderTransaction(value: PaymentProviderTransaction): Promise<PaymentProviderTransaction> { const existing = this.providerPayments.get(value.providerReference); if (existing) return clone(existing); this.providerPayments.set(value.providerReference, clone(value)); return clone(value); }
  async getPaymentProviderTransaction(providerReference: string): Promise<PaymentProviderTransaction | undefined> { const value = this.providerPayments.get(providerReference); return value ? clone(value) : undefined; }
  async markPaymentProviderConfirmation(providerReference: string, values: { intendedFinalStatus: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; statusAvailableAt?: string; confirmationId?: string; executionKey?: string }): Promise<PaymentProviderTransaction> { const value = this.providerPayments.get(providerReference); if (!value) throw new Error('PROVIDER_PAYMENT_NOT_FOUND'); if (!value.confirmAttemptedAt) value.confirmAttemptedAt = new Date().toISOString(); value.providerStatus = values.statusAvailableAt && Date.parse(values.statusAvailableAt) > Date.now() ? 'PENDING' : values.intendedFinalStatus; value.intendedFinalStatus = values.intendedFinalStatus; value.statusAvailableAt = values.statusAvailableAt; value.confirmationId = values.confirmationId ?? value.confirmationId; value.executionKey = values.executionKey ?? value.executionKey; value.attemptCount += 1; return clone(value); }
  async claimPaymentProviderConfirmation(providerReference: string, values: { intendedFinalStatus: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; statusAvailableAt?: string; confirmationId?: string; executionKey?: string }): Promise<PaymentProviderConfirmationClaim> { const value = this.providerPayments.get(providerReference); if (!value) throw new Error('PROVIDER_PAYMENT_NOT_FOUND'); if (value.confirmAttemptedAt) return { transaction: clone(value), claimed: false }; value.confirmAttemptedAt = new Date().toISOString(); value.providerStatus = values.statusAvailableAt && Date.parse(values.statusAvailableAt) > Date.now() ? 'PENDING' : values.intendedFinalStatus; value.intendedFinalStatus = values.intendedFinalStatus; value.statusAvailableAt = values.statusAvailableAt; value.confirmationId = values.confirmationId ?? value.confirmationId; value.executionKey = values.executionKey ?? value.executionKey; value.attemptCount += 1; return { transaction: clone(value), claimed: true }; }
  async markPaymentProviderChecked(providerReference: string, status: PaymentProviderTransaction['providerStatus']): Promise<PaymentProviderTransaction> { const value = this.providerPayments.get(providerReference); if (!value) throw new Error('PROVIDER_PAYMENT_NOT_FOUND'); value.providerStatus = status; value.lastStatusCheckAt = new Date().toISOString(); return clone(value); }
  async createRefundProviderTransaction(value: RefundProviderTransaction): Promise<RefundProviderTransaction> { const existing = this.providerRefunds.get(value.providerRefundReference); if (existing) return clone(existing); this.providerRefunds.set(value.providerRefundReference, clone(value)); return clone(value); }
  async getRefundProviderTransaction(providerRefundReference: string): Promise<RefundProviderTransaction | undefined> { const value = this.providerRefunds.get(providerRefundReference); return value ? clone(value) : undefined; }
  async markRefundProviderChecked(providerRefundReference: string, status: RefundProviderTransaction['providerStatus']): Promise<RefundProviderTransaction> { const value = this.providerRefunds.get(providerRefundReference); if (!value) throw new Error('PROVIDER_REFUND_NOT_FOUND'); value.providerStatus = status; value.lastCheckedAt = new Date().toISOString(); return clone(value); }
  async claimStaleConfirmations(cutoff: number, now: number, limit: number): Promise<ConfirmationRecord[]> { const claimed: ConfirmationRecord[] = []; for (const confirmation of this.confirmations.values()) { if (claimed.length >= limit) break; if (confirmation.status === 'PROCESSING' && (confirmation.processingStartedAt ?? 0) < cutoff && ((confirmation.nextRecoveryAt ?? 0) <= now) && (!confirmation.recoveryClaimedAt || confirmation.recoveryClaimedAt < now - 5000)) { confirmation.recoveryClaimedAt = now; confirmation.recoveryAttempts = (confirmation.recoveryAttempts ?? 0) + 1; confirmation.nextRecoveryAt = now + 5000; claimed.push(clone(confirmation)); } } return claimed; }
  async releaseConfirmationRecovery(id: string): Promise<void> { const confirmation = this.confirmations.get(id); if (confirmation) confirmation.recoveryClaimedAt = undefined; }
  async upsertWorkflowReconciliation(value: WorkflowReconciliationRecord): Promise<WorkflowReconciliationRecord> { this.workflowReconciliations.set(value.orderId, clone(value)); return clone(value); }
  async listDueWorkflowReconciliations(_now: string, _limit: number): Promise<WorkflowReconciliationRecord[]> { return []; }
  async listWorkflowReconciliations(page: number, pageSize: number): Promise<{ items: WorkflowReconciliationRecord[]; total: number }> { const all = [...this.workflowReconciliations.values()].map(clone); const start = (Math.max(page, 1) - 1) * pageSize; return { total: all.length, items: all.slice(start, start + pageSize) }; }
  async claimDueWorkflowReconciliations(_now: string, _limit: number, _owner: string): Promise<WorkflowReconciliationRecord[]> { return []; }
  async getMultiServiceWorkflow(workflowId: string, actorId: string): Promise<MultiServiceWorkflowRecord | undefined> {
    const value = this.multiServiceWorkflows.get(workflowId);
    return value && value.actorId === actorId ? clone(value) : undefined;
  }
  async saveMultiServiceWorkflow(value: MultiServiceWorkflowRecord): Promise<MultiServiceWorkflowRecord> {
    const existingByKey = [...this.multiServiceWorkflows.values()].find((item) => item.actorId === value.actorId && item.idempotencyKey === value.idempotencyKey);
    if (existingByKey && existingByKey.requestHash !== value.requestHash) throw new Error('IDEMPOTENCY_KEY_REUSED');
    if (existingByKey && existingByKey.workflowId !== value.workflowId) return clone(existingByKey);
    const existing = this.multiServiceWorkflows.get(value.workflowId);
    if (existing && existing.actorId !== value.actorId) throw new Error('FORBIDDEN');
    if (existing && existing.requestHash !== value.requestHash) throw new Error('IDEMPOTENCY_KEY_REUSED');
    const saved = { ...value, updatedAt: value.updatedAt ?? new Date().toISOString() };
    this.multiServiceWorkflows.set(saved.workflowId, clone(saved));
    return clone(saved);
  }
  async getReceipt(paymentId: string): Promise<Record<string, unknown> | undefined> { const payment = this.payments.get(paymentId); return payment?.receiptId ? { receipt_id: payment.receiptId, payment_id: payment.id, order_id: payment.orderId, amount: { amount: payment.amount, currency: payment.currency }, method: payment.method, status: payment.status, issued_at: payment.createdAt } : undefined; }
  async saveConversation(value: ConversationRecord): Promise<void> { const now = new Date().toISOString(); this.conversations.set(value.conversationId, clone({ ...value, status: value.status ?? 'ACTIVE', createdAt: value.createdAt ?? now, updatedAt: now, lastMessageAt: value.lastMessageAt ?? now })); }
  async getConversation(id: string, actorId: string): Promise<ConversationRecord | undefined> { const value = this.conversations.get(id); return value && value.actorId === actorId ? clone(value) : undefined; }
  async listConversations(actorId: string, options?: { includeArchived?: boolean }): Promise<ConversationRecord[]> { return [...this.conversations.values()].filter((value) => value.actorId === actorId && (options?.includeArchived || value.status !== 'ARCHIVED')).sort((left, right) => Date.parse(right.updatedAt ?? '') - Date.parse(left.updatedAt ?? '')).map(clone); }
  async createConversation(value: { conversationId: string; actorId: string; title?: string; serviceContext?: string }): Promise<ConversationRecord> { const existing = this.conversations.get(value.conversationId); if (existing && existing.actorId !== value.actorId) throw new Error('FORBIDDEN'); if (existing) return clone(existing); const now = new Date().toISOString(); const created: ConversationRecord = { conversationId: value.conversationId, actorId: value.actorId, messages: [], state: {}, version: 0, title: value.title, serviceContext: value.serviceContext, status: 'ACTIVE', createdAt: now, updatedAt: now, lastMessageAt: now }; this.conversations.set(created.conversationId, clone(created)); return clone(created); }
  async updateConversation(id: string, actorId: string, patch: { title?: string; status?: 'ACTIVE' | 'ARCHIVED' }): Promise<ConversationRecord | undefined> { const value = this.conversations.get(id); if (!value || value.actorId !== actorId) return undefined; value.title = patch.title ?? value.title; value.status = patch.status ?? value.status ?? 'ACTIVE'; value.archivedAt = value.status === 'ARCHIVED' ? value.archivedAt ?? new Date().toISOString() : undefined; value.updatedAt = new Date().toISOString(); return clone(value); }
  async deleteConversation(id: string, actorId: string): Promise<boolean> { const value = this.conversations.get(id); if (!value || value.actorId !== actorId) return false; this.conversations.delete(id); return true; }
  async listSavedAddresses(actorId: string): Promise<SavedAddressRecord[]> { return [...this.savedAddresses.values()].filter((value) => value.actorId === actorId).sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).map(clone); }
  async getSavedAddress(id: string, actorId: string): Promise<SavedAddressRecord | undefined> { const value = this.savedAddresses.get(id); return value && value.actorId === actorId ? clone(value) : undefined; }
  async createSavedAddress(value: SavedAddressRecord): Promise<SavedAddressRecord> { if (value.isDefault) for (const address of this.savedAddresses.values()) if (address.actorId === value.actorId) address.isDefault = false; this.savedAddresses.set(value.id, clone(value)); return clone(value); }
  async updateSavedAddress(id: string, actorId: string, patch: Partial<Pick<SavedAddressRecord, 'label' | 'addressText' | 'city' | 'district' | 'ward' | 'latitude' | 'longitude' | 'provider' | 'source' | 'isDefault'>>): Promise<SavedAddressRecord | undefined> { const value = this.savedAddresses.get(id); if (!value || value.actorId !== actorId) return undefined; if (patch.isDefault) for (const address of this.savedAddresses.values()) if (address.actorId === actorId) address.isDefault = address.id === id; Object.assign(value, patch, { updatedAt: new Date().toISOString() }); return clone(value); }
  async deleteSavedAddress(id: string, actorId: string): Promise<boolean> { const value = this.savedAddresses.get(id); if (!value || value.actorId !== actorId) return false; this.savedAddresses.delete(id); if (value.isDefault) { const replacement = [...this.savedAddresses.values()].find((candidate) => candidate.actorId === actorId); if (replacement) replacement.isDefault = true; } return true; }
  async appendConversationTurn(value: { conversationId: string; actorId: string; userMessage: ConversationRecord['messages'][number]; assistantMessage: ConversationRecord['messages'][number]; stateUpdates: Record<string, unknown> }): Promise<ConversationRecord> { const existing = this.conversations.get(value.conversationId); if (existing && existing.actorId !== value.actorId) throw new Error('FORBIDDEN'); const now = new Date().toISOString(); const next: ConversationRecord = existing ? clone(existing) : { conversationId: value.conversationId, actorId: value.actorId, messages: [], state: {}, version: 0, status: 'ACTIVE', createdAt: now }; next.messages.push(clone(value.userMessage), clone(value.assistantMessage)); next.state = { ...next.state, ...clone(value.stateUpdates) }; next.version = (next.version ?? 0) + 1; next.status = 'ACTIVE'; next.updatedAt = now; next.lastMessageAt = now; this.conversations.set(next.conversationId, clone(next)); return clone(next); }
  async mergeConversationState(conversationId: string, actorId: string, stateUpdates: Record<string, unknown>): Promise<void> { const existing = this.conversations.get(conversationId); if (existing && existing.actorId !== actorId) throw new Error('FORBIDDEN'); const now = new Date().toISOString(); if (!existing) { this.conversations.set(conversationId, { conversationId, actorId, messages: [], state: clone(stateUpdates), version: 1, status: 'ACTIVE', createdAt: now, updatedAt: now, lastMessageAt: now }); return; } existing.state = { ...existing.state, ...clone(stateUpdates) }; existing.version = (existing.version ?? 0) + 1; existing.updatedAt = now; }
  private assistantActionKey(actorId: string, conversationId: string, actionId: string): string { return JSON.stringify([actorId, conversationId, actionId]); }
  async getAssistantActionExecution(actorId: string, conversationId: string, actionId: string): Promise<AssistantActionExecutionRecord | undefined> { const value = this.assistantActionExecutions.get(this.assistantActionKey(actorId, conversationId, actionId)); return value ? clone(value) : undefined; }
  async claimAssistantActionExecution(actorId: string, conversationId: string, actionId: string, idempotencyKey: string, requestHash: string): Promise<AssistantActionExecutionClaim> {
    const key = this.assistantActionKey(actorId, conversationId, actionId);
    const existing = this.assistantActionExecutions.get(key);
    if (existing) {
      if (existing.idempotencyKey !== idempotencyKey) return { state: 'ACTION_NOT_AVAILABLE', execution: clone(existing) };
      if (existing.requestHash !== requestHash) return { state: 'IDEMPOTENCY_KEY_REUSED', execution: clone(existing) };
      if (existing.status === 'SUCCEEDED') return { state: 'SUCCEEDED', execution: clone(existing) };
      if (existing.status === 'FAILED_FINAL') return { state: 'FAILED_FINAL', execution: clone(existing) };
      const stale = existing.status === 'FAILED_RETRYABLE'
        || (existing.status === 'PROCESSING' && Boolean(existing.processingExpiresAt) && Date.parse(existing.processingExpiresAt!) <= Date.now());
      if (stale) {
        existing.status = 'PROCESSING';
        existing.processingExpiresAt = new Date(Date.now() + 30_000).toISOString();
        existing.updatedAt = new Date().toISOString();
        existing.completedAt = undefined;
        existing.response = undefined;
        return { state: 'CLAIMED', execution: clone(existing) };
      }
      return { state: 'PROCESSING', execution: clone(existing) };
    }
    const now = new Date();
    const created: AssistantActionExecutionRecord = { actorId, conversationId, actionId, idempotencyKey, requestHash, status: 'PROCESSING', createdAt: now.toISOString(), updatedAt: now.toISOString(), processingExpiresAt: new Date(now.getTime() + 30_000).toISOString() };
    this.assistantActionExecutions.set(key, clone(created));
    return { state: 'CLAIMED', execution: clone(created) };
  }
  async commitAssistantActionSuccess(value: AssistantActionSuccessCommit): Promise<ConversationRecord> {
    const executionKey = this.assistantActionKey(value.actorId, value.conversationId, value.actionId);
    const execution = this.assistantActionExecutions.get(executionKey);
    if (
      !execution
      || execution.idempotencyKey !== value.idempotencyKey
      || execution.requestHash !== value.requestHash
      || execution.status !== 'PROCESSING'
    ) throw new Error('ASSISTANT_ACTION_EXECUTION_NOT_PROCESSING');

    const existingConversation = this.conversations.get(value.conversationId);
    if (existingConversation && existingConversation.actorId !== value.actorId) throw new Error('FORBIDDEN');
    const nextConversation: ConversationRecord = existingConversation
      ? clone(existingConversation)
      : { conversationId: value.conversationId, actorId: value.actorId, messages: [], state: {}, version: 0 };
    nextConversation.messages.push(clone(value.userMessage), clone(value.assistantMessage));
    nextConversation.state = { ...nextConversation.state, ...clone(value.stateUpdates) };
    nextConversation.version = (nextConversation.version ?? 0) + 1;

    const now = new Date().toISOString();
    const nextExecution: AssistantActionExecutionRecord = {
      ...clone(execution),
      status: 'SUCCEEDED',
      response: clone(value.response),
      processingExpiresAt: undefined,
      updatedAt: now,
      completedAt: now,
    };
    // Prepare all clones before either map is touched. Map writes are
    // synchronous, giving the test adapter the same all-or-nothing observable
    // result as the PostgreSQL transaction below.
    const persistedConversation = clone(nextConversation);
    const persistedExecution = clone(nextExecution);
    this.conversations.set(value.conversationId, persistedConversation);
    this.assistantActionExecutions.set(executionKey, persistedExecution);
    return clone(persistedConversation);
  }
  async completeAssistantActionExecution(actorId: string, conversationId: string, actionId: string, idempotencyKey: string, requestHash: string, status: Exclude<AssistantActionExecutionStatus, 'SUCCEEDED'>, response?: Record<string, unknown>): Promise<void> {
    const key = this.assistantActionKey(actorId, conversationId, actionId);
    const existing = this.assistantActionExecutions.get(key);
    if (!existing || existing.idempotencyKey !== idempotencyKey || existing.requestHash !== requestHash) throw new Error('ASSISTANT_ACTION_EXECUTION_NOT_FOUND');
    if (existing.status === 'SUCCEEDED') return;
    if (existing.status === 'FAILED_FINAL') return;
    existing.status = status;
    existing.response = response ? clone(response) : undefined;
    existing.processingExpiresAt = undefined;
    existing.updatedAt = new Date().toISOString();
    existing.completedAt = status === 'FAILED_FINAL' ? new Date().toISOString() : undefined;
  }
  async audit(value: { action: string; actorId?: string; correlationId?: string; resourceId?: string; metadata?: Record<string, unknown> }): Promise<void> { this.audits.push(clone(value)); }
  async checkHealth(): Promise<boolean> { return true; }
  async close(): Promise<void> {}
}

export class PostgresCoreRepository implements CoreRepository {
  private readonly pool: Pool;
  constructor(databaseUrl: string) { this.pool = new Pool({ connectionString: databaseUrl, max: 5 }); }
  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { const client = await this.pool.connect(); try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  private confirmationFromRow(row: Record<string, unknown>): ConfirmationRecord { return { id: String(row.id), actorId: String(row.actor_id), action: String(row.action), payload: row.payload as Record<string, unknown>, payloadHash: String(row.payload_hash), quoteVersion: String(row.quote_version), amount: Number(row.amount), currency: String(row.currency), expiresAt: new Date(String(row.expires_at)).getTime(), createdAt: new Date(String(row.created_at)).toISOString(), status: row.status as ConfirmationStatus, executionKey: row.execution_key ? String(row.execution_key) : undefined, processingStartedAt: row.processing_started_at ? new Date(String(row.processing_started_at)).getTime() : undefined, completedAt: row.completed_at ? new Date(String(row.completed_at)).getTime() : undefined, failureCode: row.failure_code ? String(row.failure_code) : undefined, result: row.result as Record<string, unknown> | undefined, version: Number(row.version), recoveryClaimedAt: row.recovery_claimed_at ? new Date(String(row.recovery_claimed_at)).getTime() : undefined, recoveryAttempts: Number(row.recovery_attempts ?? 0), nextRecoveryAt: row.next_recovery_at ? new Date(String(row.next_recovery_at)).getTime() : undefined } }
  private paymentFromRow(row: Record<string, unknown> | undefined): PaymentRecord | undefined { return row ? { id: String(row.id), actorId: String(row.actor_id), orderId: String(row.order_id), amount: Number(row.amount), currency: String(row.currency), method: row.method as PaymentMethod, status: row.status as PaymentStatus, idempotencyKey: String(row.idempotency_key), payloadHash: String(row.payload_hash ?? ''), createdAt: new Date(String(row.created_at)).toISOString(), receiptId: row.receipt_id ? String(row.receipt_id) : undefined, intentId: row.intent_id ? String(row.intent_id) : undefined, providerReference: row.provider_reference ? String(row.provider_reference) : undefined, providerStatus: row.provider_status ? String(row.provider_status) : undefined, authorizedAt: row.authorized_at ? new Date(String(row.authorized_at)).toISOString() : undefined, lastCheckedAt: row.last_checked_at ? new Date(String(row.last_checked_at)).toISOString() : undefined, confirmationId: row.confirmation_id ? String(row.confirmation_id) : undefined, confirmationExecutionKey: row.confirmation_execution_key ? String(row.confirmation_execution_key) : undefined, conversationId: row.conversation_id ? String(row.conversation_id) : undefined, recoveryAttempts: Number(row.recovery_attempts ?? 0), nextRecoveryAt: row.next_recovery_at ? new Date(String(row.next_recovery_at)).toISOString() : undefined, lastRecoveryError: row.last_recovery_error ? String(row.last_recovery_error) : undefined, recoveredAt: row.recovered_at ? new Date(String(row.recovered_at)).toISOString() : undefined, recoveryClaimedAt: row.recovery_claimed_at ? new Date(String(row.recovery_claimed_at)).toISOString() : undefined, recoveryClaimOwner: row.recovery_claim_owner ? String(row.recovery_claim_owner) : undefined } : undefined; }
  private refundFromRow(row: Record<string, unknown>): RefundRecord { return { id: String(row.id), paymentId: String(row.payment_id), actorId: String(row.actor_id), amount: Number(row.amount), currency: String(row.currency), reason: String(row.reason), status: row.status as RefundStatus, idempotencyKey: String(row.idempotency_key), payloadHash: String(row.payload_hash ?? ''), createdAt: new Date(String(row.created_at)).toISOString(), completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : undefined, providerRefundReference: row.provider_refund_reference ? String(row.provider_refund_reference) : undefined, paymentProviderReference: row.payment_provider_reference ? String(row.payment_provider_reference) : undefined, providerStatus: row.provider_status ? String(row.provider_status) : undefined, attemptedAt: row.attempted_at ? new Date(String(row.attempted_at)).toISOString() : undefined, statusAvailableAt: row.status_available_at ? new Date(String(row.status_available_at)).toISOString() : undefined, lastCheckedAt: row.last_checked_at ? new Date(String(row.last_checked_at)).toISOString() : undefined, refundScope: row.refund_scope ? String(row.refund_scope) : undefined, recoveryAttempts: Number(row.recovery_attempts ?? 0), nextRecoveryAt: row.next_recovery_at ? new Date(String(row.next_recovery_at)).toISOString() : undefined }; }
  private providerPaymentFromRow(row: Record<string, unknown>): PaymentProviderTransaction { return { providerReference: String(row.provider_reference), paymentId: String(row.payment_id), actorId: String(row.actor_id), orderId: String(row.order_id), requestHash: String(row.request_hash), providerStatus: row.provider_status as PaymentProviderTransaction['providerStatus'], intendedFinalStatus: row.intended_final_status as PaymentProviderTransaction['intendedFinalStatus'], confirmationId: row.confirmation_id ? String(row.confirmation_id) : undefined, executionKey: row.execution_key ? String(row.execution_key) : undefined, confirmAttemptedAt: row.confirm_attempted_at ? new Date(String(row.confirm_attempted_at)).toISOString() : undefined, statusAvailableAt: row.status_available_at ? new Date(String(row.status_available_at)).toISOString() : undefined, lastStatusCheckAt: row.last_status_check_at ? new Date(String(row.last_status_check_at)).toISOString() : undefined, attemptCount: Number(row.attempt_count ?? 0) }; }
  private providerRefundFromRow(row: Record<string, unknown>): RefundProviderTransaction { return { providerRefundReference: String(row.provider_refund_reference), refundId: String(row.refund_id), paymentProviderReference: String(row.payment_provider_reference), requestHash: String(row.request_hash), providerStatus: row.provider_status as RefundProviderTransaction['providerStatus'], attemptedAt: row.attempted_at ? new Date(String(row.attempted_at)).toISOString() : undefined, statusAvailableAt: row.status_available_at ? new Date(String(row.status_available_at)).toISOString() : undefined, lastCheckedAt: row.last_checked_at ? new Date(String(row.last_checked_at)).toISOString() : undefined }; }
  private conversationFromRow(row: Record<string, unknown>): ConversationRecord { return { conversationId: String(row.conversation_id), actorId: String(row.actor_id), messages: row.messages as ConversationRecord['messages'], state: row.state as Record<string, unknown>, title: row.title ? String(row.title) : undefined, status: row.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE', archivedAt: row.archived_at ? new Date(String(row.archived_at)).toISOString() : undefined, createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : undefined, updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : undefined, lastMessageAt: row.last_message_at ? new Date(String(row.last_message_at)).toISOString() : undefined, serviceContext: row.service_context ? String(row.service_context) : undefined, version: Number(row.version ?? 0) }; }
  private savedAddressFromRow(row: Record<string, unknown>): SavedAddressRecord { return { id: String(row.id), actorId: String(row.actor_id), label: String(row.label), addressText: String(row.address_text), city: row.city ? String(row.city) : undefined, district: row.district ? String(row.district) : undefined, ward: row.ward ? String(row.ward) : undefined, latitude: row.latitude === null || row.latitude === undefined ? undefined : Number(row.latitude), longitude: row.longitude === null || row.longitude === undefined ? undefined : Number(row.longitude), provider: row.provider ? String(row.provider) : undefined, source: row.source === 'geocoded' ? 'geocoded' : row.source === 'imported' ? 'imported' : 'manual', isDefault: Boolean(row.is_default), createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString() }; }

  async createConfirmation(value: ConfirmationRecord): Promise<ConfirmationRecord> { await this.pool.query('INSERT INTO confirmations (id,actor_id,action,payload,payload_hash,quote_version,amount,currency,expires_at,created_at,status,version) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,\'PENDING\',0)', [value.id, value.actorId, value.action, JSON.stringify(value.payload), value.payloadHash, value.quoteVersion, value.amount, value.currency, new Date(value.expiresAt), value.createdAt]); return { ...value, status: 'PENDING', version: 0 }; }
  async getConfirmation(id: string): Promise<ConfirmationRecord | undefined> { const result = await this.pool.query('SELECT * FROM confirmations WHERE id=$1', [id]); return result.rows[0] ? this.confirmationFromRow(result.rows[0]) : undefined; }

  async claimConfirmation(id: string, actorId: string, executionKey: string, payloadHash: string, now: number, executionPayload?: Record<string, unknown>): Promise<ConfirmationClaim> {
    return this.transaction(async (client) => {
      const result = await client.query('SELECT * FROM confirmations WHERE id=$1 AND actor_id=$2 FOR UPDATE', [id, actorId]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return { state: 'CONFIRMATION_ALREADY_USED' as const };
      const existing = await client.query('SELECT * FROM confirmation_executions WHERE confirmation_id=$1 AND idempotency_key=$2 FOR UPDATE', [id, executionKey]);
      const execution = existing.rows[0] as Record<string, unknown> | undefined;
      if (execution) {
        if (String(execution.payload_hash) !== payloadHash) return { state: 'IDEMPOTENCY_KEY_REUSED' as const };
        if (String(execution.status) === 'FAILED_RETRYABLE') {
          const resumed = await client.query("UPDATE confirmations SET status='PROCESSING',processing_started_at=now(),recovery_claimed_at=NULL,next_recovery_at=NULL,version=version+1 WHERE id=$1 RETURNING *", [id]);
          await client.query("UPDATE confirmation_executions SET status='PROCESSING',result=NULL,execution_payload=COALESCE(execution_payload,$2::jsonb) WHERE execution_key=$1", [executionKey, JSON.stringify(executionPayload ?? {})]);
          return { state: 'CLAIMED' as const, confirmation: this.confirmationFromRow(resumed.rows[0]) };
        }
        return { state: String(execution.status) as ConfirmationClaimState, confirmation: this.confirmationFromRow(row), result: execution.result as Record<string, unknown> | undefined };
      }
      const confirmation = this.confirmationFromRow(row);
      if (confirmation.status === 'PENDING' && confirmation.expiresAt <= now) {
        await client.query("UPDATE confirmations SET status='EXPIRED',version=version+1 WHERE id=$1", [id]);
        confirmation.status = 'EXPIRED';
        return { state: 'EXPIRED' as const, confirmation };
      }
      if (confirmation.status === 'PENDING') {
        const claimed = await client.query("UPDATE confirmations SET status='PROCESSING',execution_key=$1,processing_started_at=now(),version=version+1 WHERE id=$2 AND status='PENDING' RETURNING *", [executionKey, id]);
        await client.query('INSERT INTO confirmation_executions (execution_key,confirmation_id,actor_id,idempotency_key,payload_hash,status,execution_payload) VALUES ($1,$2,$3,$4,$5,\'PROCESSING\',$6::jsonb)', [executionKey, id, actorId, executionKey, payloadHash, JSON.stringify(executionPayload ?? {})]);
        return { state: 'CLAIMED' as const, confirmation: this.confirmationFromRow(claimed.rows[0]) };
      }
      if (confirmation.result) return { state: confirmation.status, confirmation, result: confirmation.result };
      return { state: ['SUCCEEDED', 'FAILED_FINAL', 'EXPIRED'].includes(confirmation.status) ? 'CONFIRMATION_ALREADY_USED' : 'PROCESSING', confirmation };
    });
  }

  async completeConfirmation(id: string, actorId: string, executionKey: string, status: Exclude<ConfirmationStatus, 'PENDING' | 'PROCESSING' | 'EXPIRED'>, result: Record<string, unknown>, failureCode?: string): Promise<void> { await this.transaction(async (client) => { const updated = await client.query("UPDATE confirmations SET status=$1,result=$2::jsonb,failure_code=$3,completed_at=now(),version=version+1 WHERE id=$4 AND actor_id=$5 AND execution_key=$6 AND (status NOT IN ('SUCCEEDED','FAILED_FINAL','EXPIRED') OR status=$1) RETURNING id", [status, JSON.stringify(result), failureCode ?? null, id, actorId, executionKey]); if (updated.rowCount) await client.query('UPDATE confirmation_executions SET status=$1,result=$2::jsonb WHERE execution_key=$3', [status, JSON.stringify(result), executionKey]); }); }
  async getExecution(key: string): Promise<ExecutionRecord | undefined> { const result = await this.pool.query('SELECT status,payload_hash,result,execution_payload FROM confirmation_executions WHERE execution_key=$1', [key]); const row = result.rows[0]; return row ? { status: String(row.status), payloadHash: String(row.payload_hash), result: row.result as Record<string, unknown> | undefined, payload: row.execution_payload as Record<string, unknown> | undefined } : undefined; }

  async createPayment(value: PaymentRecord): Promise<PaymentRecord> { return this.transaction(async (client) => { await client.query('INSERT INTO payments (id,actor_id,order_id,amount,currency,method,status,idempotency_key,payload_hash,receipt_id,intent_id,provider_reference,provider_status,authorized_at,last_checked_at,created_at,completed_at,confirmation_id,confirmation_execution_key,conversation_id,recovery_attempts,next_recovery_at,last_recovery_error,recovered_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) ON CONFLICT (actor_id,idempotency_key) DO NOTHING', [value.id,value.actorId,value.orderId,value.amount,value.currency,value.method,value.status,value.idempotencyKey,value.payloadHash,value.receiptId ?? null,value.intentId ?? null,value.providerReference ?? value.id,value.providerStatus ?? value.status,value.authorizedAt ?? null,value.lastCheckedAt ?? new Date().toISOString(),value.createdAt,value.status === 'SUCCEEDED' ? value.createdAt : null,value.confirmationId ?? null,value.confirmationExecutionKey ?? null,value.conversationId ?? null,value.recoveryAttempts ?? 0,value.nextRecoveryAt ?? new Date().toISOString(),value.lastRecoveryError ?? null,value.recoveredAt ?? null]); const result = await client.query('SELECT * FROM payments WHERE actor_id=$1 AND idempotency_key=$2 FOR UPDATE', [value.actorId,value.idempotencyKey]); const payment = this.paymentFromRow(result.rows[0]); if (!payment) throw new Error('PAYMENT_NOT_PERSISTED'); if (payment.status === 'SUCCEEDED' && payment.receiptId) await client.query('INSERT INTO receipts (id,payment_id) VALUES ($1,$2) ON CONFLICT (payment_id) DO NOTHING', [payment.receiptId,payment.id]); return payment; }); }
  async updatePayment(id: string, status: PaymentStatus, receiptId?: string, recovery?: { nextRecoveryAt?: string; error?: string; providerStatus?: string }): Promise<PaymentRecord> { return this.transaction(async (client) => { const result = await client.query('UPDATE payments SET status=$1,provider_status=COALESCE($2,$1),last_checked_at=now(),authorized_at=CASE WHEN $1=\'SUCCEEDED\' THEN COALESCE(authorized_at,now()) ELSE authorized_at END,receipt_id=COALESCE($3,receipt_id),completed_at=CASE WHEN $1 IN (\'SUCCEEDED\',\'FAILED\',\'TIMED_OUT\',\'UNKNOWN\') THEN now() ELSE completed_at END,recovery_attempts=CASE WHEN $1 IN (\'SUCCEEDED\',\'FAILED\') THEN recovery_attempts ELSE recovery_attempts+1 END,next_recovery_at=CASE WHEN $1 IN (\'SUCCEEDED\',\'FAILED\') THEN NULL ELSE COALESCE($4,now()+interval \'1 second\') END,last_recovery_error=$5,recovered_at=CASE WHEN $1 IN (\'SUCCEEDED\',\'FAILED\') THEN now() ELSE recovered_at END,recovery_claimed_at=NULL,recovery_claim_owner=NULL,updated_at=now() WHERE id=$6 AND (status NOT IN (\'SUCCEEDED\',\'FAILED\') OR status=$1) RETURNING *', [status, recovery?.providerStatus ?? null, receiptId ?? null, recovery?.nextRecoveryAt ?? null, recovery?.error ?? null, id]); const payment = this.paymentFromRow(result.rows[0]); if (!payment) { const existing = await client.query('SELECT * FROM payments WHERE id=$1', [id]); const current = this.paymentFromRow(existing.rows[0]); if (current) return current; throw new Error('PAYMENT_NOT_FOUND'); } if (payment.status === 'SUCCEEDED' && payment.receiptId) await client.query('INSERT INTO receipts (id,payment_id) VALUES ($1,$2) ON CONFLICT (payment_id) DO NOTHING', [payment.receiptId,payment.id]); return payment; }); }
  async getPayment(id: string): Promise<PaymentRecord | undefined> { const result = await this.pool.query('SELECT * FROM payments WHERE id=$1', [id]); return this.paymentFromRow(result.rows[0]); }
  async findPayment(actorId: string, idempotencyKey: string): Promise<PaymentRecord | undefined> { const result = await this.pool.query('SELECT * FROM payments WHERE actor_id=$1 AND idempotency_key=$2', [actorId,idempotencyKey]); return this.paymentFromRow(result.rows[0]); }
  async findPaymentByOrder(orderId: string, actorId: string): Promise<PaymentRecord | undefined> { const result = await this.pool.query('SELECT * FROM payments WHERE order_id=$1 AND actor_id=$2 ORDER BY created_at DESC LIMIT 1', [orderId,actorId]); return this.paymentFromRow(result.rows[0]); }
  async createRefund(value: RefundRecord): Promise<RefundRecord> { return this.transaction(async (client) => { const payment = await client.query('SELECT amount,currency,actor_id,provider_reference FROM payments WHERE id=$1 FOR UPDATE', [value.paymentId]); if (!payment.rows[0] || String(payment.rows[0].actor_id) !== value.actorId) throw new Error('PAYMENT_NOT_FOUND'); const existing = await client.query('SELECT * FROM payment_refunds WHERE payment_id=$1 AND (idempotency_key=$2 OR ($3::text IS NOT NULL AND refund_scope=$3)) FOR UPDATE', [value.paymentId,value.idempotencyKey,value.refundScope ?? null]); if (existing.rows[0]) return this.refundFromRow(existing.rows[0]); const total = await client.query("SELECT COALESCE(SUM(amount),0) AS amount FROM payment_refunds WHERE payment_id=$1 AND status IN ('PENDING','SUCCEEDED')", [value.paymentId]); if (Number(total.rows[0].amount) + value.amount > Number(payment.rows[0].amount)) throw new Error('REFUND_AMOUNT_EXCEEDED'); const inserted = await client.query('INSERT INTO payment_refunds (id,payment_id,actor_id,amount,currency,reason,status,idempotency_key,payload_hash,created_at,updated_at,completed_at,provider_refund_reference,payment_provider_reference,provider_status,attempted_at,status_available_at,last_checked_at,refund_scope) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *', [value.id,value.paymentId,value.actorId,value.amount,value.currency,value.reason,value.status,value.idempotencyKey,value.payloadHash,value.createdAt,value.status === 'SUCCEEDED' ? value.createdAt : null,value.providerRefundReference ?? `sandbox-refund:${value.id}`,value.paymentProviderReference ?? String(payment.rows[0].provider_reference ?? ''),value.providerStatus ?? 'PENDING',value.attemptedAt ?? null,value.statusAvailableAt ?? null,value.lastCheckedAt ?? null,value.refundScope ?? 'FOOD_ORDER_FINAL_REFUND']); return this.refundFromRow(inserted.rows[0]); }); }
  async updateRefund(id: string, status: RefundStatus, providerStatus?: string, recovery?: { nextRecoveryAt?: string }): Promise<RefundRecord> { return this.transaction(async (client) => { const result = await client.query('UPDATE payment_refunds SET status=$1,provider_status=$2,last_checked_at=now(),completed_at=CASE WHEN $1 IN (\'SUCCEEDED\',\'FAILED\') THEN now() ELSE NULL END,recovery_attempts=CASE WHEN $1 IN (\'SUCCEEDED\',\'FAILED\') THEN recovery_attempts ELSE recovery_attempts+1 END,next_recovery_at=$3,updated_at=now() WHERE id=$4 RETURNING *', [status, providerStatus ?? status, recovery?.nextRecoveryAt ?? null, id]); if (!result.rows[0]) throw new Error('REFUND_NOT_FOUND'); return this.refundFromRow(result.rows[0]); }); }
  async getRefundByKey(paymentId: string, idempotencyKey: string): Promise<RefundRecord | undefined> { const result = await this.pool.query('SELECT * FROM payment_refunds WHERE payment_id=$1 AND idempotency_key=$2', [paymentId,idempotencyKey]); return result.rows[0] ? this.refundFromRow(result.rows[0]) : undefined; }
  async listRefunds(paymentId: string): Promise<RefundRecord[]> { const result = await this.pool.query('SELECT * FROM payment_refunds WHERE payment_id=$1 ORDER BY created_at', [paymentId]); return result.rows.map((row) => this.refundFromRow(row)); }
  async listAllPayments(page: number, pageSize: number): Promise<{ items: PaymentRecord[]; total: number }> { const safePage = Math.max(page, 1); const safePageSize = Math.min(Math.max(pageSize, 1), 100); const [count, rows] = await Promise.all([this.pool.query('SELECT count(*)::int AS count FROM payments'), this.pool.query('SELECT * FROM payments ORDER BY created_at DESC LIMIT $1 OFFSET $2', [safePageSize, (safePage - 1) * safePageSize])]); return { total: Number(count.rows[0]?.count ?? 0), items: rows.rows.map((row) => this.paymentFromRow(row)).filter((value): value is PaymentRecord => Boolean(value)) }; }
  async listAllRefunds(page: number, pageSize: number): Promise<{ items: RefundRecord[]; total: number }> { const safePage = Math.max(page, 1); const safePageSize = Math.min(Math.max(pageSize, 1), 100); const [count, rows] = await Promise.all([this.pool.query('SELECT count(*)::int AS count FROM payment_refunds'), this.pool.query('SELECT * FROM payment_refunds ORDER BY created_at DESC LIMIT $1 OFFSET $2', [safePageSize, (safePage - 1) * safePageSize])]); return { total: Number(count.rows[0]?.count ?? 0), items: rows.rows.map((row) => this.refundFromRow(row)) }; }
  async listPaymentsForReconciliation(): Promise<PaymentRecord[]> { const result = await this.pool.query("SELECT * FROM payments WHERE status='SUCCEEDED'"); return result.rows.map((row) => this.paymentFromRow(row)).filter((value): value is PaymentRecord => Boolean(value)); }
  async listPaymentsForRecovery(now: number): Promise<PaymentRecord[]> { const result = await this.pool.query("SELECT * FROM payments WHERE status IN ('PENDING','TIMED_OUT','UNKNOWN') AND (next_recovery_at IS NULL OR next_recovery_at <= $1) ORDER BY COALESCE(next_recovery_at,last_checked_at,created_at) LIMIT 50", [new Date(now)]); return result.rows.map((row) => this.paymentFromRow(row)).filter((value): value is PaymentRecord => Boolean(value)); }
  async claimPaymentsForRecovery(now: number, owner: string, limit: number): Promise<PaymentRecord[]> { return this.transaction(async (client) => { const rows = await client.query("SELECT * FROM payments WHERE status IN ('PENDING','TIMED_OUT','UNKNOWN') AND (next_recovery_at IS NULL OR next_recovery_at <= $1) AND (recovery_claimed_at IS NULL OR recovery_claimed_at < $1 - interval '30 seconds') ORDER BY COALESCE(next_recovery_at,last_checked_at,created_at) FOR UPDATE SKIP LOCKED LIMIT $2", [new Date(now), limit]); const claimed: PaymentRecord[] = []; for (const row of rows.rows) { const updated = await client.query('UPDATE payments SET recovery_claimed_at=now(),recovery_claim_owner=$1,updated_at=now() WHERE id=$2 RETURNING *', [owner, row.id]); const payment = this.paymentFromRow(updated.rows[0]); if (payment) claimed.push(payment); } return claimed; }); }
  async createPaymentProviderTransaction(value: PaymentProviderTransaction): Promise<PaymentProviderTransaction> { return this.transaction(async (client) => { await client.query('INSERT INTO sandbox_payment_provider_transactions (provider_reference,payment_id,actor_id,order_id,request_hash,provider_status,intended_final_status,confirmation_id,execution_key,confirm_attempted_at,status_available_at,last_status_check_at,attempt_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (provider_reference) DO NOTHING', [value.providerReference,value.paymentId,value.actorId,value.orderId,value.requestHash,value.providerStatus,value.intendedFinalStatus ?? null,value.confirmationId ?? null,value.executionKey ?? null,value.confirmAttemptedAt ?? null,value.statusAvailableAt ?? null,value.lastStatusCheckAt ?? null,value.attemptCount]); const row = await client.query('SELECT * FROM sandbox_payment_provider_transactions WHERE provider_reference=$1 FOR UPDATE', [value.providerReference]); return this.providerPaymentFromRow(row.rows[0]); }); }
  async getPaymentProviderTransaction(providerReference: string): Promise<PaymentProviderTransaction | undefined> { const result = await this.pool.query('SELECT * FROM sandbox_payment_provider_transactions WHERE provider_reference=$1', [providerReference]); return result.rows[0] ? this.providerPaymentFromRow(result.rows[0]) : undefined; }
  async claimPaymentProviderConfirmation(providerReference: string, values: { intendedFinalStatus: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; statusAvailableAt?: string; confirmationId?: string; executionKey?: string }): Promise<PaymentProviderConfirmationClaim> { return this.transaction(async (client) => { const claimed = await client.query("UPDATE sandbox_payment_provider_transactions SET provider_status=CASE WHEN $2::timestamptz IS NOT NULL AND $2::timestamptz > now() THEN 'PENDING' ELSE $1 END,intended_final_status=$1,confirm_attempted_at=now(),status_available_at=$2,confirmation_id=COALESCE($3,confirmation_id),execution_key=COALESCE($4,execution_key),attempt_count=attempt_count+1,updated_at=now(),version=version+1 WHERE provider_reference=$5 AND confirm_attempted_at IS NULL RETURNING *", [values.intendedFinalStatus, values.statusAvailableAt ?? null, values.confirmationId ?? null, values.executionKey ?? null, providerReference]); if (claimed.rows[0]) return { transaction: this.providerPaymentFromRow(claimed.rows[0]), claimed: true }; const existing = await client.query('SELECT * FROM sandbox_payment_provider_transactions WHERE provider_reference=$1 FOR UPDATE', [providerReference]); if (!existing.rows[0]) throw new Error('PROVIDER_PAYMENT_NOT_FOUND'); return { transaction: this.providerPaymentFromRow(existing.rows[0]), claimed: false }; }); }
  async markPaymentProviderConfirmation(providerReference: string, values: { intendedFinalStatus: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; statusAvailableAt?: string; confirmationId?: string; executionKey?: string }): Promise<PaymentProviderTransaction> { return (await this.claimPaymentProviderConfirmation(providerReference, values)).transaction; }
  async markPaymentProviderChecked(providerReference: string, status: PaymentProviderTransaction['providerStatus']): Promise<PaymentProviderTransaction> { return this.transaction(async (client) => { const result = await client.query('UPDATE sandbox_payment_provider_transactions SET provider_status=$1,last_status_check_at=now(),updated_at=now(),version=version+1 WHERE provider_reference=$2 RETURNING *', [status, providerReference]); if (!result.rows[0]) throw new Error('PROVIDER_PAYMENT_NOT_FOUND'); return this.providerPaymentFromRow(result.rows[0]); }); }
  async createRefundProviderTransaction(value: RefundProviderTransaction): Promise<RefundProviderTransaction> { return this.transaction(async (client) => { await client.query('INSERT INTO sandbox_payment_provider_refunds (provider_refund_reference,refund_id,payment_provider_reference,request_hash,provider_status,attempted_at,status_available_at,last_checked_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (provider_refund_reference) DO NOTHING', [value.providerRefundReference,value.refundId,value.paymentProviderReference,value.requestHash,value.providerStatus,value.attemptedAt ?? null,value.statusAvailableAt ?? null,value.lastCheckedAt ?? null]); const row = await client.query('SELECT * FROM sandbox_payment_provider_refunds WHERE provider_refund_reference=$1 FOR UPDATE', [value.providerRefundReference]); return this.providerRefundFromRow(row.rows[0]); }); }
  async getRefundProviderTransaction(providerRefundReference: string): Promise<RefundProviderTransaction | undefined> { const result = await this.pool.query('SELECT * FROM sandbox_payment_provider_refunds WHERE provider_refund_reference=$1', [providerRefundReference]); return result.rows[0] ? this.providerRefundFromRow(result.rows[0]) : undefined; }
  async markRefundProviderChecked(providerRefundReference: string, status: RefundProviderTransaction['providerStatus']): Promise<RefundProviderTransaction> { return this.transaction(async (client) => { const result = await client.query('UPDATE sandbox_payment_provider_refunds SET provider_status=$1,last_checked_at=now(),updated_at=now(),version=version+1 WHERE provider_refund_reference=$2 RETURNING *', [status, providerRefundReference]); if (!result.rows[0]) throw new Error('PROVIDER_REFUND_NOT_FOUND'); return this.providerRefundFromRow(result.rows[0]); }); }
  async claimStaleConfirmations(cutoff: number, now: number, limit: number): Promise<ConfirmationRecord[]> { return this.transaction(async (client) => { const result = await client.query("SELECT * FROM confirmations WHERE status='PROCESSING' AND processing_started_at < $1 AND (next_recovery_at IS NULL OR next_recovery_at <= now()) AND (recovery_claimed_at IS NULL OR recovery_claimed_at < now()-interval '5 seconds') ORDER BY processing_started_at FOR UPDATE SKIP LOCKED LIMIT $2", [new Date(cutoff), limit]); const records: ConfirmationRecord[] = []; for (const row of result.rows) { const updated = await client.query("UPDATE confirmations SET recovery_claimed_at=now(),recovery_attempts=recovery_attempts+1,next_recovery_at=now()+interval '5 seconds' WHERE id=$1 RETURNING *", [row.id]); records.push(this.confirmationFromRow(updated.rows[0])); } return records; }); }
  async releaseConfirmationRecovery(id: string): Promise<void> { await this.pool.query('UPDATE confirmations SET recovery_claimed_at=NULL WHERE id=$1', [id]); }
  async upsertWorkflowReconciliation(value: WorkflowReconciliationRecord): Promise<WorkflowReconciliationRecord> { const result = await this.pool.query("INSERT INTO workflow_reconciliation (order_id,actor_id,payment_id,refund_id,status,last_error_code,attempt_count,next_attempt_at,completed_at,claimed_at,claim_owner) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL) ON CONFLICT (order_id) DO UPDATE SET refund_id=COALESCE(EXCLUDED.refund_id,workflow_reconciliation.refund_id),status=EXCLUDED.status,last_error_code=EXCLUDED.last_error_code,attempt_count=EXCLUDED.attempt_count,next_attempt_at=EXCLUDED.next_attempt_at,completed_at=EXCLUDED.completed_at,claimed_at=NULL,claim_owner=NULL,updated_at=now() RETURNING *", [value.orderId,value.actorId,value.paymentId,value.refundId ?? null,value.status,value.lastErrorCode ?? null,value.attemptCount,value.nextAttemptAt ?? null,value.completedAt ?? null]); const row = result.rows[0]; return { orderId: String(row.order_id), actorId: String(row.actor_id), paymentId: String(row.payment_id), refundId: row.refund_id ? String(row.refund_id) : undefined, status: String(row.status), lastErrorCode: row.last_error_code ? String(row.last_error_code) : undefined, attemptCount: Number(row.attempt_count), nextAttemptAt: row.next_attempt_at ? new Date(String(row.next_attempt_at)).toISOString() : undefined, completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : undefined }; }
  async listDueWorkflowReconciliations(now: string, limit: number): Promise<WorkflowReconciliationRecord[]> { const result = await this.pool.query("SELECT * FROM workflow_reconciliation WHERE completed_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= $1) ORDER BY COALESCE(next_attempt_at,updated_at) LIMIT $2", [now, limit]); return result.rows.map((row) => ({ orderId: String(row.order_id), actorId: String(row.actor_id), paymentId: String(row.payment_id), refundId: row.refund_id ? String(row.refund_id) : undefined, status: String(row.status), lastErrorCode: row.last_error_code ? String(row.last_error_code) : undefined, attemptCount: Number(row.attempt_count), nextAttemptAt: row.next_attempt_at ? new Date(String(row.next_attempt_at)).toISOString() : undefined, completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : undefined, claimedAt: row.claimed_at ? new Date(String(row.claimed_at)).toISOString() : undefined, claimOwner: row.claim_owner ? String(row.claim_owner) : undefined })); }
  async listWorkflowReconciliations(page: number, pageSize: number): Promise<{ items: WorkflowReconciliationRecord[]; total: number }> { const safePage = Math.max(page, 1); const safePageSize = Math.min(Math.max(pageSize, 1), 100); const [count, rows] = await Promise.all([this.pool.query('SELECT count(*)::int AS count FROM workflow_reconciliation'), this.pool.query('SELECT * FROM workflow_reconciliation ORDER BY updated_at DESC LIMIT $1 OFFSET $2', [safePageSize, (safePage - 1) * safePageSize])]); return { total: Number(count.rows[0]?.count ?? 0), items: rows.rows.map((row) => ({ orderId: String(row.order_id), actorId: String(row.actor_id), paymentId: String(row.payment_id), refundId: row.refund_id ? String(row.refund_id) : undefined, status: String(row.status), lastErrorCode: row.last_error_code ? String(row.last_error_code) : undefined, attemptCount: Number(row.attempt_count), nextAttemptAt: row.next_attempt_at ? new Date(String(row.next_attempt_at)).toISOString() : undefined, completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : undefined, claimedAt: row.claimed_at ? new Date(String(row.claimed_at)).toISOString() : undefined, claimOwner: row.claim_owner ? String(row.claim_owner) : undefined })) }; }
  async claimDueWorkflowReconciliations(now: string, limit: number, owner: string): Promise<WorkflowReconciliationRecord[]> { return this.transaction(async (client) => { const rows = await client.query("SELECT * FROM workflow_reconciliation WHERE completed_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= $1) AND (claimed_at IS NULL OR claimed_at < now()-interval '30 seconds') ORDER BY COALESCE(next_attempt_at,updated_at) FOR UPDATE SKIP LOCKED LIMIT $2", [now, limit]); const result: WorkflowReconciliationRecord[] = []; for (const row of rows.rows) { const updated = await client.query('UPDATE workflow_reconciliation SET claimed_at=now(),claim_owner=$1,attempt_count=attempt_count+1,updated_at=now() WHERE order_id=$2 RETURNING *', [owner, row.order_id]); const value = updated.rows[0]; result.push({ orderId: String(value.order_id), actorId: String(value.actor_id), paymentId: String(value.payment_id), refundId: value.refund_id ? String(value.refund_id) : undefined, status: String(value.status), lastErrorCode: value.last_error_code ? String(value.last_error_code) : undefined, attemptCount: Number(value.attempt_count), nextAttemptAt: value.next_attempt_at ? new Date(String(value.next_attempt_at)).toISOString() : undefined, completedAt: value.completed_at ? new Date(String(value.completed_at)).toISOString() : undefined, claimedAt: value.claimed_at ? new Date(String(value.claimed_at)).toISOString() : undefined, claimOwner: value.claim_owner ? String(value.claim_owner) : undefined }); } return result; }); }
  private multiServiceWorkflowFromRow(row: Record<string, unknown>): MultiServiceWorkflowRecord { return { workflowId: String(row.workflow_id), actorId: String(row.actor_id), idempotencyKey: String(row.idempotency_key), requestHash: String(row.request_hash), kind: String(row.kind), status: String(row.status), plan: row.plan as Record<string, unknown>, createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString() }; }
  async getMultiServiceWorkflow(workflowId: string, actorId: string): Promise<MultiServiceWorkflowRecord | undefined> { const result = await this.pool.query('SELECT * FROM multi_service_workflows WHERE workflow_id=$1 AND actor_id=$2', [workflowId, actorId]); return result.rows[0] ? this.multiServiceWorkflowFromRow(result.rows[0]) : undefined; }
  async saveMultiServiceWorkflow(value: MultiServiceWorkflowRecord): Promise<MultiServiceWorkflowRecord> { return this.transaction(async (client) => { const inserted = await client.query('INSERT INTO multi_service_workflows (workflow_id,actor_id,idempotency_key,request_hash,kind,status,plan,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT (actor_id,idempotency_key) DO NOTHING RETURNING *', [value.workflowId,value.actorId,value.idempotencyKey,value.requestHash,value.kind,value.status,JSON.stringify(value.plan),value.createdAt,value.updatedAt]); if (inserted.rows[0]) return this.multiServiceWorkflowFromRow(inserted.rows[0]); const existingResult = await client.query('SELECT * FROM multi_service_workflows WHERE actor_id=$1 AND idempotency_key=$2 FOR UPDATE', [value.actorId,value.idempotencyKey]); const existing = existingResult.rows[0] as Record<string, unknown> | undefined; if (!existing) throw new Error('MULTI_SERVICE_WORKFLOW_NOT_FOUND'); if (String(existing.request_hash) !== value.requestHash) throw new Error('IDEMPOTENCY_KEY_REUSED'); if (String(existing.workflow_id) !== value.workflowId) return this.multiServiceWorkflowFromRow(existing); const updated = await client.query('UPDATE multi_service_workflows SET kind=$1,status=$2,plan=$3::jsonb,updated_at=$4 WHERE workflow_id=$5 AND actor_id=$6 RETURNING *', [value.kind,value.status,JSON.stringify(value.plan),value.updatedAt,value.workflowId,value.actorId]); if (!updated.rows[0]) throw new Error('MULTI_SERVICE_WORKFLOW_NOT_FOUND'); return this.multiServiceWorkflowFromRow(updated.rows[0]); }); }
  async getReceipt(paymentId: string): Promise<Record<string, unknown> | undefined> { const result = await this.pool.query('SELECT r.*,p.order_id,p.amount,p.currency,p.method,p.status AS payment_status FROM receipts r JOIN payments p ON p.id=r.payment_id WHERE r.payment_id=$1', [paymentId]); const row = result.rows[0]; return row ? { receipt_id: row.id, payment_id: paymentId, order_id: row.order_id, amount: { amount: row.amount, currency: row.currency }, method: row.method, status: row.payment_status, issued_at: new Date(String(row.created_at)).toISOString() } : undefined; }
  async saveConversation(value: ConversationRecord): Promise<void> { await this.pool.query('INSERT INTO conversation_states (conversation_id,actor_id,messages,state,version,title,status,archived_at,service_context,last_message_at) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,COALESCE($10,now())) ON CONFLICT (conversation_id) DO UPDATE SET messages=EXCLUDED.messages,state=EXCLUDED.state,version=GREATEST(conversation_states.version,EXCLUDED.version),title=COALESCE(EXCLUDED.title,conversation_states.title),status=EXCLUDED.status,archived_at=EXCLUDED.archived_at,service_context=COALESCE(EXCLUDED.service_context,conversation_states.service_context),last_message_at=COALESCE(EXCLUDED.last_message_at,conversation_states.last_message_at),updated_at=now() WHERE conversation_states.actor_id=EXCLUDED.actor_id', [value.conversationId,value.actorId,JSON.stringify(value.messages),JSON.stringify(value.state),value.version ?? 0,value.title ?? null,value.status ?? 'ACTIVE',value.archivedAt ?? null,value.serviceContext ?? null,value.lastMessageAt ?? null]); }
  async getConversation(id: string, actorId: string): Promise<ConversationRecord | undefined> { const result = await this.pool.query('SELECT * FROM conversation_states WHERE conversation_id=$1 AND actor_id=$2', [id,actorId]); return result.rows[0] ? this.conversationFromRow(result.rows[0]) : undefined; }
  async listConversations(actorId: string, options?: { includeArchived?: boolean }): Promise<ConversationRecord[]> { const result = await this.pool.query(`SELECT * FROM conversation_states WHERE actor_id=$1 ${options?.includeArchived ? '' : "AND status <> 'ARCHIVED'"} ORDER BY updated_at DESC`, [actorId]); return result.rows.map((row) => this.conversationFromRow(row)); }
  async createConversation(value: { conversationId: string; actorId: string; title?: string; serviceContext?: string }): Promise<ConversationRecord> { const result = await this.pool.query('INSERT INTO conversation_states (conversation_id,actor_id,title,service_context,last_message_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (conversation_id) DO NOTHING RETURNING *', [value.conversationId,value.actorId,value.title ?? null,value.serviceContext ?? null]); if (result.rows[0]) return this.conversationFromRow(result.rows[0]); const existing = await this.getConversation(value.conversationId, value.actorId); if (!existing) throw new Error('CONVERSATION_NOT_CREATED'); return existing; }
  async updateConversation(id: string, actorId: string, patch: { title?: string; status?: 'ACTIVE' | 'ARCHIVED' }): Promise<ConversationRecord | undefined> { const result = await this.pool.query("UPDATE conversation_states SET title=COALESCE($1,title),status=COALESCE($2,status),archived_at=CASE WHEN $2='ARCHIVED' THEN COALESCE(archived_at,now()) WHEN $2='ACTIVE' THEN NULL ELSE archived_at END,updated_at=now() WHERE conversation_id=$3 AND actor_id=$4 RETURNING *", [patch.title ?? null,patch.status ?? null,id,actorId]); return result.rows[0] ? this.conversationFromRow(result.rows[0]) : undefined; }
  async deleteConversation(id: string, actorId: string): Promise<boolean> { const result = await this.pool.query('DELETE FROM conversation_states WHERE conversation_id=$1 AND actor_id=$2', [id,actorId]); return Boolean(result.rowCount); }
  private addressFromRow(row: Record<string, unknown>): SavedAddressRecord { return { id: String(row.id), actorId: String(row.actor_id), label: String(row.label), addressText: String(row.address_text), city: row.city ? String(row.city) : undefined, district: row.district ? String(row.district) : undefined, ward: row.ward ? String(row.ward) : undefined, latitude: row.latitude === null || row.latitude === undefined ? undefined : Number(row.latitude), longitude: row.longitude === null || row.longitude === undefined ? undefined : Number(row.longitude), provider: row.provider ? String(row.provider) : undefined, source: row.source === 'geocoded' || row.source === 'imported' ? row.source : 'manual', isDefault: row.is_default === true, createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString() }; }
  async listSavedAddresses(actorId: string): Promise<SavedAddressRecord[]> { const result = await this.pool.query('SELECT * FROM user_addresses WHERE actor_id=$1 ORDER BY is_default DESC,updated_at DESC', [actorId]); return result.rows.map((row) => this.addressFromRow(row)); }
  async getSavedAddress(id: string, actorId: string): Promise<SavedAddressRecord | undefined> { const result = await this.pool.query('SELECT * FROM user_addresses WHERE id=$1 AND actor_id=$2', [id,actorId]); return result.rows[0] ? this.addressFromRow(result.rows[0]) : undefined; }
  async createSavedAddress(value: SavedAddressRecord): Promise<SavedAddressRecord> { return this.transaction(async (client) => { if (value.isDefault) await client.query('UPDATE user_addresses SET is_default=false,updated_at=now() WHERE actor_id=$1', [value.actorId]); const result = await client.query('INSERT INTO user_addresses (id,actor_id,label,address_text,city,district,ward,latitude,longitude,provider,source,is_default,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *', [value.id,value.actorId,value.label,value.addressText,value.city ?? null,value.district ?? null,value.ward ?? null,value.latitude ?? null,value.longitude ?? null,value.provider ?? null,value.source,value.isDefault,value.createdAt]); return this.addressFromRow(result.rows[0]); }); }
  async updateSavedAddress(id: string, actorId: string, patch: Partial<Pick<SavedAddressRecord, 'label' | 'addressText' | 'city' | 'district' | 'ward' | 'latitude' | 'longitude' | 'provider' | 'source' | 'isDefault'>>): Promise<SavedAddressRecord | undefined> { return this.transaction(async (client) => { if (patch.isDefault === true) await client.query('UPDATE user_addresses SET is_default=false,updated_at=now() WHERE actor_id=$1', [actorId]); const fields: string[] = []; const values: unknown[] = []; const add = (column: string, value: unknown): void => { fields.push(`${column}=$${values.length + 1}`); values.push(value); }; const mapping: Array<[keyof typeof patch, string]> = [['label','label'],['addressText','address_text'],['city','city'],['district','district'],['ward','ward'],['latitude','latitude'],['longitude','longitude'],['provider','provider'],['source','source'],['isDefault','is_default']]; for (const [key, column] of mapping) if (patch[key] !== undefined) add(column, patch[key] ?? null); if (!fields.length) return this.getSavedAddress(id, actorId); values.push(id, actorId); const result = await client.query(`UPDATE user_addresses SET ${fields.join(',')},updated_at=now() WHERE id=$${values.length - 1} AND actor_id=$${values.length} RETURNING *`, values); return result.rows[0] ? this.addressFromRow(result.rows[0]) : undefined; }); }
  async deleteSavedAddress(id: string, actorId: string): Promise<boolean> { return this.transaction(async (client) => { const deleted = await client.query('DELETE FROM user_addresses WHERE id=$1 AND actor_id=$2 RETURNING is_default', [id,actorId]); if (!deleted.rowCount) return false; if (deleted.rows[0].is_default === true) await client.query('UPDATE user_addresses SET is_default=true,updated_at=now() WHERE id=(SELECT id FROM user_addresses WHERE actor_id=$1 ORDER BY updated_at DESC LIMIT 1)', [actorId]); return true; }); }
  async appendConversationTurn(value: { conversationId: string; actorId: string; userMessage: ConversationRecord['messages'][number]; assistantMessage: ConversationRecord['messages'][number]; stateUpdates: Record<string, unknown> }): Promise<ConversationRecord> { return this.transaction(async (client) => { const result = await client.query('INSERT INTO conversation_states (conversation_id,actor_id,messages,state,version,last_message_at) VALUES ($1,$2,$3::jsonb,$4::jsonb,1,now()) ON CONFLICT (conversation_id) DO UPDATE SET messages=conversation_states.messages || EXCLUDED.messages,state=conversation_states.state || EXCLUDED.state,version=conversation_states.version+1,status=\'ACTIVE\',archived_at=NULL,last_message_at=now(),updated_at=now() WHERE conversation_states.actor_id=EXCLUDED.actor_id RETURNING *', [value.conversationId,value.actorId,JSON.stringify([value.userMessage,value.assistantMessage]),JSON.stringify(value.stateUpdates)]); const row = result.rows[0]; if (!row) throw new Error('FORBIDDEN'); return this.conversationFromRow(row); }); }
  async mergeConversationState(conversationId: string, actorId: string, stateUpdates: Record<string, unknown>): Promise<void> { await this.pool.query('INSERT INTO conversation_states (conversation_id,actor_id,messages,state,version) VALUES ($1,$2,\'[]\'::jsonb,$3::jsonb,1) ON CONFLICT (conversation_id) DO UPDATE SET state=conversation_states.state || EXCLUDED.state,version=conversation_states.version+1,updated_at=now() WHERE conversation_states.actor_id=EXCLUDED.actor_id', [conversationId,actorId,JSON.stringify(stateUpdates)]); }
  private assistantActionExecutionFromRow(row: Record<string, unknown>): AssistantActionExecutionRecord { const response = row.response_json; return { actorId: String(row.actor_id), conversationId: String(row.conversation_id), actionId: String(row.action_id), idempotencyKey: String(row.idempotency_key), requestHash: String(row.request_hash), status: row.status as AssistantActionExecutionStatus, ...(response && typeof response === 'object' && !Array.isArray(response) ? { response: response as Record<string, unknown> } : {}), createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at ?? row.created_at)).toISOString(), processingExpiresAt: row.processing_expires_at ? new Date(String(row.processing_expires_at)).toISOString() : undefined, completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : undefined }; }
  async getAssistantActionExecution(actorId: string, conversationId: string, actionId: string): Promise<AssistantActionExecutionRecord | undefined> { const result = await this.pool.query('SELECT * FROM assistant_action_executions WHERE actor_id=$1 AND conversation_id=$2 AND action_id=$3', [actorId, conversationId, actionId]); return result.rows[0] ? this.assistantActionExecutionFromRow(result.rows[0]) : undefined; }
  async claimAssistantActionExecution(actorId: string, conversationId: string, actionId: string, idempotencyKey: string, requestHash: string): Promise<AssistantActionExecutionClaim> { return this.transaction(async (client) => { const inserted = await client.query("INSERT INTO assistant_action_executions (actor_id,conversation_id,action_id,idempotency_key,request_hash,status,processing_expires_at,updated_at) VALUES ($1,$2,$3,$4,$5,'PROCESSING',now()+interval '30 seconds',now()) ON CONFLICT (actor_id,conversation_id,action_id) DO NOTHING", [actorId,conversationId,actionId,idempotencyKey,requestHash]); const result = await client.query('SELECT * FROM assistant_action_executions WHERE actor_id=$1 AND conversation_id=$2 AND action_id=$3 FOR UPDATE', [actorId,conversationId,actionId]); const row = result.rows[0] as Record<string, unknown> | undefined; if (!row) throw new Error('ASSISTANT_ACTION_EXECUTION_NOT_FOUND'); const execution = this.assistantActionExecutionFromRow(row); if (execution.idempotencyKey !== idempotencyKey) return { state: 'ACTION_NOT_AVAILABLE' as const, execution }; if (execution.requestHash !== requestHash) return { state: 'IDEMPOTENCY_KEY_REUSED' as const, execution }; if (execution.status === 'SUCCEEDED') return { state: 'SUCCEEDED' as const, execution }; if (execution.status === 'FAILED_FINAL') return { state: 'FAILED_FINAL' as const, execution }; const stale = execution.status === 'FAILED_RETRYABLE' || (execution.status === 'PROCESSING' && Boolean(execution.processingExpiresAt) && Date.parse(execution.processingExpiresAt!) <= Date.now()); if (stale) { const reclaimed = await client.query("UPDATE assistant_action_executions SET status='PROCESSING',response_json=NULL,completed_at=NULL,processing_expires_at=now()+interval '30 seconds',updated_at=now() WHERE actor_id=$1 AND conversation_id=$2 AND action_id=$3 RETURNING *", [actorId,conversationId,actionId]); return { state: 'CLAIMED' as const, execution: this.assistantActionExecutionFromRow(reclaimed.rows[0]) }; } return { state: inserted.rowCount ? 'CLAIMED' as const : 'PROCESSING' as const, execution }; }); }
  async commitAssistantActionSuccess(value: AssistantActionSuccessCommit): Promise<ConversationRecord> { return this.transaction(async (client) => { const receipt = await client.query('SELECT * FROM assistant_action_executions WHERE actor_id=$1 AND conversation_id=$2 AND action_id=$3 FOR UPDATE', [value.actorId,value.conversationId,value.actionId]); const row = receipt.rows[0] as Record<string, unknown> | undefined; if (!row || String(row.idempotency_key) !== value.idempotencyKey || String(row.request_hash) !== value.requestHash || row.status !== 'PROCESSING') throw new Error('ASSISTANT_ACTION_EXECUTION_NOT_PROCESSING'); const conversation = await client.query('INSERT INTO conversation_states (conversation_id,actor_id,messages,state,version) VALUES ($1,$2,$3::jsonb,$4::jsonb,1) ON CONFLICT (conversation_id) DO UPDATE SET messages=conversation_states.messages || EXCLUDED.messages,state=conversation_states.state || EXCLUDED.state,version=conversation_states.version+1,updated_at=now() WHERE conversation_states.actor_id=EXCLUDED.actor_id RETURNING *', [value.conversationId,value.actorId,JSON.stringify([value.userMessage,value.assistantMessage]),JSON.stringify(value.stateUpdates)]); const conversationRow = conversation.rows[0] as Record<string, unknown> | undefined; if (!conversationRow) throw new Error('FORBIDDEN'); const completed = await client.query("UPDATE assistant_action_executions SET status='SUCCEEDED',response_json=$1::jsonb,completed_at=now(),processing_expires_at=NULL,updated_at=now() WHERE actor_id=$2 AND conversation_id=$3 AND action_id=$4 AND idempotency_key=$5 AND request_hash=$6 AND status='PROCESSING' RETURNING action_id", [JSON.stringify(value.response),value.actorId,value.conversationId,value.actionId,value.idempotencyKey,value.requestHash]); if (!completed.rowCount) throw new Error('ASSISTANT_ACTION_EXECUTION_NOT_PROCESSING'); return { conversationId: String(conversationRow.conversation_id), actorId: String(conversationRow.actor_id), messages: conversationRow.messages as ConversationRecord['messages'], state: conversationRow.state as Record<string, unknown>, version: Number(conversationRow.version) }; }); }
  async completeAssistantActionExecution(actorId: string, conversationId: string, actionId: string, idempotencyKey: string, requestHash: string, status: Exclude<AssistantActionExecutionStatus, 'SUCCEEDED'>, response?: Record<string, unknown>): Promise<void> { await this.transaction(async (client) => { const result = await client.query("UPDATE assistant_action_executions SET status=$1,response_json=$2::jsonb,completed_at=CASE WHEN $1 = 'FAILED_FINAL' THEN now() ELSE NULL END,processing_expires_at=NULL,updated_at=now() WHERE actor_id=$3 AND conversation_id=$4 AND action_id=$5 AND idempotency_key=$6 AND request_hash=$7 AND status='PROCESSING' RETURNING action_id", [status,response ? JSON.stringify(response) : null,actorId,conversationId,actionId,idempotencyKey,requestHash]); if (!result.rowCount) { const existing = await client.query('SELECT status FROM assistant_action_executions WHERE actor_id=$1 AND conversation_id=$2 AND action_id=$3 AND idempotency_key=$4 AND request_hash=$5', [actorId,conversationId,actionId,idempotencyKey,requestHash]); if (existing.rows[0]?.status === status) return; throw new Error('ASSISTANT_ACTION_EXECUTION_NOT_FOUND'); } }); }
  async audit(value: { action: string; actorId?: string; correlationId?: string; resourceId?: string; metadata?: Record<string, unknown> }): Promise<void> { await this.pool.query('INSERT INTO audit_events (action,actor_id,resource_id,correlation_id,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)', [value.action,value.actorId ?? null,value.resourceId ?? null,value.correlationId ?? null,JSON.stringify(value.metadata ?? {})]); }
  async checkHealth(): Promise<boolean> { try { await this.pool.query('SELECT 1'); return true; } catch { return false; } }
  async close(): Promise<void> { await this.pool.end(); }
}

@Injectable()
export class CoreStore implements OnModuleDestroy {
  readonly repository: CoreRepository;
  constructor(config: ConfigService) { this.repository = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID ? new InMemoryCoreRepository() : new PostgresCoreRepository(config.getOrThrow<string>('DATABASE_URL')); }
  createConfirmation(value: ConfirmationRecord): Promise<ConfirmationRecord> { return this.repository.createConfirmation(value); }
  getConfirmation(id: string): Promise<ConfirmationRecord | undefined> { return this.repository.getConfirmation(id); }
  claimConfirmation(id: string, actorId: string, key: string, hash: string, now: number, payload?: Record<string, unknown>): Promise<ConfirmationClaim> { return this.repository.claimConfirmation(id, actorId, key, hash, now, payload); }
  completeConfirmation(id: string, actorId: string, key: string, status: Exclude<ConfirmationStatus, 'PENDING' | 'PROCESSING' | 'EXPIRED'>, result: Record<string, unknown>, code?: string): Promise<void> { return this.repository.completeConfirmation(id, actorId, key, status, result, code); }
  getExecution(key: string): Promise<ExecutionRecord | undefined> { return this.repository.getExecution(key); }
  createPayment(value: PaymentRecord): Promise<PaymentRecord> { return this.repository.createPayment(value); }
  updatePayment(id: string, status: PaymentStatus, receiptId?: string, recovery?: { nextRecoveryAt?: string; error?: string; providerStatus?: string }): Promise<PaymentRecord> { return this.repository.updatePayment(id, status, receiptId, recovery); }
  getPayment(id: string): Promise<PaymentRecord | undefined> { return this.repository.getPayment(id); }
  findPayment(actorId: string, key: string): Promise<PaymentRecord | undefined> { return this.repository.findPayment(actorId, key); }
  findPaymentByOrder(orderId: string, actorId: string): Promise<PaymentRecord | undefined> { return this.repository.findPaymentByOrder(orderId, actorId); }
  createRefund(value: RefundRecord): Promise<RefundRecord> { return this.repository.createRefund(value); }
  updateRefund(id: string, status: RefundStatus, providerStatus?: string, recovery?: { nextRecoveryAt?: string }): Promise<RefundRecord> { return this.repository.updateRefund(id, status, providerStatus, recovery); }
  getRefundByKey(paymentId: string, key: string): Promise<RefundRecord | undefined> { return this.repository.getRefundByKey(paymentId, key); }
  listRefunds(paymentId: string): Promise<RefundRecord[]> { return this.repository.listRefunds(paymentId); }
  listAllPayments(page: number, pageSize: number): Promise<{ items: PaymentRecord[]; total: number }> { return this.repository.listAllPayments(page, pageSize); }
  listAllRefunds(page: number, pageSize: number): Promise<{ items: RefundRecord[]; total: number }> { return this.repository.listAllRefunds(page, pageSize); }
  listPaymentsForReconciliation(): Promise<PaymentRecord[]> { return this.repository.listPaymentsForReconciliation(); }
  listPaymentsForRecovery(now: number): Promise<PaymentRecord[]> { return this.repository.listPaymentsForRecovery(now); }
  claimPaymentsForRecovery(now: number, owner: string, limit: number): Promise<PaymentRecord[]> { return this.repository.claimPaymentsForRecovery(now, owner, limit); }
  createPaymentProviderTransaction(value: PaymentProviderTransaction): Promise<PaymentProviderTransaction> { return this.repository.createPaymentProviderTransaction(value); }
  getPaymentProviderTransaction(providerReference: string): Promise<PaymentProviderTransaction | undefined> { return this.repository.getPaymentProviderTransaction(providerReference); }
  markPaymentProviderConfirmation(providerReference: string, values: { intendedFinalStatus: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; statusAvailableAt?: string; confirmationId?: string; executionKey?: string }): Promise<PaymentProviderTransaction> { return this.repository.markPaymentProviderConfirmation(providerReference, values); }
  claimPaymentProviderConfirmation(providerReference: string, values: { intendedFinalStatus: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; statusAvailableAt?: string; confirmationId?: string; executionKey?: string }): Promise<PaymentProviderConfirmationClaim> { return this.repository.claimPaymentProviderConfirmation(providerReference, values); }
  markPaymentProviderChecked(providerReference: string, status: PaymentProviderTransaction['providerStatus']): Promise<PaymentProviderTransaction> { return this.repository.markPaymentProviderChecked(providerReference, status); }
  createRefundProviderTransaction(value: RefundProviderTransaction): Promise<RefundProviderTransaction> { return this.repository.createRefundProviderTransaction(value); }
  getRefundProviderTransaction(providerRefundReference: string): Promise<RefundProviderTransaction | undefined> { return this.repository.getRefundProviderTransaction(providerRefundReference); }
  markRefundProviderChecked(providerRefundReference: string, status: RefundProviderTransaction['providerStatus']): Promise<RefundProviderTransaction> { return this.repository.markRefundProviderChecked(providerRefundReference, status); }
  claimStaleConfirmations(cutoff: number, now: number, limit: number): Promise<ConfirmationRecord[]> { return this.repository.claimStaleConfirmations(cutoff, now, limit); }
  releaseConfirmationRecovery(id: string): Promise<void> { return this.repository.releaseConfirmationRecovery(id); }
  upsertWorkflowReconciliation(value: WorkflowReconciliationRecord): Promise<WorkflowReconciliationRecord> { return this.repository.upsertWorkflowReconciliation(value); }
  listDueWorkflowReconciliations(now: string, limit: number): Promise<WorkflowReconciliationRecord[]> { return this.repository.listDueWorkflowReconciliations(now, limit); }
  listWorkflowReconciliations(page: number, pageSize: number): Promise<{ items: WorkflowReconciliationRecord[]; total: number }> { return this.repository.listWorkflowReconciliations(page, pageSize); }
  claimDueWorkflowReconciliations(now: string, limit: number, owner: string): Promise<WorkflowReconciliationRecord[]> { return this.repository.claimDueWorkflowReconciliations(now, limit, owner); }
  getMultiServiceWorkflow(workflowId: string, actorId: string): Promise<MultiServiceWorkflowRecord | undefined> { return this.repository.getMultiServiceWorkflow(workflowId, actorId); }
  saveMultiServiceWorkflow(value: MultiServiceWorkflowRecord): Promise<MultiServiceWorkflowRecord> { return this.repository.saveMultiServiceWorkflow(value); }
  getReceipt(paymentId: string): Promise<Record<string, unknown> | undefined> { return this.repository.getReceipt(paymentId); }
  saveConversation(value: ConversationRecord): Promise<void> { return this.repository.saveConversation(value); }
  getConversation(id: string, actorId: string): Promise<ConversationRecord | undefined> { return this.repository.getConversation(id, actorId); }
  listConversations(actorId: string, options?: { includeArchived?: boolean }): Promise<ConversationRecord[]> { return this.repository.listConversations(actorId, options); }
  createConversation(value: { conversationId: string; actorId: string; title?: string; serviceContext?: string }): Promise<ConversationRecord> { return this.repository.createConversation(value); }
  updateConversation(id: string, actorId: string, patch: { title?: string; status?: 'ACTIVE' | 'ARCHIVED' }): Promise<ConversationRecord | undefined> { return this.repository.updateConversation(id, actorId, patch); }
  deleteConversation(id: string, actorId: string): Promise<boolean> { return this.repository.deleteConversation(id, actorId); }
  listSavedAddresses(actorId: string): Promise<SavedAddressRecord[]> { return this.repository.listSavedAddresses(actorId); }
  getSavedAddress(id: string, actorId: string): Promise<SavedAddressRecord | undefined> { return this.repository.getSavedAddress(id, actorId); }
  createSavedAddress(value: SavedAddressRecord): Promise<SavedAddressRecord> { return this.repository.createSavedAddress(value); }
  updateSavedAddress(id: string, actorId: string, patch: Partial<Pick<SavedAddressRecord, 'label' | 'addressText' | 'city' | 'district' | 'ward' | 'latitude' | 'longitude' | 'provider' | 'source' | 'isDefault'>>): Promise<SavedAddressRecord | undefined> { return this.repository.updateSavedAddress(id, actorId, patch); }
  deleteSavedAddress(id: string, actorId: string): Promise<boolean> { return this.repository.deleteSavedAddress(id, actorId); }
  appendConversationTurn(value: { conversationId: string; actorId: string; userMessage: ConversationRecord['messages'][number]; assistantMessage: ConversationRecord['messages'][number]; stateUpdates: Record<string, unknown> }): Promise<ConversationRecord> { return this.repository.appendConversationTurn(value); }
  mergeConversationState(conversationId: string, actorId: string, stateUpdates: Record<string, unknown>): Promise<void> { return this.repository.mergeConversationState(conversationId, actorId, stateUpdates); }
  getAssistantActionExecution(actorId: string, conversationId: string, actionId: string): Promise<AssistantActionExecutionRecord | undefined> { return this.repository.getAssistantActionExecution(actorId, conversationId, actionId); }
  claimAssistantActionExecution(actorId: string, conversationId: string, actionId: string, idempotencyKey: string, requestHash: string): Promise<AssistantActionExecutionClaim> { return this.repository.claimAssistantActionExecution(actorId, conversationId, actionId, idempotencyKey, requestHash); }
  commitAssistantActionSuccess(value: AssistantActionSuccessCommit): Promise<ConversationRecord> { return this.repository.commitAssistantActionSuccess(value); }
  completeAssistantActionExecution(actorId: string, conversationId: string, actionId: string, idempotencyKey: string, requestHash: string, status: Exclude<AssistantActionExecutionStatus, 'SUCCEEDED'>, response?: Record<string, unknown>): Promise<void> { return this.repository.completeAssistantActionExecution(actorId, conversationId, actionId, idempotencyKey, requestHash, status, response); }
  audit(value: { action: string; actorId?: string; correlationId?: string; resourceId?: string; metadata?: Record<string, unknown> }): Promise<void> { return this.repository.audit(value); }
  checkHealth(): Promise<boolean> { return this.repository.checkHealth(); }
  onModuleDestroy(): Promise<void> { return this.repository.close(); }
}

@Module({ providers: [CoreStore, CoreProductOpsStore], exports: [CoreStore, CoreProductOpsStore] })
export class CoreModule {}
