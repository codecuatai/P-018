import { Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

export type PaymentMethod = 'bank_transfer' | 'card' | 'e_wallet';
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'UNKNOWN';
export type RefundStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';
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
}

export interface ConversationRecord {
  conversationId: string;
  actorId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string }>;
  state: Record<string, unknown>;
}

export interface ExecutionRecord { status: string; payloadHash: string; result?: Record<string, unknown> }

export interface CoreRepository {
  createConfirmation(value: ConfirmationRecord): Promise<ConfirmationRecord>;
  getConfirmation(id: string): Promise<ConfirmationRecord | undefined>;
  claimConfirmation(id: string, actorId: string, executionKey: string, payloadHash: string, now: number): Promise<ConfirmationClaim>;
  completeConfirmation(id: string, actorId: string, executionKey: string, status: Exclude<ConfirmationStatus, 'PENDING' | 'PROCESSING' | 'EXPIRED'>, result: Record<string, unknown>, failureCode?: string): Promise<void>;
  getExecution(key: string): Promise<ExecutionRecord | undefined>;
  createPayment(value: PaymentRecord): Promise<PaymentRecord>;
  updatePayment(id: string, status: PaymentStatus, receiptId?: string): Promise<PaymentRecord>;
  getPayment(id: string): Promise<PaymentRecord | undefined>;
  findPayment(actorId: string, idempotencyKey: string): Promise<PaymentRecord | undefined>;
  findPaymentByOrder(orderId: string, actorId: string): Promise<PaymentRecord | undefined>;
  createRefund(value: RefundRecord): Promise<RefundRecord>;
  getRefundByKey(paymentId: string, idempotencyKey: string): Promise<RefundRecord | undefined>;
  listRefunds(paymentId: string): Promise<RefundRecord[]>;
  listPaymentsForReconciliation(): Promise<PaymentRecord[]>;
  getReceipt(paymentId: string): Promise<Record<string, unknown> | undefined>;
  saveConversation(value: ConversationRecord): Promise<void>;
  getConversation(id: string, actorId: string): Promise<ConversationRecord | undefined>;
  audit(value: { action: string; actorId?: string; correlationId?: string; resourceId?: string; metadata?: Record<string, unknown> }): Promise<void>;
  close(): Promise<void>;
}

function clone<T>(value: T): T { return structuredClone(value); }

/** Test-only repository. It preserves the same claim and idempotency semantics without network I/O. */
export class InMemoryCoreRepository implements CoreRepository {
  private readonly confirmations = new Map<string, ConfirmationRecord>();
  private readonly executions = new Map<string, { confirmationId: string; actorId: string; key: string; payloadHash: string; status: string; result?: Record<string, unknown> }>();
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly refunds = new Map<string, RefundRecord>();
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly audits: Array<Record<string, unknown>> = [];

  async createConfirmation(value: ConfirmationRecord): Promise<ConfirmationRecord> { const saved = { ...value, status: value.status ?? 'PENDING', version: value.version ?? 0 }; this.confirmations.set(saved.id, clone(saved)); return clone(saved); }
  async getConfirmation(id: string): Promise<ConfirmationRecord | undefined> { const value = this.confirmations.get(id); return value ? clone(value) : undefined; }

