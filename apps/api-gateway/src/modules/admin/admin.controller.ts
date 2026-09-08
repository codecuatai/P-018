import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthRole, AuthUser } from '../auth/auth.types';
import { SupportPriority, SupportTicketStatus } from '../core/product-ops.store';
import { AdminGuard, ManagerOrAdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 20;
}

class SupportQuery extends PageQuery {
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) status?: SupportTicketStatus;
}

class UserStatusUpdateDto {
  @IsNotEmpty() @IsIn(['active', 'suspended', 'disabled']) status!: 'active' | 'suspended' | 'disabled';
}

class UserRoleUpdateDto {
  @IsNotEmpty() @IsIn(['user', 'customer', 'manager', 'provider', 'admin']) role!: AuthRole;
}

class SupportUpdateDto {
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) status?: SupportTicketStatus;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: SupportPriority;
}

class SupportMessageDto {
  @IsNotEmpty() @IsString() @MaxLength(5000) message!: string;
}

class AllFeedbackQuery extends PageQuery {
  @IsOptional() @IsIn(['food', 'ride', 'restaurant', 'healthcare']) domain?: 'food' | 'ride' | 'restaurant' | 'healthcare';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) rating_min?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) rating_max?: number;
  @IsOptional() @IsString() from_time?: string;
  @IsOptional() @IsString() to_time?: string;
}

class CreateApiKeyDto {
  @IsNotEmpty() @IsIn(['gemini', 'trello', 'geoapify', 'google_maps', 'other']) provider!: 'gemini' | 'trello' | 'geoapify' | 'google_maps' | 'other';
  @IsNotEmpty() @IsString() label!: string;
  @IsNotEmpty() @IsString() key!: string;
  @IsOptional() @IsString() expires_at?: string;
}

class RotateApiKeyDto {
  @IsNotEmpty() @IsString() key!: string;
  @IsOptional() @IsString() expires_at?: string;
}

class SystemLogsQuery extends PageQuery {
  @IsOptional() @IsString() actor_id?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() correlation_id?: string;
  @IsOptional() @IsString() from_time?: string;
  @IsOptional() @IsString() to_time?: string;
}

class TokenUsageQuery {
  @IsOptional() @IsString() from_time?: string;
  @IsOptional() @IsString() to_time?: string;
  @IsOptional() @IsString() feature?: string;
  @IsOptional() @IsString() model?: string;
}

