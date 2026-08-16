import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';

export type ProductOpsDomain = 'food' | 'ride' | 'restaurant' | 'healthcare';
export type FavoriteDomain = Exclude<ProductOpsDomain, 'ride'>;
export type NotificationStatus = 'UNREAD' | 'READ';
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type SupportPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type SupportEventType = 'CREATED' | 'MESSAGE' | 'STATUS_CHANGED';

export interface NotificationRecord {
  id: string;
  actorId: string;
  eventKey: string;
  type: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
  status: NotificationStatus;
  createdAt: string;
  readAt?: string;
}

export interface FavoriteRecord {
  id: string;
  actorId: string;
  domain: FavoriteDomain;
  resourceId: string;
  createdAt: string;
}

export interface FeedbackRecord {
  id: string;
  actorId: string;
  domain: ProductOpsDomain;
  resourceType: string;
  resourceId: string;
  rating: number;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketEventRecord {
  id: string;
  ticketId: string;
  actorId?: string;
  eventType: SupportEventType;
  message?: string;
  idempotencyKey?: string;
  requestHash?: string;
  createdAt: string;
}

export interface SupportTicketRecord {
  id: string;
  actorId: string;
  resourceType?: string;
  resourceId?: string;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportPriority;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  events?: SupportTicketEventRecord[];
}

export interface SupportTicketUpdateResult {
  ticket: SupportTicketRecord;
  replayed: boolean;
}

export interface ProductOpsStore {
  upsertNotification(value: NotificationRecord): Promise<NotificationRecord>;
  listNotifications(actorId: string, status?: NotificationStatus): Promise<NotificationRecord[]>;
  countUnreadNotifications(actorId: string): Promise<number>;
  markNotificationRead(id: string, actorId: string): Promise<NotificationRecord | undefined>;
  markAllNotificationsRead(actorId: string): Promise<number>;
  listFavorites(actorId: string): Promise<FavoriteRecord[]>;
  createFavorite(value: FavoriteRecord): Promise<FavoriteRecord>;
  deleteFavorite(id: string, actorId: string): Promise<boolean>;
  findFavorite(actorId: string, domain: FavoriteDomain, resourceId: string): Promise<FavoriteRecord | undefined>;
  listFeedback(actorId: string): Promise<FeedbackRecord[]>;
  upsertFeedback(value: FeedbackRecord): Promise<FeedbackRecord>;
  createSupportTicket(value: SupportTicketRecord, event: SupportTicketEventRecord): Promise<SupportTicketRecord>;
  listSupportTickets(actorId: string, options?: { status?: SupportTicketStatus; page?: number; pageSize?: number }): Promise<{ items: SupportTicketRecord[]; total: number }>;
  listAllSupportTickets(options?: { status?: SupportTicketStatus; page?: number; pageSize?: number }): Promise<{ items: SupportTicketRecord[]; total: number }>;
  getSupportTicket(id: string, actorId?: string): Promise<SupportTicketRecord | undefined>;
  addSupportEvent(event: SupportTicketEventRecord, updatedAt: string, status?: SupportTicketStatus): Promise<SupportTicketRecord | undefined>;
  updateSupportTicket(id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }, updatedAt: string, actorId: string, idempotencyKey: string, requestHash: string): Promise<SupportTicketUpdateResult | undefined>;
  checkHealth(): Promise<boolean>;
  close(): Promise<void>;
}

function clone<T>(value: T): T { return structuredClone(value); }

export class InMemoryProductOpsStore implements ProductOpsStore {
  private readonly notifications = new Map<string, NotificationRecord>();
  private readonly favorites = new Map<string, FavoriteRecord>();
  private readonly feedback = new Map<string, FeedbackRecord>();
  private readonly tickets = new Map<string, SupportTicketRecord>();
  private readonly ticketEvents = new Map<string, SupportTicketEventRecord>();

