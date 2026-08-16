import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Injectable, Module, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CoreModule } from '../core/core.module';
import { FavoriteDomain, ProductOpsDomain, SupportPriority, SupportTicketStatus } from '../core/product-ops.store';
import { ProductOpsService, FeedbackResourceType, LinkedResourceType } from './product-ops.service';

class NotificationQueryDto {
  @IsOptional()
  @IsIn(['UNREAD', 'READ'])
  status?: 'UNREAD' | 'READ';
}

class FavoriteDto {
  @IsIn(['food', 'restaurant', 'healthcare'])
  domain!: FavoriteDomain;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  resource_id!: string;
}

class FeedbackDto {
  @IsIn(['food', 'ride', 'restaurant', 'healthcare'])
  domain!: ProductOpsDomain;

  @IsIn(['food_order', 'ride_booking', 'restaurant_reservation', 'healthcare_appointment'])
  resource_type!: FeedbackResourceType;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  resource_id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

class SupportTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  subject!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsIn(['food_order', 'ride_booking', 'restaurant_reservation', 'healthcare_appointment'])
  resource_type?: LinkedResourceType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  resource_id?: string;

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: SupportPriority;
}

class SupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}

class SupportQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status?: SupportTicketStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page_size = 20;
}

class RestaurantRebookDto {
  @IsOptional()
  @IsISO8601()
  start_at?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  party_size?: number;
}

function correlation(request: CorrelatedRequest): string { return request.correlationId ?? 'cor_unknown'; }
function requiredIdempotency(value: string | undefined): string { if (!value?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc cho thao tác ghi.', retryable: false }); return value.trim(); }

@Controller('api/v1/notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly productOps: ProductOpsService) {}

  @Get()
  async list(@Query() query: NotificationQueryDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { const result = await this.productOps.listNotifications(request.user.sub, correlation(request), query.status); return { data: { ...result, items: result.items.map(presentNotification) }, meta: { request_id: request.correlationId } }; }

  @Get('unread-count')
  async unreadCount(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: await this.productOps.unreadCount(request.user.sub, correlation(request)), meta: { request_id: request.correlationId } }; }

  @Post(':id/read')
  async read(@Param('id') id: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: presentNotification(await this.productOps.markNotificationRead(id, request.user.sub)), meta: { request_id: request.correlationId } }; }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: await this.productOps.markAllNotificationsRead(request.user.sub), meta: { request_id: request.correlationId } }; }
}

@Controller('api/v1/favorites')
@UseGuards(AuthGuard)
export class FavoritesController {
  constructor(private readonly productOps: ProductOpsService) {}

  @Get()
  async list(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { const result = await this.productOps.listFavorites(request.user.sub); return { data: { items: result.items.map(presentFavorite) }, meta: { request_id: request.correlationId } }; }

  @Post()
  async create(@Body() body: FavoriteDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: presentFavorite(await this.productOps.createFavorite(request.user.sub, body.domain, body.resource_id.trim(), correlation(request))), meta: { request_id: request.correlationId } }; }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: await this.productOps.deleteFavorite(id, request.user.sub), meta: { request_id: request.correlationId } }; }
}

@Controller('api/v1/feedback')
@UseGuards(AuthGuard)
export class FeedbackController {
  constructor(private readonly productOps: ProductOpsService) {}

  @Get('mine')
  async mine(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { const result = await this.productOps.listFeedback(request.user.sub); return { data: { items: result.items.map(presentFeedback) }, meta: { request_id: request.correlationId } }; }

  @Post()
  async create(@Body() body: FeedbackDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: presentFeedback(await this.productOps.createFeedback(request.user.sub, correlation(request), { domain: body.domain, resourceType: body.resource_type, resourceId: body.resource_id.trim(), rating: body.rating, ...(body.comment?.trim() ? { comment: body.comment.trim() } : {}) })), meta: { request_id: request.correlationId } }; }
}

@Controller('api/v1/support/tickets')
@UseGuards(AuthGuard)
export class SupportController {
  constructor(private readonly productOps: ProductOpsService) {}

  @Get()
  async list(@Query() query: SupportQueryDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { const result = await this.productOps.listSupportTickets(request.user.sub, { status: query.status, page: query.page, pageSize: query.page_size }); return { data: { ...result, items: result.items.map(presentTicket) }, meta: { request_id: request.correlationId } }; }

  @Post()
  async create(@Body() body: SupportTicketDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: presentTicket(await this.productOps.createSupportTicket(request.user.sub, correlation(request), requiredIdempotency(idempotencyKey), { subject: body.subject.trim(), description: body.description.trim(), ...(body.resource_type ? { resourceType: body.resource_type } : {}), ...(body.resource_id ? { resourceId: body.resource_id.trim() } : {}), ...(body.priority ? { priority: body.priority } : {}) })), meta: { request_id: request.correlationId } }; }