  async claimConfirmation(id: string, actorId: string, executionKey: string, payloadHash: string, now: number): Promise<ConfirmationClaim> {
    const confirmation = this.confirmations.get(id);
    if (!confirmation || confirmation.actorId !== actorId) return { state: 'CONFIRMATION_ALREADY_USED' };
    const existing = [...this.executions.values()].find((value) => value.confirmationId === id && value.key === executionKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) return { state: 'IDEMPOTENCY_KEY_REUSED' };
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
      this.executions.set(executionKey, { confirmationId: id, actorId, key: executionKey, payloadHash, status: 'PROCESSING' });
      return { state: 'CLAIMED', confirmation: clone(confirmation) };
    }
    if (confirmation.result) return { state: confirmation.status, confirmation: clone(confirmation), result: clone(confirmation.result) };
    return { state: ['SUCCEEDED', 'FAILED_FINAL', 'EXPIRED'].includes(confirmation.status) ? 'CONFIRMATION_ALREADY_USED' : 'PROCESSING', confirmation: clone(confirmation) };
  }

  async completeConfirmation(id: string, actorId: string, executionKey: string, status: Exclude<ConfirmationStatus, 'PENDING' | 'PROCESSING' | 'EXPIRED'>, result: Record<string, unknown>, failureCode?: string): Promise<void> {
    const confirmation = this.confirmations.get(id);
    if (!confirmation || confirmation.actorId !== actorId || confirmation.executionKey !== executionKey) return;
    confirmation.status = status;
    confirmation.completedAt = Date.now();
    confirmation.failureCode = failureCode;
    confirmation.result = clone(result);
    confirmation.version += 1;
    const execution = this.executions.get(executionKey);
    if (execution) { execution.status = status; execution.result = clone(result); }
  }

  async getExecution(key: string): Promise<ExecutionRecord | undefined> { const value = this.executions.get(key); return value ? { status: value.status, payloadHash: value.payloadHash, result: value.result ? clone(value.result) : undefined } : undefined; }
  async createPayment(value: PaymentRecord): Promise<PaymentRecord> { const existing = [...this.payments.values()].find((item) => item.actorId === value.actorId && item.idempotencyKey === value.idempotencyKey); if (existing) return clone(existing); this.payments.set(value.id, clone(value)); return clone(value); }
  async updatePayment(id: string, status: PaymentStatus, receiptId?: string): Promise<PaymentRecord> { const payment = this.payments.get(id); if (!payment) throw new Error('PAYMENT_NOT_FOUND'); payment.status = status; payment.receiptId = receiptId ?? payment.receiptId; return clone(payment); }
  async getPayment(id: string): Promise<PaymentRecord | undefined> { const value = this.payments.get(id); return value ? clone(value) : undefined; }
  async findPayment(actorId: string, idempotencyKey: string): Promise<PaymentRecord | undefined> { const value = [...this.payments.values()].find((item) => item.actorId === actorId && item.idempotencyKey === idempotencyKey); return value ? clone(value) : undefined; }
  async findPaymentByOrder(orderId: string, actorId: string): Promise<PaymentRecord | undefined> { const value = [...this.payments.values()].find((item) => item.orderId === orderId && item.actorId === actorId); return value ? clone(value) : undefined; }
  async createRefund(value: RefundRecord): Promise<RefundRecord> { const existing = [...this.refunds.values()].find((item) => item.paymentId === value.paymentId && item.idempotencyKey === value.idempotencyKey); if (existing) return clone(existing); const payment = this.payments.get(value.paymentId); const refunded = [...this.refunds.values()].filter((item) => item.paymentId === value.paymentId && ['PENDING', 'SUCCEEDED'].includes(item.status)).reduce((sum, item) => sum + item.amount, 0); if (!payment || refunded + value.amount > payment.amount) throw new Error('REFUND_AMOUNT_EXCEEDED'); this.refunds.set(value.id, clone(value)); return clone(value); }
  async getRefundByKey(paymentId: string, idempotencyKey: string): Promise<RefundRecord | undefined> { const value = [...this.refunds.values()].find((item) => item.paymentId === paymentId && item.idempotencyKey === idempotencyKey); return value ? clone(value) : undefined; }
  async listRefunds(paymentId: string): Promise<RefundRecord[]> { return [...this.refunds.values()].filter((item) => item.paymentId === paymentId).map(clone); }
  async listPaymentsForReconciliation(): Promise<PaymentRecord[]> { return [...this.payments.values()].filter((item) => item.status === 'SUCCEEDED').map(clone); }
  async getReceipt(paymentId: string): Promise<Record<string, unknown> | undefined> { const payment = this.payments.get(paymentId); return payment?.receiptId ? { receipt_id: payment.receiptId, payment_id: payment.id, order_id: payment.orderId, amount: { amount: payment.amount, currency: payment.currency }, method: payment.method, status: payment.status, issued_at: payment.createdAt } : undefined; }
  async saveConversation(value: ConversationRecord): Promise<void> { this.conversations.set(value.conversationId, clone(value)); }
  async getConversation(id: string, actorId: string): Promise<ConversationRecord | undefined> { const value = this.conversations.get(id); return value && value.actorId === actorId ? clone(value) : undefined; }
  async audit(value: { action: string; actorId?: string; correlationId?: string; resourceId?: string; metadata?: Record<string, unknown> }): Promise<void> { this.audits.push(clone(value)); }
  async close(): Promise<void> {}
}