  async upsertNotification(value: NotificationRecord): Promise<NotificationRecord> {
    const existing = [...this.notifications.values()].find((item) => item.eventKey === value.eventKey);
    if (existing) return clone(existing);
    this.notifications.set(value.id, clone(value));
    return clone(value);
  }

  async listNotifications(actorId: string, status?: NotificationStatus): Promise<NotificationRecord[]> {
    return [...this.notifications.values()]
      .filter((item) => item.actorId === actorId && (!status || item.status === status))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map(clone);
  }

  async countUnreadNotifications(actorId: string): Promise<number> {
    return [...this.notifications.values()].filter((item) => item.actorId === actorId && item.status === 'UNREAD').length;
  }

  async markNotificationRead(id: string, actorId: string): Promise<NotificationRecord | undefined> {
    const value = this.notifications.get(id);
    if (!value || value.actorId !== actorId) return undefined;
    value.status = 'READ';
    value.readAt = value.readAt ?? new Date().toISOString();
    return clone(value);
  }

  async markAllNotificationsRead(actorId: string): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();
    for (const value of this.notifications.values()) {
      if (value.actorId === actorId && value.status === 'UNREAD') {
        value.status = 'READ';
        value.readAt = now;
        count += 1;
      }
    }
    return count;
  }

  async listFavorites(actorId: string): Promise<FavoriteRecord[]> {
    return [...this.favorites.values()].filter((item) => item.actorId === actorId).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).map(clone);
  }

  async createFavorite(value: FavoriteRecord): Promise<FavoriteRecord> {
    const existing = await this.findFavorite(value.actorId, value.domain, value.resourceId);
    if (existing) return existing;
    this.favorites.set(value.id, clone(value));
    return clone(value);
  }

  async deleteFavorite(id: string, actorId: string): Promise<boolean> {
    const value = this.favorites.get(id);
    if (!value || value.actorId !== actorId) return false;
    this.favorites.delete(id);
    return true;
  }

  async findFavorite(actorId: string, domain: FavoriteDomain, resourceId: string): Promise<FavoriteRecord | undefined> {
    const value = [...this.favorites.values()].find((item) => item.actorId === actorId && item.domain === domain && item.resourceId === resourceId);
    return value ? clone(value) : undefined;
  }

  async listFeedback(actorId: string): Promise<FeedbackRecord[]> {
    return [...this.feedback.values()].filter((item) => item.actorId === actorId).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).map(clone);
  }

  async upsertFeedback(value: FeedbackRecord): Promise<FeedbackRecord> {
    const existing = [...this.feedback.values()].find((item) => item.actorId === value.actorId && item.domain === value.domain && item.resourceType === value.resourceType && item.resourceId === value.resourceId);
    if (existing) {
      Object.assign(existing, { rating: value.rating, comment: value.comment, updatedAt: value.updatedAt });
      return clone(existing);
    }
    this.feedback.set(value.id, clone(value));
    return clone(value);
  }

  async createSupportTicket(value: SupportTicketRecord, event: SupportTicketEventRecord): Promise<SupportTicketRecord> {
    const existing = value.idempotencyKey ? [...this.tickets.values()].find((item) => item.actorId === value.actorId && item.idempotencyKey === value.idempotencyKey) : undefined;
    if (existing) return clone(existing);
    const saved = { ...value, events: [event] };
    this.tickets.set(value.id, clone(saved));
    this.ticketEvents.set(event.id, clone(event));
    return clone(saved);
  }

  async listSupportTickets(actorId: string, options: { status?: SupportTicketStatus; page?: number; pageSize?: number } = {}): Promise<{ items: SupportTicketRecord[]; total: number }> {
    const filtered = [...this.tickets.values()].filter((item) => item.actorId === actorId && (!options.status || item.status === options.status)).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
    return { total: filtered.length, items: filtered.slice((page - 1) * pageSize, page * pageSize).map((item) => clone({ ...item, events: undefined })) };
  }

  async listAllSupportTickets(options: { status?: SupportTicketStatus; page?: number; pageSize?: number } = {}): Promise<{ items: SupportTicketRecord[]; total: number }> {
    const filtered = [...this.tickets.values()].filter((item) => !options.status || item.status === options.status).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
    return { total: filtered.length, items: filtered.slice((page - 1) * pageSize, page * pageSize).map((item) => clone({ ...item, events: undefined })) };
  }

  async getSupportTicket(id: string, actorId?: string): Promise<SupportTicketRecord | undefined> {
    const value = this.tickets.get(id);
    if (!value || (actorId && value.actorId !== actorId)) return undefined;
    const events = [...this.ticketEvents.values()].filter((event) => event.ticketId === id).sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
    return clone({ ...value, events });
  }

  async addSupportEvent(event: SupportTicketEventRecord, updatedAt: string, status?: SupportTicketStatus): Promise<SupportTicketRecord | undefined> {
    const value = this.tickets.get(event.ticketId);
    if (!value) return undefined;
    if (event.idempotencyKey && [...this.ticketEvents.values()].some((item) => item.ticketId === event.ticketId && item.idempotencyKey === event.idempotencyKey)) return this.getSupportTicket(event.ticketId);
    this.ticketEvents.set(event.id, clone(event));
    value.updatedAt = updatedAt;
    if (status) {
      value.status = status;
      value.closedAt = status === 'CLOSED' ? value.closedAt ?? updatedAt : undefined;
    }
    return this.getSupportTicket(event.ticketId);
  }

  async updateSupportTicket(id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }, updatedAt: string, actorId: string, idempotencyKey: string, requestHash: string): Promise<SupportTicketUpdateResult | undefined> {
    const value = this.tickets.get(id);
    if (!value) return undefined;
    const existingEvent = [...this.ticketEvents.values()].find((event) => event.ticketId === id && event.idempotencyKey === idempotencyKey);
    if (existingEvent) {
      if (existingEvent.requestHash !== requestHash) throw new Error('IDEMPOTENCY_KEY_REUSED');
      const ticket = await this.getSupportTicket(id);
      return ticket ? { ticket, replayed: true } : undefined;
    }
    Object.assign(value, patch, { updatedAt, closedAt: patch.status === 'CLOSED' ? value.closedAt ?? updatedAt : patch.status ? undefined : value.closedAt });
    const eventId = `ticket-event-${randomUUID()}`;
    this.ticketEvents.set(eventId, { id: eventId, ticketId: id, actorId, eventType: 'STATUS_CHANGED', message: 'Admin support ticket updated.', idempotencyKey, requestHash, createdAt: updatedAt });
    const ticket = await this.getSupportTicket(id);
    return ticket ? { ticket, replayed: false } : undefined;
  }

  async checkHealth(): Promise<boolean> { return true; }
  async close(): Promise<void> {}
}

