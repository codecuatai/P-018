import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { randomUUID } from 'crypto';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProviderAssignmentStatus, ProviderOfferingsStore } from './provider-offerings.store';

class CreateAssignmentDto {
  @IsString() @MaxLength(40) provider_id!: string;
  @IsString() @MaxLength(40) domain!: string;
  @IsString() @MaxLength(160) resource_id!: string;
  @IsOptional() @IsString() due_at?: string;
  @IsOptional() metadata?: Record<string, unknown>;
}

class UpdateAssignmentDto {
  @IsOptional() @IsString() @MaxLength(40) provider_id?: string;
  @IsOptional() @IsIn(['OFFERED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED']) status?: ProviderAssignmentStatus;
  @IsOptional() @IsString() due_at?: string;
  @IsOptional() metadata?: Record<string, unknown>;
}

class ReviewDocumentDto {
  @IsIn(['APPROVED', 'REJECTED', 'EXPIRED']) status!: 'APPROVED' | 'REJECTED' | 'EXPIRED';
  @IsOptional() @IsString() @MaxLength(500) review_note?: string;
}

@Controller('api/v1/operations')
@UseGuards(AuthGuard, RolesGuard)
@Roles('manager', 'admin')
export class OperationsController {
  constructor(private readonly store: ProviderOfferingsStore) {}

  @Get('assignments')
  async listAssignments(@Query('provider_id') providerId: string | undefined, @Query('domain') domain: string | undefined, @Query('status') status: ProviderAssignmentStatus | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const items = await this.store.listAssignments({ providerId, domain, status });
    const overdue = items.filter((item) => item.dueAt && Date.parse(item.dueAt) < Date.now() && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(item.status)).length;
    return { data: { items, count: items.length, overdue }, meta: { request_id: request.correlationId, actor_id: request.user.sub } };
  }

  @Post('assignments')
  async createAssignment(@Body() body: CreateAssignmentDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (!idempotencyKey?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc khi phân công provider.', retryable: false });
    const existing = (await this.store.listAssignments({ providerId: body.provider_id, domain: body.domain })).find((item) => item.resourceId === body.resource_id && !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(item.status));
    if (existing) return { data: existing, meta: { request_id: request.correlationId, replayed: true } };
    const now = new Date().toISOString();
    const created = await this.store.createAssignment({ id: `assign_${randomUUID().replaceAll('-', '').slice(0, 16)}`, providerId: body.provider_id, domain: body.domain, resourceId: body.resource_id, status: 'OFFERED', assignedBy: request.user.sub, dueAt: body.due_at ? new Date(body.due_at).toISOString() : undefined, metadata: body.metadata, createdAt: now, updatedAt: now });
    return { data: created, meta: { request_id: request.correlationId, replayed: false } };
  }

  @Patch('assignments/:id')
  async updateAssignment(@Param('id') id: string, @Body() body: UpdateAssignmentDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const updated = await this.store.updateAssignment(id, { providerId: body.provider_id, status: body.status, dueAt: body.due_at ? new Date(body.due_at).toISOString() : undefined, metadata: body.metadata });
    if (!updated) throw new BadRequestException({ code: 'ASSIGNMENT_NOT_FOUND', detail: 'Assignment không tồn tại.', retryable: false });
    return { data: updated, meta: { request_id: request.correlationId, actor_id: request.user.sub } };
  }

  @Get('provider-documents')
  async listDocuments(@Query('provider_id') providerId: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const items = await this.store.listDocuments(providerId);
    return { data: { items, count: items.length }, meta: { request_id: request.correlationId, actor_id: request.user.sub } };
  }

  @Patch('provider-documents/:id')
  async reviewDocument(@Param('id') id: string, @Body() body: ReviewDocumentDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (request.user.role !== 'admin') throw new ForbiddenException({ code: 'ADMIN_ACCESS_REQUIRED', detail: 'Chỉ Admin mới được duyệt hồ sơ provider.', retryable: false });
    const updated = await this.store.updateDocument(id, { status: body.status, reviewNote: body.review_note });
    if (!updated) throw new BadRequestException({ code: 'DOCUMENT_NOT_FOUND', detail: 'Tài liệu provider không tồn tại.', retryable: false });
    return { data: updated, meta: { request_id: request.correlationId, actor_id: request.user.sub } };
  }
}
