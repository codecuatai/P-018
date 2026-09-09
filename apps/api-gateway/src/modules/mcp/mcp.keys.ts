import { Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { McpApiKeyStore } from './mcp.api-key.store';

class CreateMcpKeyDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}

@Injectable()
export class McpKeysService {
  constructor(private readonly keys: McpApiKeyStore) {}

  async createKey(user: AuthUser, label?: string): Promise<{ id: string; key: string; key_prefix: string; label: string; created_at: string }> {
    this.assertProvider(user);
    const { record, rawKey } = await this.keys.createKey(user.sub, label);
    return { id: record.id, key: rawKey, key_prefix: record.keyPrefix, label: record.label, created_at: record.createdAt };
  }

  async listKeys(user: AuthUser): Promise<object[]> {
    this.assertProvider(user);
    const items = await this.keys.listKeys(user.sub);
    return items.map((k) => ({ id: k.id, key_prefix: k.keyPrefix, label: k.label, last_used_at: k.lastUsedAt, created_at: k.createdAt }));
  }

  async revokeKey(user: AuthUser, keyId: string): Promise<boolean> {
    this.assertProvider(user);
    const deleted = await this.keys.revokeKey(user.sub, keyId);
    if (!deleted) throw new NotFoundException({ code: 'MCP_KEY_NOT_FOUND', detail: 'Không tìm thấy API Key.', retryable: false });
    return true;
  }

  private assertProvider(user: AuthUser): void {
    if (user.role !== 'provider') {
      throw new NotFoundException({ code: 'PROVIDER_ACCESS_REQUIRED', detail: 'Chức năng chỉ dành cho đối tác.', retryable: false });
    }
  }
}

@Controller('api/v1/provider/mcp-keys')
@UseGuards(AuthGuard)
export class McpKeysController {
  constructor(private readonly service: McpKeysService) {}

  @Post()
  async create(@Body() body: CreateMcpKeyDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const data = await this.service.createKey(request.user, body.label);
    return { data, meta: { request_id: request.correlationId, warning: 'API Key chỉ hiển thị 1 lần duy nhất. Hãy sao chép ngay.' } };
  }

  @Get()
  async list(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const items = await this.service.listKeys(request.user);
    return { data: { items, count: items.length }, meta: { request_id: request.correlationId } };
  }

  @Delete(':id')
  async revoke(@Param('id') id: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    await this.service.revokeKey(request.user, id);
    return { data: { revoked: true, id }, meta: { request_id: request.correlationId } };
  }
}
