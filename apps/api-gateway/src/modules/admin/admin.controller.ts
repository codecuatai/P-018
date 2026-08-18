import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { SupportPriority, SupportTicketStatus } from '../core/product-ops.store';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) page_size = 20;
}

class SupportQuery extends PageQuery {
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) status?: SupportTicketStatus;
}

class SupportUpdateDto {
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) status?: SupportTicketStatus;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: SupportPriority;
}

@Controller('api/v1/admin')
@UseGuards(AuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('summary')
  async summary(@Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.summary(correlation(request)), request); }

  @Get('users')
  async users(@Query() query: PageQuery, @Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.users(query.page, query.page_size), request); }

  @Get('transactions')
  async transactions(@Query() query: PageQuery, @Req() request: AdminRequest): Promise<object> { return this.reply(await this.admin.transactions(correlation(request), query.page, query.page_size), request); }

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

  private reply(data: unknown, request: AdminRequest): object {
    return { data, meta: { request_id: request.correlationId, actor_id: request.user.sub } };
  }
}

type AdminRequest = CorrelatedRequest & { user: AuthUser };
function correlation(request: AdminRequest): string { return request.correlationId ?? 'cor_unknown'; }