@Controller('api/v1/admin')
@UseGuards(AuthGuard, ManagerOrAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('summary')
  async summary(@Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.summary(correlation(request)), request); }

  @Get('users')
  async users(@Query() query: PageQuery, @Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.users(query.page, query.page_size), request); }

  @Patch('users/:id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body() body: UserStatusUpdateDto,
    @Req() request: AdminRequest,
  ): Promise<object> {
    return this.reply(await this.admin.updateUserStatus(id, body.status, request.user.sub, correlation(request)), request);
  }

  @Patch('users/:id/role')
  @UseGuards(AdminGuard)
  async updateUserRole(
    @Param('id') id: string,
    @Body() body: UserRoleUpdateDto,
    @Req() request: AdminRequest,
  ): Promise<object> {
    return this.reply(await this.admin.updateUserRole(id, body.role, request.user.sub, correlation(request)), request);
  }

  @Get('users/:id/services')
  async userServices(@Param('id') id: string, @Req() request: AdminRequest): Promise<object> {
    return this.reply(await this.admin.userServiceSummary(id, correlation(request)), request);
  }

  @Get('users/:id/feedback')
  async userFeedback(@Param('id') id: string, @Query() query: PageQuery, @Req() request: AdminRequest): Promise<object> {
    return this.reply(await this.admin.userFeedback(id, query.page, query.page_size), request);
  }

  @Get('feedback')
  async allFeedback(@Query() query: AllFeedbackQuery, @Req() request: AdminRequest): Promise<object> {
    return this.reply(await this.admin.allFeedback(query), request);
  }

  @Get('api-keys')
  @UseGuards(AdminGuard)
  async listApiKeys(@Req() request: AdminRequest): Promise<object> {
    return this.reply(await this.admin.listApiKeys(), request);
  }

  @Post('api-keys')
  @UseGuards(AdminGuard)
  async createApiKey(@Body() body: CreateApiKeyDto, @Req() request: AdminRequest): Promise<object> {
    const key = await this.admin.createApiKey(body, request.user.sub, correlation(request));
    return this.reply(key, request);
  }

  @Patch('api-keys/:id/rotate')
  @UseGuards(AdminGuard)
  async rotateApiKey(@Param('id') id: string, @Body() body: RotateApiKeyDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: AdminRequest): Promise<object> {
    if (!idempotencyKey?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc khi xoay API key.', retryable: false });
    const key = await this.admin.rotateApiKey(id, body, request.user.sub, correlation(request), idempotencyKey.trim());
    if (!key) throw new NotFoundException({ code: 'API_KEY_NOT_FOUND', detail: 'API Key không tồn tại.', retryable: false });
    return this.reply(key, request);
  }

  @Patch('api-keys/:id/revoke')
  @UseGuards(AdminGuard)
  async revokeApiKey(@Param('id') id: string, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: AdminRequest): Promise<object> {
    if (!idempotencyKey?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc khi thu hồi API key.', retryable: false });
    const key = await this.admin.revokeApiKey(id, request.user.sub, correlation(request), idempotencyKey.trim());
    if (!key) throw new NotFoundException({ code: 'API_KEY_NOT_FOUND', detail: 'API Key không tồn tại.', retryable: false });
    return this.reply(key, request);
  }

  @Post('api-keys/:id/test')
  @UseGuards(AdminGuard)
  async testApiKey(@Param('id') id: string, @Req() request: AdminRequest): Promise<object> {
    const result = await this.admin.testApiKey(id, correlation(request));
    return this.reply(result, request);
  }

  @Get('logs')
  @UseGuards(AdminGuard)
  async logs(@Query() query: SystemLogsQuery, @Req() request: AdminRequest): Promise<object> {
    return this.reply(await this.admin.systemLogs(query), request);
  }

  @Get('system-logs')
  @UseGuards(AdminGuard)
  async systemLogs(@Query() query: SystemLogsQuery, @Req() request: AdminRequest): Promise<object> {
    return this.reply(await this.admin.systemLogs(query), request);
  }

  @Get('token-usage')
  @UseGuards(AdminGuard)
  async tokenUsage(@Query() query: TokenUsageQuery, @Req() request: AdminRequest): Promise<object> {
    return this.reply(await this.admin.tokenUsageSummary(query), request);
  }

  @Get('transactions')
  async transactions(@Query() query: PageQuery, @Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.transactions(query.page, query.page_size, correlation(request)), request); }

  @Get('payments')
  async payments(@Query() query: PageQuery, @Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.payments(query.page, query.page_size), request); }

  @Get('workflows')
  async workflows(@Query() query: PageQuery, @Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.workflows(query.page, query.page_size), request); }

  @Get('datasets')
  async datasets(@Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.datasets(correlation(request)), request); }

  @Get('system-health')
  async health(@Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.systemHealth(correlation(request)), request); }

  @Get('support-tickets')
  async support(@Query() query: SupportQuery, @Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.support(query.status, query.page, query.page_size), request); }

  @Get('support-tickets/:id')
  async supportDetail(@Param('id') id: string, @Req() request: AdminRequest): Promise<object> {
    const ticket = await this.admin.supportDetail(id);
    if (!ticket) throw new NotFoundException({ code: 'SUPPORT_TICKET_NOT_FOUND', detail: 'Support ticket không tồn tại.', retryable: false });
    return this.reply(ticket, request);
  }

  @Patch('support-tickets/:id')
  async updateSupport(@Param('id') id: string, @Body() body: SupportUpdateDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: AdminRequest): Promise<object> {
    if (!idempotencyKey?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc cho cập nhật support.', retryable: false });
    const ticket = await this.admin.updateSupport(id, body, request.user.sub, correlation(request), idempotencyKey.trim());
    if (!ticket) throw new NotFoundException({ code: 'SUPPORT_TICKET_NOT_FOUND', detail: 'Support ticket không tồn tại.', retryable: false });
    return this.reply(ticket, request);
  }

  @Post('support-tickets/:id/messages')
  async supportMessage(@Param('id') id: string, @Body() body: SupportMessageDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: AdminRequest): Promise<object> {
    if (!idempotencyKey?.trim()) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc khi gửi phản hồi support.', retryable: false });
    const ticket = await this.admin.addSupportMessage(id, body.message.trim(), request.user.sub, correlation(request), idempotencyKey.trim());
    if (!ticket) throw new NotFoundException({ code: 'SUPPORT_TICKET_NOT_FOUND', detail: 'Support ticket không tồn tại.', retryable: false });
    return this.reply(ticket, request);
  }

  @Get('feature-flags')
  async listFeatureFlags(@Req() request: AdminRequest): Promise<object> {
    return this.reply(await this.admin.listFeatureFlags(), request);
  }

  @Patch('feature-flags/:key')
  @UseGuards(AdminGuard)
  async updateFeatureFlag(
    @Param('key') key: string,
    @Body() body: { enabled: boolean },
    @Req() request: AdminRequest,
  ): Promise<object> {
    return this.reply(await this.admin.updateFeatureFlag(key, Boolean(body.enabled), request.user.sub), request);
  }

  @Get('audit-logs')
  async listAuditLogs(@Query() query: PageQuery, @Req() request: AdminRequest): Promise<object> {
    return this.reply(await this.admin.listAuditLogs(query.page, query.page_size), request);
  }

  @Post('operations/recovery/compensate')
  async issueCompensation(
    @Body() body: { workflow_id: string; amount?: number; reason?: string },
    @Req() request: AdminRequest,
  ): Promise<object> {
    const workflowId = body.workflow_id || 'wf_unknown';
    const amount = Number(body.amount ?? 50000);
    const reason = body.reason || 'Sự cố điều phối dịch vụ hoặc chậm trễ ngoài ý muốn';
    return this.reply(await this.admin.issueCompensation(workflowId, amount, reason, request.user.sub), request);
  }

  private reply(data: unknown, request: AdminRequest): object {
    return { data, meta: { request_id: request.correlationId, actor_id: request.user.sub } };
  }
}

type AdminRequest = CorrelatedRequest & { user: AuthUser };
function correlation(request: AdminRequest): string { return request.correlationId ?? 'cor_unknown'; }
