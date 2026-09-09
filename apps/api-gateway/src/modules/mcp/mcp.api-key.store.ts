import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Pool } from 'pg';
import { AuthUser } from '../auth/auth.types';

export interface McpApiKeyRecord {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  label: string;
  status: 'active' | 'revoked';
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface McpApiKeyRepository {
  createKey(userId: string, label?: string): Promise<{ record: McpApiKeyRecord; rawKey: string }>;
  findUserByKey(token: string): Promise<AuthUser | undefined>;
  listKeys(userId: string): Promise<McpApiKeyRecord[]>;
  revokeKey(userId: string, keyId: string): Promise<boolean>;
  close(): Promise<void>;
}

export class InMemoryMcpApiKeyRepository implements McpApiKeyRepository {
  private readonly keys = new Map<string, McpApiKeyRecord>();
  private readonly userLookup: (userId: string) => Promise<AuthUser | undefined>;

  constructor(userLookup?: (userId: string) => Promise<AuthUser | undefined>) {
    this.userLookup = userLookup ?? (async (userId: string) => {
      if (userId === 'a0000000-0000-4000-8000-000000000003') {
        return {
          id: userId,
          sub: userId,
          email: 'provider@xone.local',
          role: 'provider',
          provider_type: 'ride_driver',
          tenant_id: 'partner-xone-01',
          full_name: 'X-One Service Partner',
          authentication_kind: 'real',
        };
      }
      return undefined;
    });

    // Seed demo key for testing
    const demoHash = createHash('sha256').update('xone_mcp_demo_secret_key_provider_001').digest('hex');
    this.keys.set('b0000000-0000-4000-8000-000000000001', {
      id: 'b0000000-0000-4000-8000-000000000001',
      userId: 'a0000000-0000-4000-8000-000000000003',
      keyHash: demoHash,
      keyPrefix: 'xone_mcp_demo...001',
      label: 'Seed Master Provider MCP Key',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async createKey(userId: string, label = 'Claude Desktop MCP Key'): Promise<{ record: McpApiKeyRecord; rawKey: string }> {
    const rawSecret = randomBytes(24).toString('hex');
    const rawKey = `xone_mcp_${rawSecret}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = `${rawKey.slice(0, 12)}...${rawKey.slice(-4)}`;
    const now = new Date().toISOString();
    const record: McpApiKeyRecord = {
      id: randomUUID(),
      userId,
      keyHash,
      keyPrefix,
      label: label.trim() || 'Claude Desktop MCP Key',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.keys.set(record.id, record);
    return { record, rawKey };
  }

  async findUserByKey(token: string): Promise<AuthUser | undefined> {
    const hash = createHash('sha256').update(token.trim()).digest('hex');
    for (const key of this.keys.values()) {
      if (key.keyHash === hash && key.status === 'active') {
        key.lastUsedAt = new Date().toISOString();
        return this.userLookup(key.userId);
      }
    }
    return undefined;
  }

  async listKeys(userId: string): Promise<McpApiKeyRecord[]> {
    return Array.from(this.keys.values())
      .filter((k) => k.userId === userId && k.status === 'active')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async revokeKey(userId: string, keyId: string): Promise<boolean> {
    const key = this.keys.get(keyId);
    if (!key || key.userId !== userId) return false;
    key.status = 'revoked';
    key.updatedAt = new Date().toISOString();
    return true;
  }

  async close(): Promise<void> {}
}

export class PostgresMcpApiKeyRepository implements McpApiKeyRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 4 });
  }

  async createKey(userId: string, label = 'Claude Desktop MCP Key'): Promise<{ record: McpApiKeyRecord; rawKey: string }> {
    const rawSecret = randomBytes(24).toString('hex');
    const rawKey = `xone_mcp_${rawSecret}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = `${rawKey.slice(0, 12)}...${rawKey.slice(-4)}`;
    const id = randomUUID();

    const result = await this.pool.query(
      `INSERT INTO mcp_api_keys (id, user_id, key_hash, key_prefix, label, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', now(), now())
       RETURNING id, user_id, key_hash, key_prefix, label, status, last_used_at, created_at, updated_at`,
      [id, userId, keyHash, keyPrefix, label.trim() || 'Claude Desktop MCP Key'],
    );
    const row = result.rows[0];
    return {
      rawKey,
      record: {
        id: String(row.id),
        userId: String(row.user_id),
        keyHash: String(row.key_hash),
        keyPrefix: String(row.key_prefix),
        label: String(row.label),
        status: row.status,
        lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)).toISOString() : undefined,
        createdAt: new Date(String(row.created_at)).toISOString(),
        updatedAt: new Date(String(row.updated_at)).toISOString(),
      },
    };
  }

  async findUserByKey(token: string): Promise<AuthUser | undefined> {
    const hash = createHash('sha256').update(token.trim()).digest('hex');
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, p.provider_type, p.tenant_id, k.id as key_id
       FROM mcp_api_keys k
       JOIN users u ON u.id = k.user_id
       LEFT JOIN provider_profiles p ON p.user_id = u.id
       WHERE k.key_hash = $1 AND k.status = 'active' AND u.status = 'active'`,
      [hash],
    );
    const row = result.rows[0];
    if (!row) return undefined;

    // Async update last_used_at without blocking
    void this.pool.query('UPDATE mcp_api_keys SET last_used_at = now() WHERE id = $1', [row.key_id]).catch(() => {});

    return {
      id: String(row.id),
      sub: String(row.id),
      email: String(row.email),
      full_name: row.full_name ? String(row.full_name) : undefined,
      phone: row.phone ? String(row.phone) : undefined,
      role: row.role,
      status: row.status,
      provider_type: row.provider_type ? String(row.provider_type) : undefined,
      tenant_id: row.tenant_id ? String(row.tenant_id) : undefined,
      authentication_kind: 'real',
    };
  }

  async listKeys(userId: string): Promise<McpApiKeyRecord[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, key_hash, key_prefix, label, status, last_used_at, created_at, updated_at
       FROM mcp_api_keys
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      keyHash: String(row.key_hash),
      keyPrefix: String(row.key_prefix),
      label: String(row.label),
      status: row.status,
      lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)).toISOString() : undefined,
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    }));
  }

  async revokeKey(userId: string, keyId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE mcp_api_keys SET status = 'revoked', updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status = 'active'`,
      [keyId, userId],
    );
    return Boolean(result.rowCount && result.rowCount > 0);
  }

  async close(): Promise<void> {}
}

@Injectable()
export class McpApiKeyStore implements OnModuleDestroy {
  readonly repository: McpApiKeyRepository;

  constructor(config: ConfigService) {
    const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
    const databaseUrl = config.get<string>('DATABASE_URL');
    this.repository = isTest || !databaseUrl
      ? new InMemoryMcpApiKeyRepository()
      : new PostgresMcpApiKeyRepository(databaseUrl);
  }

  createKey(userId: string, label?: string): Promise<{ record: McpApiKeyRecord; rawKey: string }> {
    return this.repository.createKey(userId, label);
  }

  findUserByKey(token: string): Promise<AuthUser | undefined> {
    return this.repository.findUserByKey(token);
  }

  listKeys(userId: string): Promise<McpApiKeyRecord[]> {
    return this.repository.listKeys(userId);
  }

  revokeKey(userId: string, keyId: string): Promise<boolean> {
    return this.repository.revokeKey(userId, keyId);
  }

  onModuleDestroy(): Promise<void> {
    return this.repository.close();
  }
}