  @Get(':id')
  async get(@Param('id') id: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: presentTicket(await this.productOps.getSupportTicket(id, request.user.sub)), meta: { request_id: request.correlationId } }; }

  @Post(':id/messages')
  async message(@Param('id') id: string, @Body() body: SupportMessageDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: presentTicket(await this.productOps.addSupportMessage(id, request.user.sub, requiredIdempotency(idempotencyKey), body.message.trim())), meta: { request_id: request.correlationId } }; }
}

@Controller('api/v1/reorders')
@UseGuards(AuthGuard)
export class ReordersController {
  constructor(private readonly productOps: ProductOpsService) {}

  @Post('food/:orderId')
  async food(@Param('orderId') orderId: string, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: await this.productOps.prepareFoodReorder(request.user.sub, correlation(request), requiredIdempotency(key), orderId), meta: { request_id: request.correlationId } }; }

  @Post('ride/:bookingId')
  async ride(@Param('bookingId') bookingId: string, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: await this.productOps.prepareRideRebook(request.user.sub, correlation(request), requiredIdempotency(key), bookingId), meta: { request_id: request.correlationId } }; }

  @Post('restaurant/:reservationId')
  async restaurant(@Param('reservationId') reservationId: string, @Body() body: RestaurantRebookDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return { data: await this.productOps.prepareRestaurantRebook(request.user.sub, correlation(request), reservationId, { ...(body.start_at ? { startAt: body.start_at } : {}), ...(body.party_size ? { partySize: body.party_size } : {}) }), meta: { request_id: request.correlationId } }; }

  @Post('healthcare/:appointmentId')
  async healthcare(@Param('appointmentId') appointmentId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { const id = Number(appointmentId); if (!Number.isInteger(id) || id < 1) throw new BadRequestException({ code: 'APPOINTMENT_ID_INVALID', detail: 'Mã lịch khám không hợp lệ.', retryable: false }); return { data: await this.productOps.prepareHealthcareRebook(request.user.sub, correlation(request), id), meta: { request_id: request.correlationId } }; }
}

@Module({ imports: [AuthModule, CoreModule], controllers: [NotificationsController, FavoritesController, FeedbackController, SupportController, ReordersController], providers: [ProductOpsService], exports: [ProductOpsService] })
export class ProductOpsModule {}

function presentNotification(value: Awaited<ReturnType<ProductOpsService['markNotificationRead']>>): Record<string, unknown> {
  return { id: value.id, actor_id: value.actorId, event_key: value.eventKey, type: value.type, title: value.title, body: value.body, ...(value.resourceType ? { resource_type: value.resourceType } : {}), ...(value.resourceId ? { resource_id: value.resourceId } : {}), status: value.status, created_at: value.createdAt, ...(value.readAt ? { read_at: value.readAt } : {}) };
}

function presentFavorite(value: Awaited<ReturnType<ProductOpsService['createFavorite']>>): Record<string, unknown> {
  return { id: value.id, actor_id: value.actorId, domain: value.domain, resource_id: value.resourceId, created_at: value.createdAt };
}

function presentFeedback(value: Awaited<ReturnType<ProductOpsService['createFeedback']>>): Record<string, unknown> {
  return { id: value.id, actor_id: value.actorId, domain: value.domain, resource_type: value.resourceType, resource_id: value.resourceId, rating: value.rating, ...(value.comment ? { comment: value.comment } : {}), created_at: value.createdAt, updated_at: value.updatedAt };
}

function presentTicket(value: Awaited<ReturnType<ProductOpsService['getSupportTicket']>>): Record<string, unknown> {
  return { id: value.id, actor_id: value.actorId, ...(value.resourceType ? { resource_type: value.resourceType } : {}), ...(value.resourceId ? { resource_id: value.resourceId } : {}), subject: value.subject, description: value.description, status: value.status, priority: value.priority, ...(value.idempotencyKey ? { idempotency_key: value.idempotencyKey } : {}), created_at: value.createdAt, updated_at: value.updatedAt, ...(value.closedAt ? { closed_at: value.closedAt } : {}), ...(value.events ? { events: value.events.map((event) => ({ id: event.id, ticket_id: event.ticketId, ...(event.actorId ? { actor_id: event.actorId } : {}), event_type: event.eventType, ...(event.message ? { message: event.message } : {}), ...(event.idempotencyKey ? { idempotency_key: event.idempotencyKey } : {}), created_at: event.createdAt })) } : {}) };
}
