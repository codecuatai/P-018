import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export interface ProviderProfileRecord {
  userId: string;
  providerType: 'ride_driver' | 'restaurant_merchant' | 'healthcare_doctor' | string;
  tenantId: string;
  status: 'active' | 'suspended';
  businessName?: string;
  description?: string;
  address?: string;
  phone?: string;
  webhookUrl?: string;
  isOpen: boolean;
  connectedServices?: Record<string, boolean>;
  isOnline?: boolean;
  serviceAreas?: string[];
  availabilitySchedule?: Record<string, { start: string; end: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderServiceItemRecord {
  id: string;
  providerId: string;
  domain: 'ride' | 'food' | 'restaurant' | 'healthcare' | string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  metadata?: Record<string, unknown>;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProviderDocumentStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type ProviderAssignmentStatus = 'OFFERED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

export interface ProviderAvailabilityRecord {
  providerId: string;
  isOnline: boolean;
  serviceAreas: string[];
  schedule: Record<string, { start: string; end: string }>;
  updatedAt: string;
}

export interface ProviderDocumentRecord {
  id: string;
  providerId: string;
  documentType: string;
  status: ProviderDocumentStatus;
  documentUrl?: string;
  expiresAt?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderAssignmentRecord {
  id: string;
  providerId: string;
  domain: string;
  resourceId: string;
  status: ProviderAssignmentStatus;
  assignedBy: string;
  dueAt?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderOfferingsRepository {
  getProfile(userId: string): Promise<ProviderProfileRecord | undefined>;
  upsertProfile(userId: string, patch: Partial<ProviderProfileRecord>): Promise<ProviderProfileRecord>;
  listItems(userId: string, domain?: string): Promise<ProviderServiceItemRecord[]>;
  createItem(item: ProviderServiceItemRecord): Promise<ProviderServiceItemRecord>;
  toggleItem(userId: string, itemId: string, isAvailable: boolean): Promise<ProviderServiceItemRecord | undefined>;
  deleteItem(userId: string, itemId: string): Promise<boolean>;
  getAvailability(userId: string): Promise<ProviderAvailabilityRecord>;
  upsertAvailability(userId: string, patch: Partial<ProviderAvailabilityRecord>): Promise<ProviderAvailabilityRecord>;
  listDocuments(userId?: string): Promise<ProviderDocumentRecord[]>;
  createDocument(value: ProviderDocumentRecord): Promise<ProviderDocumentRecord>;
  updateDocument(id: string, patch: Partial<Pick<ProviderDocumentRecord, 'status' | 'reviewNote' | 'expiresAt'>>): Promise<ProviderDocumentRecord | undefined>;
  listAssignments(options?: { providerId?: string; status?: ProviderAssignmentStatus; domain?: string }): Promise<ProviderAssignmentRecord[]>;
  createAssignment(value: ProviderAssignmentRecord): Promise<ProviderAssignmentRecord>;
  updateAssignment(id: string, patch: Partial<Pick<ProviderAssignmentRecord, 'providerId' | 'status' | 'dueAt' | 'metadata'>>): Promise<ProviderAssignmentRecord | undefined>;
  close(): Promise<void>;
}

export class InMemoryProviderOfferingsRepository implements ProviderOfferingsRepository {
  private readonly profiles = new Map<string, ProviderProfileRecord>();
  private readonly items = new Map<string, ProviderServiceItemRecord>();
  private readonly availability = new Map<string, ProviderAvailabilityRecord>();
  private readonly documents = new Map<string, ProviderDocumentRecord>();
  private readonly assignments = new Map<string, ProviderAssignmentRecord>();

  async getProfile(userId: string): Promise<ProviderProfileRecord | undefined> {
    return this.profiles.get(userId);
  }

  async upsertProfile(userId: string, patch: Partial<ProviderProfileRecord>): Promise<ProviderProfileRecord> {
    const existing = this.profiles.get(userId);
    const now = new Date().toISOString();
    const updated: ProviderProfileRecord = {
      userId,
      providerType: patch.providerType ?? existing?.providerType ?? 'ride_driver',
      tenantId: existing?.tenantId ?? `partner-${userId.slice(0, 8)}`,
      status: patch.status ?? existing?.status ?? 'active',
      businessName: patch.businessName ?? existing?.businessName,
      description: patch.description ?? existing?.description,
      address: patch.address ?? existing?.address,
      phone: patch.phone ?? existing?.phone,
      webhookUrl: patch.webhookUrl ?? existing?.webhookUrl,
      isOpen: patch.isOpen !== undefined ? patch.isOpen : (existing?.isOpen ?? true),
      connectedServices: patch.connectedServices ?? existing?.connectedServices ?? {
        ride: true,
        food: true,
        restaurant: true,
        healthcare: true,
      },
      isOnline: patch.isOnline ?? existing?.isOnline ?? false,
      serviceAreas: patch.serviceAreas ?? existing?.serviceAreas ?? [],
      availabilitySchedule: patch.availabilitySchedule ?? existing?.availabilitySchedule ?? {},
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.profiles.set(userId, updated);
    return updated;
  }

  async listItems(userId: string, domain?: string): Promise<ProviderServiceItemRecord[]> {
    const results: ProviderServiceItemRecord[] = [];
    for (const item of this.items.values()) {
      if (item.providerId === userId && (!domain || item.domain === domain)) {
        results.push({ ...item });
      }
    }
    return results.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async createItem(item: ProviderServiceItemRecord): Promise<ProviderServiceItemRecord> {
    this.items.set(item.id, { ...item });
    return { ...item };
  }

  async toggleItem(userId: string, itemId: string, isAvailable: boolean): Promise<ProviderServiceItemRecord | undefined> {
    const item = this.items.get(itemId);
    if (!item || item.providerId !== userId) return undefined;
    item.isAvailable = isAvailable;
    item.updatedAt = new Date().toISOString();
    return { ...item };
  }

  async deleteItem(userId: string, itemId: string): Promise<boolean> {
    const item = this.items.get(itemId);
    if (!item || item.providerId !== userId) return false;
    return this.items.delete(itemId);
  }

  async getAvailability(userId: string): Promise<ProviderAvailabilityRecord> {
    return this.availability.get(userId) ?? {
      providerId: userId,
      isOnline: false,
      serviceAreas: [],
      schedule: {},
      updatedAt: new Date(0).toISOString(),
    };
  }

  async upsertAvailability(userId: string, patch: Partial<ProviderAvailabilityRecord>): Promise<ProviderAvailabilityRecord> {
    const existing = await this.getAvailability(userId);
    const value: ProviderAvailabilityRecord = {
      providerId: userId,
      isOnline: patch.isOnline ?? existing.isOnline,
      serviceAreas: patch.serviceAreas ?? existing.serviceAreas,
      schedule: patch.schedule ?? existing.schedule,
      updatedAt: new Date().toISOString(),
    };
    this.availability.set(userId, value);
    return { ...value, serviceAreas: [...value.serviceAreas], schedule: { ...value.schedule } };
  }

  async listDocuments(userId?: string): Promise<ProviderDocumentRecord[]> {
    return [...this.documents.values()]
      .filter((item) => !userId || item.providerId === userId)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map((item) => ({ ...item }));
  }

  async createDocument(value: ProviderDocumentRecord): Promise<ProviderDocumentRecord> {
    this.documents.set(value.id, { ...value });
    return { ...value };
  }

  async updateDocument(id: string, patch: Partial<Pick<ProviderDocumentRecord, 'status' | 'reviewNote' | 'expiresAt'>>): Promise<ProviderDocumentRecord | undefined> {
    const existing = this.documents.get(id);
    if (!existing) return undefined;
    Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
    return { ...existing };
  }

  async listAssignments(options: { providerId?: string; status?: ProviderAssignmentStatus; domain?: string } = {}): Promise<ProviderAssignmentRecord[]> {
    return [...this.assignments.values()]
      .filter((item) => (!options.providerId || item.providerId === options.providerId) && (!options.status || item.status === options.status) && (!options.domain || item.domain === options.domain))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map((item) => ({ ...item, metadata: item.metadata ? { ...item.metadata } : undefined }));
  }

  async createAssignment(value: ProviderAssignmentRecord): Promise<ProviderAssignmentRecord> {
    this.assignments.set(value.id, { ...value });
    return { ...value };
  }

  async updateAssignment(id: string, patch: Partial<Pick<ProviderAssignmentRecord, 'providerId' | 'status' | 'dueAt' | 'metadata'>>): Promise<ProviderAssignmentRecord | undefined> {
    const existing = this.assignments.get(id);
    if (!existing) return undefined;
    Object.assign(existing, patch, { updatedAt: new Date().toISOString() });
    return { ...existing, metadata: existing.metadata ? { ...existing.metadata } : undefined };
  }

  async close(): Promise<void> {}
}

export class PostgresProviderOfferingsRepository implements ProviderOfferingsRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 4 });
  }

  private profileFromRow(row: Record<string, unknown>): ProviderProfileRecord {
    const cleanStr = (val: unknown): string | undefined => {
      if (!val) return undefined;
      const s = String(val).replace(/\uFFFD/g, '').trim();
      return s.length > 0 ? s : undefined;
    };

    return {
      userId: String(row.user_id),
      providerType: String(row.provider_type),
      tenantId: String(row.tenant_id),
      status: row.status === 'suspended' ? 'suspended' : 'active',
      businessName: cleanStr(row.business_name),
      description: cleanStr(row.description),
      address: cleanStr(row.address),
      phone: cleanStr(row.phone),
      webhookUrl: cleanStr(row.webhook_url),
      isOpen: row.is_open !== false,
      isOnline: row.is_online === true,
      serviceAreas: Array.isArray(row.service_areas) ? row.service_areas.map(String) : [],
      availabilitySchedule: typeof row.availability_schedule === 'object' && row.availability_schedule !== null ? row.availability_schedule as Record<string, { start: string; end: string }> : {},
      connectedServices:
        row.connected_services && typeof row.connected_services === 'object'
          ? { ride: true, food: true, restaurant: true, healthcare: true, delivery: false, ...(row.connected_services as Record<string, boolean>) }
          : { ride: true, food: true, restaurant: true, healthcare: true },
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  private itemFromRow(row: Record<string, unknown>): ProviderServiceItemRecord {
    const cleanStr = (val: unknown): string | undefined => {
      if (!val) return undefined;
      const s = String(val).replace(/\uFFFD/g, '').trim();
      return s.length > 0 ? s : undefined;
    };

    return {
      id: String(row.id),
      providerId: String(row.provider_id),
      domain: row.domain as ProviderServiceItemRecord['domain'],
      name: cleanStr(row.name) || String(row.name),
      description: cleanStr(row.description),
      price: Number(row.price ?? 0),
      currency: String(row.currency ?? 'VND'),
      category: cleanStr(row.category),
      metadata: typeof row.metadata === 'object' && row.metadata !== null ? (row.metadata as Record<string, unknown>) : {},
      isAvailable: row.is_available !== false,
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  private availabilityFromRow(row: Record<string, unknown>): ProviderAvailabilityRecord {
    const schedule = typeof row.availability_schedule === 'object' && row.availability_schedule !== null ? row.availability_schedule as Record<string, { start: string; end: string }> : {};
    const serviceAreas = Array.isArray(row.service_areas) ? row.service_areas.map(String) : [];
    return { providerId: String(row.user_id), isOnline: row.is_online === true, serviceAreas, schedule, updatedAt: new Date(String(row.updated_at)).toISOString() };
  }

  private documentFromRow(row: Record<string, unknown>): ProviderDocumentRecord {
    return {
      id: String(row.id), providerId: String(row.provider_id), documentType: String(row.document_type),
      status: row.status as ProviderDocumentStatus, documentUrl: row.document_url ? String(row.document_url) : undefined,
      expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : undefined,
      reviewNote: row.review_note ? String(row.review_note) : undefined,
      createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  private assignmentFromRow(row: Record<string, unknown>): ProviderAssignmentRecord {
    return {
      id: String(row.id), providerId: String(row.provider_id), domain: String(row.domain), resourceId: String(row.resource_id),
      status: row.status as ProviderAssignmentStatus, assignedBy: String(row.assigned_by), dueAt: row.due_at ? new Date(String(row.due_at)).toISOString() : undefined,
      metadata: typeof row.metadata === 'object' && row.metadata !== null ? row.metadata as Record<string, unknown> : undefined,
      createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  async getProfile(userId: string): Promise<ProviderProfileRecord | undefined> {
    const result = await this.pool.query('SELECT * FROM provider_profiles WHERE user_id = $1', [userId]);
    return result.rows[0] ? this.profileFromRow(result.rows[0]) : undefined;
  }

  async upsertProfile(userId: string, patch: Partial<ProviderProfileRecord>): Promise<ProviderProfileRecord> {
    const cleanStr = (val?: string | null): string | null => {
      if (!val) return null;
      const s = val.replace(/\uFFFD/g, '').trim();
      return s.length > 0 ? s : null;
    };

    const existing = await this.getProfile(userId);
    const providerType = patch.providerType ?? existing?.providerType ?? 'ride_driver';
    const tenantId = existing?.tenantId ?? `partner-${userId.slice(0, 8)}`;
    const businessName = cleanStr(patch.businessName) ?? existing?.businessName ?? null;
    const description = cleanStr(patch.description) ?? existing?.description ?? null;
    const address = cleanStr(patch.address) ?? existing?.address ?? null;
    const phone = cleanStr(patch.phone) ?? existing?.phone ?? null;
    const webhookUrl = cleanStr(patch.webhookUrl) ?? existing?.webhookUrl ?? null;
    const isOpen = patch.isOpen !== undefined ? patch.isOpen : (existing?.isOpen ?? true);
    const connectedServices = patch.connectedServices ?? existing?.connectedServices ?? {
      ride: true,
      food: true,
      restaurant: true,
      healthcare: true,
    };
    const connectedServicesJson = JSON.stringify(connectedServices);

    const result = await this.pool.query(
      `INSERT INTO provider_profiles (user_id, provider_type, tenant_id, status, business_name, description, address, phone, webhook_url, is_open, connected_services, is_online, availability_schedule, service_areas, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, $10::jsonb, false, '{}'::jsonb, '{}'::text[], now(), now())
       ON CONFLICT (user_id) DO UPDATE
       SET provider_type = COALESCE($2, provider_profiles.provider_type),
           business_name = COALESCE($4, provider_profiles.business_name),
           description = COALESCE($5, provider_profiles.description),
           address = COALESCE($6, provider_profiles.address),
           phone = COALESCE($7, provider_profiles.phone),
           webhook_url = COALESCE($8, provider_profiles.webhook_url),
           is_open = $9,
           connected_services = $10::jsonb,
           updated_at = now()
       RETURNING *`,
      [userId, providerType, tenantId, businessName, description, address, phone, webhookUrl, isOpen, connectedServicesJson],
    );
    return this.profileFromRow(result.rows[0]);
  }

  async listItems(userId: string, domain?: string): Promise<ProviderServiceItemRecord[]> {
    const query = domain
      ? 'SELECT * FROM provider_service_items WHERE provider_id = $1 AND domain = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM provider_service_items WHERE provider_id = $1 ORDER BY created_at DESC';
    const params = domain ? [userId, domain] : [userId];
    const result = await this.pool.query(query, params);
    return result.rows.map((row) => this.itemFromRow(row));
  }

  async createItem(item: ProviderServiceItemRecord): Promise<ProviderServiceItemRecord> {
    const result = await this.pool.query(
      `INSERT INTO provider_service_items (id, provider_id, domain, name, description, price, currency, category, metadata, is_available, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [item.id, item.providerId, item.domain, item.name, item.description ?? null, item.price, item.currency, item.category ?? null, JSON.stringify(item.metadata ?? {}), item.isAvailable, item.createdAt, item.updatedAt],
    );
    return this.itemFromRow(result.rows[0]);
  }

  async toggleItem(userId: string, itemId: string, isAvailable: boolean): Promise<ProviderServiceItemRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE provider_service_items
       SET is_available = $1, updated_at = now()
       WHERE id = $2 AND provider_id = $3
       RETURNING *`,
      [isAvailable, itemId, userId],
    );
    return result.rows[0] ? this.itemFromRow(result.rows[0]) : undefined;
  }

  async deleteItem(userId: string, itemId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM provider_service_items WHERE id = $1 AND provider_id = $2',
      [itemId, userId],
    );
    return Boolean(result.rowCount && result.rowCount > 0);
  }

  async getAvailability(userId: string): Promise<ProviderAvailabilityRecord> {
    const result = await this.pool.query('SELECT user_id, is_online, availability_schedule, service_areas, updated_at FROM provider_profiles WHERE user_id = $1', [userId]);
    if (!result.rows[0]) return { providerId: userId, isOnline: false, serviceAreas: [], schedule: {}, updatedAt: new Date(0).toISOString() };
    return this.availabilityFromRow(result.rows[0]);
  }

  async upsertAvailability(userId: string, patch: Partial<ProviderAvailabilityRecord>): Promise<ProviderAvailabilityRecord> {
    const current = await this.getAvailability(userId);
    const isOnline = patch.isOnline ?? current.isOnline;
    const schedule = patch.schedule ?? current.schedule;
    const serviceAreas = patch.serviceAreas ?? current.serviceAreas;
    const result = await this.pool.query(
      `UPDATE provider_profiles SET is_online = $2, availability_schedule = $3::jsonb, service_areas = $4::text[], updated_at = now() WHERE user_id = $1 RETURNING user_id, is_online, availability_schedule, service_areas, updated_at`,
      [userId, isOnline, JSON.stringify(schedule), serviceAreas],
    );
    if (!result.rows[0]) throw new Error('PROVIDER_PROFILE_NOT_FOUND');
    return this.availabilityFromRow(result.rows[0]);
  }

  async listDocuments(userId?: string): Promise<ProviderDocumentRecord[]> {
    const result = userId
      ? await this.pool.query('SELECT * FROM provider_documents WHERE provider_id = $1 ORDER BY updated_at DESC', [userId])
      : await this.pool.query('SELECT * FROM provider_documents ORDER BY updated_at DESC');
    return result.rows.map((row) => this.documentFromRow(row));
  }

  async createDocument(value: ProviderDocumentRecord): Promise<ProviderDocumentRecord> {
    const result = await this.pool.query(
      `INSERT INTO provider_documents (id, provider_id, document_type, status, document_url, expires_at, review_note, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [value.id, value.providerId, value.documentType, value.status, value.documentUrl ?? null, value.expiresAt ?? null, value.reviewNote ?? null, value.createdAt, value.updatedAt],
    );
    return this.documentFromRow(result.rows[0]);
  }

  async updateDocument(id: string, patch: Partial<Pick<ProviderDocumentRecord, 'status' | 'reviewNote' | 'expiresAt'>>): Promise<ProviderDocumentRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE provider_documents SET status = COALESCE($2,status), review_note = COALESCE($3,review_note), expires_at = COALESCE($4,expires_at), updated_at = now() WHERE id = $1 RETURNING *`,
      [id, patch.status ?? null, patch.reviewNote ?? null, patch.expiresAt ?? null],
    );
    return result.rows[0] ? this.documentFromRow(result.rows[0]) : undefined;
  }

  async listAssignments(options: { providerId?: string; status?: ProviderAssignmentStatus; domain?: string } = {}): Promise<ProviderAssignmentRecord[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    for (const [column, value] of [['provider_id', options.providerId], ['status', options.status], ['domain', options.domain]] as const) {
      if (value) { params.push(value); clauses.push(`${column} = $${params.length}`); }
    }
    const result = await this.pool.query(`SELECT * FROM provider_assignments${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY updated_at DESC`, params);
    return result.rows.map((row) => this.assignmentFromRow(row));
  }

  async createAssignment(value: ProviderAssignmentRecord): Promise<ProviderAssignmentRecord> {
    const result = await this.pool.query(
      `INSERT INTO provider_assignments (id, provider_id, domain, resource_id, status, assigned_by, due_at, metadata, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`,
      [value.id, value.providerId, value.domain, value.resourceId, value.status, value.assignedBy, value.dueAt ?? null, JSON.stringify(value.metadata ?? {}), value.createdAt, value.updatedAt],
    );
    return this.assignmentFromRow(result.rows[0]);
  }

  async updateAssignment(id: string, patch: Partial<Pick<ProviderAssignmentRecord, 'providerId' | 'status' | 'dueAt' | 'metadata'>>): Promise<ProviderAssignmentRecord | undefined> {
    const result = await this.pool.query(
      `UPDATE provider_assignments SET provider_id = COALESCE($2,provider_id), status = COALESCE($3,status), due_at = COALESCE($4,due_at), metadata = COALESCE($5::jsonb,metadata), updated_at = now() WHERE id = $1 RETURNING *`,
      [id, patch.providerId ?? null, patch.status ?? null, patch.dueAt ?? null, patch.metadata ? JSON.stringify(patch.metadata) : null],
    );
    return result.rows[0] ? this.assignmentFromRow(result.rows[0]) : undefined;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

@Injectable()
export class ProviderOfferingsStore implements OnModuleDestroy {
  readonly repository: ProviderOfferingsRepository;

  constructor(config: ConfigService) {
    const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
    const databaseUrl = config.get<string>('DATABASE_URL');
    this.repository = isTest || !databaseUrl
      ? new InMemoryProviderOfferingsRepository()
      : new PostgresProviderOfferingsRepository(databaseUrl);
  }

  getProfile(userId: string): Promise<ProviderProfileRecord | undefined> {
    return this.repository.getProfile(userId);
  }

  upsertProfile(userId: string, patch: Partial<ProviderProfileRecord>): Promise<ProviderProfileRecord> {
    return this.repository.upsertProfile(userId, patch);
  }

  listItems(userId: string, domain?: string): Promise<ProviderServiceItemRecord[]> {
    return this.repository.listItems(userId, domain);
  }

  createItem(item: ProviderServiceItemRecord): Promise<ProviderServiceItemRecord> {
    return this.repository.createItem(item);
  }

  toggleItem(userId: string, itemId: string, isAvailable: boolean): Promise<ProviderServiceItemRecord | undefined> {
    return this.repository.toggleItem(userId, itemId, isAvailable);
  }

  deleteItem(userId: string, itemId: string): Promise<boolean> {
    return this.repository.deleteItem(userId, itemId);
  }

  getAvailability(userId: string): Promise<ProviderAvailabilityRecord> { return this.repository.getAvailability(userId); }
  upsertAvailability(userId: string, patch: Partial<ProviderAvailabilityRecord>): Promise<ProviderAvailabilityRecord> { return this.repository.upsertAvailability(userId, patch); }
  listDocuments(userId?: string): Promise<ProviderDocumentRecord[]> { return this.repository.listDocuments(userId); }
  createDocument(value: ProviderDocumentRecord): Promise<ProviderDocumentRecord> { return this.repository.createDocument(value); }
  updateDocument(id: string, patch: Partial<Pick<ProviderDocumentRecord, 'status' | 'reviewNote' | 'expiresAt'>>): Promise<ProviderDocumentRecord | undefined> { return this.repository.updateDocument(id, patch); }
  listAssignments(options?: { providerId?: string; status?: ProviderAssignmentStatus; domain?: string }): Promise<ProviderAssignmentRecord[]> { return this.repository.listAssignments(options); }
  createAssignment(value: ProviderAssignmentRecord): Promise<ProviderAssignmentRecord> { return this.repository.createAssignment(value); }
  updateAssignment(id: string, patch: Partial<Pick<ProviderAssignmentRecord, 'providerId' | 'status' | 'dueAt' | 'metadata'>>): Promise<ProviderAssignmentRecord | undefined> { return this.repository.updateAssignment(id, patch); }

  onModuleDestroy(): Promise<void> {
    return this.repository.close();
  }
}