export class PostgresCoreRepository implements CoreRepository {
  private readonly pool: Pool;
  constructor(databaseUrl: string) { this.pool = new Pool({ connectionString: databaseUrl, max: 5 }); }
  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { const client = await this.pool.connect(); try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  private confirmationFromRow(row: Record<string, unknown>): ConfirmationRecord { return { id: String(row.id), actorId: String(row.actor_id), action: String(row.action), payload: row.payload as Record<string, unknown>, payloadHash: String(row.payload_hash), quoteVersion: String(row.quote_version), amount: Number(row.amount), currency: String(row.currency), expiresAt: new Date(String(row.expires_at)).getTime(), createdAt: new Date(String(row.created_at)).toISOString(), status: row.status as ConfirmationStatus, executionKey: row.execution_key ? String(row.execution_key) : undefined, processingStartedAt: row.processing_started_at ? new Date(String(row.processing_started_at)).getTime() : undefined, completedAt: row.completed_at ? new Date(String(row.completed_at)).getTime() : undefined, failureCode: row.failure_code ? String(row.failure_code) : undefined, result: row.result as Record<string, unknown> | undefined, version: Number(row.version) } }
  private paymentFromRow(row: Record<string, unknown> | undefined): PaymentRecord | undefined { return row ? { id: String(row.id), actorId: String(row.actor_id), orderId: String(row.order_id), amount: Number(row.amount), currency: String(row.currency), method: row.method as PaymentMethod, status: row.status as PaymentStatus, idempotencyKey: String(row.idempotency_key), payloadHash: String(row.payload_hash ?? ''), createdAt: new Date(String(row.created_at)).toISOString(), receiptId: row.receipt_id ? String(row.receipt_id) : undefined, intentId: row.intent_id ? String(row.intent_id) : undefined } : undefined; }
  private refundFromRow(row: Record<string, unknown>): RefundRecord { return { id: String(row.id), paymentId: String(row.payment_id), actorId: String(row.actor_id), amount: Number(row.amount), currency: String(row.currency), reason: String(row.reason), status: row.status as RefundStatus, idempotencyKey: String(row.idempotency_key), payloadHash: String(row.payload_hash ?? ''), createdAt: new Date(String(row.created_at)).toISOString(), completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : undefined }; }

  async createConfirmation(value: ConfirmationRecord): Promise<ConfirmationRecord> { await this.pool.query('INSERT INTO confirmations (id,actor_id,action,payload,payload_hash,quote_version,amount,currency,expires_at,created_at,status,version) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,\'PENDING\',0)', [value.id, value.actorId, value.action, JSON.stringify(value.payload), value.payloadHash, value.quoteVersion, value.amount, value.currency, new Date(value.expiresAt), value.createdAt]); return { ...value, status: 'PENDING', version: 0 }; }
  async getConfirmation(id: string): Promise<ConfirmationRecord | undefined> { const result = await this.pool.query('SELECT * FROM confirmations WHERE id=$1', [id]); return result.rows[0] ? this.confirmationFromRow(result.rows[0]) : undefined; }

  async claimConfirmation(id: string, actorId: string, executionKey: string, payloadHash: string, now: number): Promise<ConfirmationClaim> {
    return this.transaction(async (client) => {
      const result = await client.query('SELECT * FROM confirmations WHERE id=$1 AND actor_id=$2 FOR UPDATE', [id, actorId]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      if (!row) return { state: 'CONFIRMATION_ALREADY_USED' as const };
      const existing = await client.query('SELECT * FROM confirmation_executions WHERE confirmation_id=$1 AND idempotency_key=$2 FOR UPDATE', [id, executionKey]);
      const execution = existing.rows[0] as Record<string, unknown> | undefined;
      if (execution) {
        if (String(execution.payload_hash) !== payloadHash) return { state: 'IDEMPOTENCY_KEY_REUSED' as const };
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
        await client.query('INSERT INTO confirmation_executions (execution_key,confirmation_id,actor_id,idempotency_key,payload_hash,status) VALUES ($1,$2,$3,$4,$5,\'PROCESSING\')', [executionKey, id, actorId, executionKey, payloadHash]);
        return { state: 'CLAIMED' as const, confirmation: this.confirmationFromRow(claimed.rows[0]) };
      }
      if (confirmation.result) return { state: confirmation.status, confirmation, result: confirmation.result };
      return { state: ['SUCCEEDED', 'FAILED_FINAL', 'EXPIRED'].includes(confirmation.status) ? 'CONFIRMATION_ALREADY_USED' : 'PROCESSING', confirmation };
    });
  }

  async completeConfirmation(id: string, actorId: string, executionKey: string, status: Exclude<ConfirmationStatus, 'PENDING' | 'PROCESSING' | 'EXPIRED'>, result: Record<string, unknown>, failureCode?: string): Promise<void> { await this.transaction(async (client) => { await client.query('UPDATE confirmations SET status=$1,result=$2::jsonb,failure_code=$3,completed_at=now(),version=version+1 WHERE id=$4 AND actor_id=$5 AND execution_key=$6', [status, JSON.stringify(result), failureCode ?? null, id, actorId, executionKey]); await client.query('UPDATE confirmation_executions SET status=$1,result=$2::jsonb WHERE execution_key=$3', [status, JSON.stringify(result), executionKey]); }); }
  async getExecution(key: string): Promise<ExecutionRecord | undefined> { const result = await this.pool.query('SELECT status,payload_hash,result FROM confirmation_executions WHERE execution_key=$1', [key]); const row = result.rows[0]; return row ? { status: String(row.status), payloadHash: String(row.payload_hash), result: row.result as Record<string, unknown> | undefined } : undefined; }

  async createPayment(value: PaymentRecord): Promise<PaymentRecord> { return this.transaction(async (client) => { await client.query('INSERT INTO payments (id,actor_id,order_id,amount,currency,method,status,idempotency_key,payload_hash,receipt_id,intent_id,created_at,completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (actor_id,idempotency_key) DO NOTHING', [value.id,value.actorId,value.orderId,value.amount,value.currency,value.method,value.status,value.idempotencyKey,value.payloadHash,value.receiptId ?? null,value.intentId ?? null,value.createdAt,value.status === 'SUCCEEDED' ? value.createdAt : null]); const result = await client.query('SELECT * FROM payments WHERE actor_id=$1 AND idempotency_key=$2 FOR UPDATE', [value.actorId,value.idempotencyKey]); const payment = this.paymentFromRow(result.rows[0]); if (!payment) throw new Error('PAYMENT_NOT_PERSISTED'); if (payment.status === 'SUCCEEDED' && payment.receiptId) await client.query('INSERT INTO receipts (id,payment_id) VALUES ($1,$2) ON CONFLICT (payment_id) DO NOTHING', [payment.receiptId,payment.id]); return payment; }); }
  async updatePayment(id: string, status: PaymentStatus, receiptId?: string): Promise<PaymentRecord> { return this.transaction(async (client) => { const result = await client.query('UPDATE payments SET status=$1,receipt_id=COALESCE($2,receipt_id),completed_at=CASE WHEN $1 IN (\'SUCCEEDED\',\'FAILED\',\'TIMED_OUT\',\'UNKNOWN\') THEN now() ELSE completed_at END,updated_at=now() WHERE id=$3 RETURNING *', [status, receiptId ?? null, id]); const payment = this.paymentFromRow(result.rows[0]); if (!payment) throw new Error('PAYMENT_NOT_FOUND'); if (payment.status === 'SUCCEEDED' && payment.receiptId) await client.query('INSERT INTO receipts (id,payment_id) VALUES ($1,$2) ON CONFLICT (payment_id) DO NOTHING', [payment.receiptId,payment.id]); return payment; }); }
  async getPayment(id: string): Promise<PaymentRecord | undefined> { const result = await this.pool.query('SELECT * FROM payments WHERE id=$1', [id]); return this.paymentFromRow(result.rows[0]); }
  async findPayment(actorId: string, idempotencyKey: string): Promise<PaymentRecord | undefined> { const result = await this.pool.query('SELECT * FROM payments WHERE actor_id=$1 AND idempotency_key=$2', [actorId,idempotencyKey]); return this.paymentFromRow(result.rows[0]); }
  async findPaymentByOrder(orderId: string, actorId: string): Promise<PaymentRecord | undefined> { const result = await this.pool.query('SELECT * FROM payments WHERE order_id=$1 AND actor_id=$2 ORDER BY created_at DESC LIMIT 1', [orderId,actorId]); return this.paymentFromRow(result.rows[0]); }
  async createRefund(value: RefundRecord): Promise<RefundRecord> { return this.transaction(async (client) => { const payment = await client.query('SELECT amount,currency,actor_id FROM payments WHERE id=$1 FOR UPDATE', [value.paymentId]); if (!payment.rows[0] || String(payment.rows[0].actor_id) !== value.actorId) throw new Error('PAYMENT_NOT_FOUND'); const existing = await client.query('SELECT * FROM payment_refunds WHERE payment_id=$1 AND idempotency_key=$2 FOR UPDATE', [value.paymentId,value.idempotencyKey]); if (existing.rows[0]) return this.refundFromRow(existing.rows[0]); const total = await client.query("SELECT COALESCE(SUM(amount),0) AS amount FROM payment_refunds WHERE payment_id=$1 AND status IN ('PENDING','SUCCEEDED')", [value.paymentId]); if (Number(total.rows[0].amount) + value.amount > Number(payment.rows[0].amount)) throw new Error('REFUND_AMOUNT_EXCEEDED'); const inserted = await client.query('INSERT INTO payment_refunds (id,payment_id,actor_id,amount,currency,reason,status,idempotency_key,payload_hash,created_at,updated_at,completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11) RETURNING *', [value.id,value.paymentId,value.actorId,value.amount,value.currency,value.reason,value.status,value.idempotencyKey,value.payloadHash,value.createdAt,value.status === 'SUCCEEDED' ? value.createdAt : null]); return this.refundFromRow(inserted.rows[0]); }); }
  async getRefundByKey(paymentId: string, idempotencyKey: string): Promise<RefundRecord | undefined> { const result = await this.pool.query('SELECT * FROM payment_refunds WHERE payment_id=$1 AND idempotency_key=$2', [paymentId,idempotencyKey]); return result.rows[0] ? this.refundFromRow(result.rows[0]) : undefined; }
  async listRefunds(paymentId: string): Promise<RefundRecord[]> { const result = await this.pool.query('SELECT * FROM payment_refunds WHERE payment_id=$1 ORDER BY created_at', [paymentId]); return result.rows.map((row) => this.refundFromRow(row)); }
  async listPaymentsForReconciliation(): Promise<PaymentRecord[]> { const result = await this.pool.query("SELECT * FROM payments WHERE status='SUCCEEDED'"); return result.rows.map((row) => this.paymentFromRow(row)).filter((value): value is PaymentRecord => Boolean(value)); }
  async getReceipt(paymentId: string): Promise<Record<string, unknown> | undefined> { const result = await this.pool.query('SELECT r.*,p.order_id,p.amount,p.currency,p.method,p.status AS payment_status FROM receipts r JOIN payments p ON p.id=r.payment_id WHERE r.payment_id=$1', [paymentId]); const row = result.rows[0]; return row ? { receipt_id: row.id, payment_id: paymentId, order_id: row.order_id, amount: { amount: row.amount, currency: row.currency }, method: row.method, status: row.payment_status, issued_at: new Date(String(row.created_at)).toISOString() } : undefined; }
  async saveConversation(value: ConversationRecord): Promise<void> { await this.pool.query('INSERT INTO conversation_states (conversation_id,actor_id,messages,state) VALUES ($1,$2,$3::jsonb,$4::jsonb) ON CONFLICT (conversation_id) DO UPDATE SET messages=EXCLUDED.messages,state=EXCLUDED.state,updated_at=now() WHERE conversation_states.actor_id=EXCLUDED.actor_id', [value.conversationId,value.actorId,JSON.stringify(value.messages),JSON.stringify(value.state)]); }
  async getConversation(id: string, actorId: string): Promise<ConversationRecord | undefined> { const result = await this.pool.query('SELECT * FROM conversation_states WHERE conversation_id=$1 AND actor_id=$2', [id,actorId]); const row = result.rows[0]; return row ? { conversationId: String(row.conversation_id), actorId: String(row.actor_id), messages: row.messages, state: row.state } : undefined; }
  async audit(value: { action: string; actorId?: string; correlationId?: string; resourceId?: string; metadata?: Record<string, unknown> }): Promise<void> { await this.pool.query('INSERT INTO audit_events (action,actor_id,resource_id,correlation_id,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)', [value.action,value.actorId ?? null,value.resourceId ?? null,value.correlationId ?? null,JSON.stringify(value.metadata ?? {})]); }
  async close(): Promise<void> { await this.pool.end(); }
}

@Injectable()
export class CoreStore implements OnModuleDestroy {
  readonly repository: CoreRepository;
  constructor(config: ConfigService) { this.repository = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID ? new InMemoryCoreRepository() : new PostgresCoreRepository(config.getOrThrow<string>('DATABASE_URL')); }
  createConfirmation(value: ConfirmationRecord): Promise<ConfirmationRecord> { return this.repository.createConfirmation(value); }
  getConfirmation(id: string): Promise<ConfirmationRecord | undefined> { return this.repository.getConfirmation(id); }
  claimConfirmation(id: string, actorId: string, key: string, hash: string, now: number): Promise<ConfirmationClaim> { return this.repository.claimConfirmation(id, actorId, key, hash, now); }
  completeConfirmation(id: string, actorId: string, key: string, status: Exclude<ConfirmationStatus, 'PENDING' | 'PROCESSING' | 'EXPIRED'>, result: Record<string, unknown>, code?: string): Promise<void> { return this.repository.completeConfirmation(id, actorId, key, status, result, code); }
  getExecution(key: string): Promise<ExecutionRecord | undefined> { return this.repository.getExecution(key); }
  createPayment(value: PaymentRecord): Promise<PaymentRecord> { return this.repository.createPayment(value); }
  updatePayment(id: string, status: PaymentStatus, receiptId?: string): Promise<PaymentRecord> { return this.repository.updatePayment(id, status, receiptId); }
  getPayment(id: string): Promise<PaymentRecord | undefined> { return this.repository.getPayment(id); }
  findPayment(actorId: string, key: string): Promise<PaymentRecord | undefined> { return this.repository.findPayment(actorId, key); }
  findPaymentByOrder(orderId: string, actorId: string): Promise<PaymentRecord | undefined> { return this.repository.findPaymentByOrder(orderId, actorId); }
  createRefund(value: RefundRecord): Promise<RefundRecord> { return this.repository.createRefund(value); }
  getRefundByKey(paymentId: string, key: string): Promise<RefundRecord | undefined> { return this.repository.getRefundByKey(paymentId, key); }
  listRefunds(paymentId: string): Promise<RefundRecord[]> { return this.repository.listRefunds(paymentId); }
  listPaymentsForReconciliation(): Promise<PaymentRecord[]> { return this.repository.listPaymentsForReconciliation(); }
  getReceipt(paymentId: string): Promise<Record<string, unknown> | undefined> { return this.repository.getReceipt(paymentId); }
  saveConversation(value: ConversationRecord): Promise<void> { return this.repository.saveConversation(value); }
  getConversation(id: string, actorId: string): Promise<ConversationRecord | undefined> { return this.repository.getConversation(id, actorId); }
  audit(value: { action: string; actorId?: string; correlationId?: string; resourceId?: string; metadata?: Record<string, unknown> }): Promise<void> { return this.repository.audit(value); }
  onModuleDestroy(): Promise<void> { return this.repository.close(); }
}

@Module({ providers: [CoreStore], exports: [CoreStore] })
export class CoreModule {}