export class PostgresProductOpsStore implements ProductOpsStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) { this.pool = new Pool({ connectionString: databaseUrl, max: 4 }); }

  private notificationFromRow(row: Record<string, unknown>): NotificationRecord {
    return { id: String(row.id), actorId: String(row.actor_id), eventKey: String(row.event_key), type: String(row.type), title: String(row.title), body: String(row.body), ...(row.resource_type ? { resourceType: String(row.resource_type) } : {}), ...(row.resource_id ? { resourceId: String(row.resource_id) } : {}), status: row.status === 'READ' ? 'READ' : 'UNREAD', createdAt: new Date(String(row.created_at)).toISOString(), ...(row.read_at ? { readAt: new Date(String(row.read_at)).toISOString() } : {}) };
  }

  private favoriteFromRow(row: Record<string, unknown>): FavoriteRecord {
    return { id: String(row.id), actorId: String(row.actor_id), domain: row.domain as FavoriteDomain, resourceId: String(row.resource_id), createdAt: new Date(String(row.created_at)).toISOString() };
  }

  private feedbackFromRow(row: Record<string, unknown>): FeedbackRecord {
    return { id: String(row.id), actorId: String(row.actor_id), domain: row.domain as ProductOpsDomain, resourceType: String(row.resource_type), resourceId: String(row.resource_id), rating: Number(row.rating), ...(row.comment ? { comment: String(row.comment) } : {}), createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString() };
  }

  private eventFromRow(row: Record<string, unknown>): SupportTicketEventRecord {
    return { id: String(row.id), ticketId: String(row.ticket_id), ...(row.actor_id ? { actorId: String(row.actor_id) } : {}), eventType: row.event_type as SupportEventType, ...(row.message ? { message: String(row.message) } : {}), ...(row.idempotency_key ? { idempotencyKey: String(row.idempotency_key) } : {}), ...(row.request_hash ? { requestHash: String(row.request_hash) } : {}), createdAt: new Date(String(row.created_at)).toISOString() };
  }

  private ticketFromRow(row: Record<string, unknown>, events?: SupportTicketEventRecord[]): SupportTicketRecord {
    return { id: String(row.id), actorId: String(row.actor_id), ...(row.resource_type ? { resourceType: String(row.resource_type) } : {}), ...(row.resource_id ? { resourceId: String(row.resource_id) } : {}), subject: String(row.subject), description: String(row.description), status: row.status as SupportTicketStatus, priority: row.priority as SupportPriority, ...(row.idempotency_key ? { idempotencyKey: String(row.idempotency_key) } : {}), createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(), ...(row.closed_at ? { closedAt: new Date(String(row.closed_at)).toISOString() } : {}), ...(events ? { events } : {}) };
  }

  async upsertNotification(value: NotificationRecord): Promise<NotificationRecord> {
    const result = await this.pool.query(`INSERT INTO notifications (id,actor_id,event_key,type,title,body,resource_type,resource_id,status,created_at,read_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (event_key) DO UPDATE SET event_key=EXCLUDED.event_key RETURNING *`, [value.id, value.actorId, value.eventKey, value.type, value.title, value.body, value.resourceType ?? null, value.resourceId ?? null, value.status, value.createdAt, value.readAt ?? null]);
    return this.notificationFromRow(result.rows[0]);
  }

  async listNotifications(actorId: string, status?: NotificationStatus): Promise<NotificationRecord[]> { const result = await this.pool.query(`SELECT * FROM notifications WHERE actor_id=$1 ${status ? 'AND status=$2' : ''} ORDER BY created_at DESC`, status ? [actorId, status] : [actorId]); return result.rows.map((row) => this.notificationFromRow(row)); }
  async countUnreadNotifications(actorId: string): Promise<number> { const result = await this.pool.query("SELECT count(*)::int AS count FROM notifications WHERE actor_id=$1 AND status='UNREAD'", [actorId]); return Number(result.rows[0]?.count ?? 0); }
  async markNotificationRead(id: string, actorId: string): Promise<NotificationRecord | undefined> { const result = await this.pool.query("UPDATE notifications SET status='READ',read_at=COALESCE(read_at,now()) WHERE id=$1 AND actor_id=$2 RETURNING *", [id, actorId]); return result.rows[0] ? this.notificationFromRow(result.rows[0]) : undefined; }
  async markAllNotificationsRead(actorId: string): Promise<number> { const result = await this.pool.query("UPDATE notifications SET status='READ',read_at=COALESCE(read_at,now()) WHERE actor_id=$1 AND status='UNREAD'", [actorId]); return result.rowCount ?? 0; }
  async listFavorites(actorId: string): Promise<FavoriteRecord[]> { const result = await this.pool.query('SELECT * FROM user_favorites WHERE actor_id=$1 ORDER BY created_at DESC', [actorId]); return result.rows.map((row) => this.favoriteFromRow(row)); }
  async createFavorite(value: FavoriteRecord): Promise<FavoriteRecord> { const result = await this.pool.query('INSERT INTO user_favorites (id,actor_id,domain,resource_id,created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (actor_id,domain,resource_id) DO UPDATE SET resource_id=EXCLUDED.resource_id RETURNING *', [value.id, value.actorId, value.domain, value.resourceId, value.createdAt]); return this.favoriteFromRow(result.rows[0]); }
  async deleteFavorite(id: string, actorId: string): Promise<boolean> { const result = await this.pool.query('DELETE FROM user_favorites WHERE id=$1 AND actor_id=$2', [id, actorId]); return Boolean(result.rowCount); }
  async findFavorite(actorId: string, domain: FavoriteDomain, resourceId: string): Promise<FavoriteRecord | undefined> { const result = await this.pool.query('SELECT * FROM user_favorites WHERE actor_id=$1 AND domain=$2 AND resource_id=$3', [actorId, domain, resourceId]); return result.rows[0] ? this.favoriteFromRow(result.rows[0]) : undefined; }
  async listFeedback(actorId: string): Promise<FeedbackRecord[]> { const result = await this.pool.query('SELECT * FROM service_feedback WHERE actor_id=$1 ORDER BY updated_at DESC', [actorId]); return result.rows.map((row) => this.feedbackFromRow(row)); }
  async upsertFeedback(value: FeedbackRecord): Promise<FeedbackRecord> { const result = await this.pool.query('INSERT INTO service_feedback (id,actor_id,domain,resource_type,resource_id,rating,comment,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (actor_id,domain,resource_type,resource_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment,updated_at=EXCLUDED.updated_at RETURNING *', [value.id, value.actorId, value.domain, value.resourceType, value.resourceId, value.rating, value.comment ?? null, value.createdAt, value.updatedAt]); return this.feedbackFromRow(result.rows[0]); }

  async createSupportTicket(value: SupportTicketRecord, event: SupportTicketEventRecord): Promise<SupportTicketRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query('INSERT INTO support_tickets (id,actor_id,resource_type,resource_id,subject,description,idempotency_key,status,priority,created_at,updated_at,closed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (actor_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id', [value.id, value.actorId, value.resourceType ?? null, value.resourceId ?? null, value.subject, value.description, value.idempotencyKey ?? null, value.status, value.priority, value.createdAt, value.updatedAt, value.closedAt ?? null]);
      let ticketId = inserted.rows[0]?.id as string | undefined;
      if (!ticketId && value.idempotencyKey) {
        const existing = await client.query('SELECT id FROM support_tickets WHERE actor_id=$1 AND idempotency_key=$2', [value.actorId, value.idempotencyKey]);
        ticketId = existing.rows[0]?.id as string | undefined;
      }
      if (!ticketId) ticketId = value.id;
      if (inserted.rows[0]) await client.query('INSERT INTO support_ticket_events (id,ticket_id,actor_id,event_type,message,idempotency_key,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [event.id, ticketId, event.actorId ?? null, event.eventType, event.message ?? null, event.idempotencyKey ?? null, event.createdAt]);
      await client.query('COMMIT');
      return this.getSupportTicket(ticketId, value.actorId) as Promise<SupportTicketRecord>;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listSupportTickets(actorId: string, options: { status?: SupportTicketStatus; page?: number; pageSize?: number } = {}): Promise<{ items: SupportTicketRecord[]; total: number }> { const page = Math.max(options.page ?? 1, 1); const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100); const values: unknown[] = [actorId]; const where = ['actor_id=$1']; if (options.status) { values.push(options.status); where.push(`status=$${values.length}`); } const count = await this.pool.query(`SELECT count(*)::int AS count FROM support_tickets WHERE ${where.join(' AND ')}`, values); values.push(pageSize, (page - 1) * pageSize); const result = await this.pool.query(`SELECT * FROM support_tickets WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values); return { total: Number(count.rows[0]?.count ?? 0), items: result.rows.map((row) => this.ticketFromRow(row)) }; }
  async listAllSupportTickets(options: { status?: SupportTicketStatus; page?: number; pageSize?: number } = {}): Promise<{ items: SupportTicketRecord[]; total: number }> { const page = Math.max(options.page ?? 1, 1); const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100); const values: unknown[] = []; const where: string[] = []; if (options.status) { values.push(options.status); where.push(`status=$${values.length}`); } const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''; const count = await this.pool.query(`SELECT count(*)::int AS count FROM support_tickets ${clause}`, values); values.push(pageSize, (page - 1) * pageSize); const result = await this.pool.query(`SELECT * FROM support_tickets ${clause} ORDER BY updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values); return { total: Number(count.rows[0]?.count ?? 0), items: result.rows.map((row) => this.ticketFromRow(row)) }; }
  async getSupportTicket(id: string, actorId?: string): Promise<SupportTicketRecord | undefined> { const result = await this.pool.query(`SELECT * FROM support_tickets WHERE id=$1 ${actorId ? 'AND actor_id=$2' : ''}`, actorId ? [id, actorId] : [id]); if (!result.rows[0]) return undefined; const events = await this.pool.query('SELECT * FROM support_ticket_events WHERE ticket_id=$1 ORDER BY created_at ASC', [id]); return this.ticketFromRow(result.rows[0], events.rows.map((row) => this.eventFromRow(row))); }
  async addSupportEvent(event: SupportTicketEventRecord, updatedAt: string, status?: SupportTicketStatus): Promise<SupportTicketRecord | undefined> { const client = await this.pool.connect(); try { await client.query('BEGIN'); const update = await client.query(`UPDATE support_tickets SET updated_at=$1,status=COALESCE($2,status),closed_at=CASE WHEN $2='CLOSED' THEN COALESCE(closed_at,$1) WHEN $2 IS NOT NULL THEN NULL ELSE closed_at END WHERE id=$3 RETURNING *`, [updatedAt, status ?? null, event.ticketId]); if (!update.rows[0]) { await client.query('ROLLBACK'); return undefined; } const inserted = await client.query('INSERT INTO support_ticket_events (id,ticket_id,actor_id,event_type,message,idempotency_key,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (ticket_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id', [event.id, event.ticketId, event.actorId ?? null, event.eventType, event.message ?? null, event.idempotencyKey ?? null, event.createdAt]); if (!inserted.rows[0] && event.idempotencyKey) { await client.query('COMMIT'); return this.getSupportTicket(event.ticketId); } await client.query('COMMIT'); return this.getSupportTicket(event.ticketId); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  async updateSupportTicket(id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }, updatedAt: string, actorId: string, idempotencyKey: string, requestHash: string): Promise<SupportTicketUpdateResult | undefined> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const ticketRow = await client.query('SELECT id FROM support_tickets WHERE id=$1 FOR UPDATE', [id]);
      if (!ticketRow.rows[0]) { await client.query('ROLLBACK'); return undefined; }
      const existing = await client.query('SELECT request_hash FROM support_ticket_events WHERE ticket_id=$1 AND idempotency_key=$2 FOR UPDATE', [id, idempotencyKey]);
      if (existing.rows[0]) {
        if (String(existing.rows[0].request_hash ?? '') !== requestHash) throw new Error('IDEMPOTENCY_KEY_REUSED');
        await client.query('COMMIT');
        const replayedTicket = await this.getSupportTicket(id);
        return replayedTicket ? { ticket: replayedTicket, replayed: true } : undefined;
      }
      const eventId = `ticket-event-${randomUUID()}`;
      await client.query('INSERT INTO support_ticket_events (id,ticket_id,actor_id,event_type,message,idempotency_key,request_hash,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [eventId, id, actorId, 'STATUS_CHANGED', 'Admin support ticket updated.', idempotencyKey, requestHash, updatedAt]);
      const updated = await client.query('UPDATE support_tickets SET status=COALESCE($1,status),priority=COALESCE($2,priority),updated_at=$3,closed_at=CASE WHEN $1=\'CLOSED\' THEN COALESCE(closed_at,$3) WHEN $1 IS NOT NULL THEN NULL ELSE closed_at END WHERE id=$4 RETURNING id', [patch.status ?? null, patch.priority ?? null, updatedAt, id]);
      if (!updated.rows[0]) { await client.query('ROLLBACK'); return undefined; }
      await client.query('COMMIT');
      const updatedTicket = await this.getSupportTicket(id);
      return updatedTicket ? { ticket: updatedTicket, replayed: false } : undefined;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async checkHealth(): Promise<boolean> { try { await this.pool.query('SELECT 1'); return true; } catch { return false; } }
  async close(): Promise<void> { await this.pool.end(); }
}

@Injectable()
export class CoreProductOpsStore implements OnModuleDestroy {
  readonly repository: ProductOpsStore;

  constructor(config: ConfigService) { this.repository = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID ? new InMemoryProductOpsStore() : new PostgresProductOpsStore(config.getOrThrow<string>('DATABASE_URL')); }
  upsertNotification(value: NotificationRecord): Promise<NotificationRecord> { return this.repository.upsertNotification(value); }
  listNotifications(actorId: string, status?: NotificationStatus): Promise<NotificationRecord[]> { return this.repository.listNotifications(actorId, status); }
  countUnreadNotifications(actorId: string): Promise<number> { return this.repository.countUnreadNotifications(actorId); }
  markNotificationRead(id: string, actorId: string): Promise<NotificationRecord | undefined> { return this.repository.markNotificationRead(id, actorId); }
  markAllNotificationsRead(actorId: string): Promise<number> { return this.repository.markAllNotificationsRead(actorId); }
  listFavorites(actorId: string): Promise<FavoriteRecord[]> { return this.repository.listFavorites(actorId); }
  createFavorite(value: FavoriteRecord): Promise<FavoriteRecord> { return this.repository.createFavorite(value); }
  deleteFavorite(id: string, actorId: string): Promise<boolean> { return this.repository.deleteFavorite(id, actorId); }
  findFavorite(actorId: string, domain: FavoriteDomain, resourceId: string): Promise<FavoriteRecord | undefined> { return this.repository.findFavorite(actorId, domain, resourceId); }
  listFeedback(actorId: string): Promise<FeedbackRecord[]> { return this.repository.listFeedback(actorId); }
  upsertFeedback(value: FeedbackRecord): Promise<FeedbackRecord> { return this.repository.upsertFeedback(value); }
  createSupportTicket(value: SupportTicketRecord, event: SupportTicketEventRecord): Promise<SupportTicketRecord> { return this.repository.createSupportTicket(value, event); }
  listSupportTickets(actorId: string, options?: { status?: SupportTicketStatus; page?: number; pageSize?: number }): Promise<{ items: SupportTicketRecord[]; total: number }> { return this.repository.listSupportTickets(actorId, options); }
  listAllSupportTickets(options?: { status?: SupportTicketStatus; page?: number; pageSize?: number }): Promise<{ items: SupportTicketRecord[]; total: number }> { return this.repository.listAllSupportTickets(options); }
  getSupportTicket(id: string, actorId?: string): Promise<SupportTicketRecord | undefined> { return this.repository.getSupportTicket(id, actorId); }
  addSupportEvent(event: SupportTicketEventRecord, updatedAt: string, status?: SupportTicketStatus): Promise<SupportTicketRecord | undefined> { return this.repository.addSupportEvent(event, updatedAt, status); }
  updateSupportTicket(id: string, patch: { status?: SupportTicketStatus; priority?: SupportPriority }, updatedAt: string, actorId: string, idempotencyKey: string, requestHash: string): Promise<SupportTicketUpdateResult | undefined> { return this.repository.updateSupportTicket(id, patch, updatedAt, actorId, idempotencyKey, requestHash); }
  checkHealth(): Promise<boolean> { return this.repository.checkHealth(); }
  onModuleDestroy(): Promise<void> { return this.repository.close(); }
}
