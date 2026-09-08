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
  createdAt: string;
  updatedAt: string;
}

export interface ProviderServiceItemRecord {
  id: string;
  providerId: string;
  domain: 'ride' | 'food' | 'restaurant' | 'healthcare';
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

export interface ProviderOfferingsRepository {
  getProfile(userId: string): Promise<ProviderProfileRecord | undefined>;
  upsertProfile(userId: string, patch: Partial<ProviderProfileRecord>): Promise<ProviderProfileRecord>;
  listItems(userId: string, domain?: string): Promise<ProviderServiceItemRecord[]>;
  createItem(item: ProviderServiceItemRecord): Promise<ProviderServiceItemRecord>;
  toggleItem(userId: string, itemId: string, isAvailable: boolean): Promise<ProviderServiceItemRecord | undefined>;
  deleteItem(userId: string, itemId: string): Promise<boolean>;
  close(): Promise<void>;
}

export class InMemoryProviderOfferingsRepository implements ProviderOfferingsRepository {
  private readonly profiles = new Map<string, ProviderProfileRecord>();
  private readonly items = new Map<string, ProviderServiceItemRecord>();

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

    const result = await this.pool.query(
      `INSERT INTO provider_profiles (user_id, provider_type, tenant_id, status, business_name, description, address, phone, webhook_url, is_open, created_at, updated_at)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, now(), now())
       ON CONFLICT (user_id) DO UPDATE
       SET provider_type = COALESCE($2, provider_profiles.provider_type),
           business_name = COALESCE($4, provider_profiles.business_name),
           description = COALESCE($5, provider_profiles.description),
           address = COALESCE($6, provider_profiles.address),
           phone = COALESCE($7, provider_profiles.phone),
           webhook_url = COALESCE($8, provider_profiles.webhook_url),
           is_open = $9,
           updated_at = now()
       RETURNING *`,
      [userId, providerType, tenantId, businessName, description, address, phone, webhookUrl, isOpen],
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

  onModuleDestroy(): Promise<void> {
    return this.repository.close();
  }
}
