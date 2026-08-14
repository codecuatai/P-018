import { Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { randomUUID } from 'crypto';

import { AgentClient, JsonObject } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthModule } from '../auth/auth.module';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CoreModule, CoreStore } from '../core/core.module';
import { ConfirmationModule } from '../confirmation/confirmation.module';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { ToolModule } from '../tools/tool.module';
import { HealthcareClient, RestaurantClient } from '../../clients/service.clients';
import { PersonalModule } from '../personal/personal.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { ConversationController as RideConversationController } from './conversation.controller';
import { RideConversationService } from './ride-conversation.service';

class MessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}

@Injectable()
export class ConversationService {
  constructor(private readonly store: CoreStore, private readonly agent: AgentClient) {}

  async run(conversationId: string, user: AuthUser, message: string, correlationId: string, workflowContext?: JsonObject): Promise<JsonObject> {
    const current = await this.store.getConversation(conversationId, user.sub);
    if (!current) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', detail: 'Không tìm thấy cuộc trò chuyện.', retryable: false });
    return this.agent.chat({ conversation_id: conversationId, user_id: user.sub, message, messages: current.messages, workflow_context: workflowContext ?? current.state ?? {}, correlation_id: correlationId }, correlationId);
  }

  async send(conversationId: string, user: AuthUser, message: string, correlationId: string): Promise<JsonObject> {
    const response = await this.run(conversationId, user, message, correlationId);
    const userMessage = { role: 'user' as const, kind: 'USER' as const, visibility: 'USER_VISIBLE' as const, content: message, createdAt: new Date().toISOString() };
    const assistantMessage = { role: 'assistant' as const, kind: 'ASSISTANT' as const, visibility: 'USER_VISIBLE' as const, content: String(response.message ?? response.response ?? ''), createdAt: new Date().toISOString() };
    const updates = response.state_updates;
    const stateUpdates = typeof updates === 'object' && updates !== null ? updates as JsonObject : {};
    await this.store.appendConversationTurn({ conversationId, actorId: user.sub, userMessage, assistantMessage, stateUpdates });
    return response;
  }

  create(conversationId: string, user: AuthUser, title?: string, serviceContext?: string): Promise<import('../core/core.module').ConversationRecord> {
    return this.store.createConversation({ conversationId, actorId: user.sub, title, serviceContext });
  }
}

class ConversationDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  service_context?: string;
}

@Controller('api/v1/conversations')
@UseGuards(AuthGuard)
export class FoodConversationController {
  constructor(private readonly conversations: ConversationService, private readonly store: CoreStore) {}

  @Get()
  async list(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const includeArchived = request.query?.include_archived === 'true';
    return { data: { items: await this.store.listConversations(request.user.sub, { includeArchived }) }, meta: { request_id: request.correlationId } };
  }

  @Post()
  async create(@Body() body: ConversationDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const conversation = await this.conversations.create(`conv_${randomUUID()}`, request.user, body.title, body.service_context);
    return { data: conversation, meta: { request_id: request.correlationId } };
  }

  @Post(':conversationId/messages')
  message(@Param('conversationId') conversationId: string, @Body() body: MessageDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return this.conversations.send(conversationId, request.user, body.message, request.correlationId ?? 'cor_unknown').then((data) => ({ data, meta: { request_id: request.correlationId } }));
  }

  @Get(':conversationId')
  async get(@Param('conversationId') conversationId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const conversation = await this.store.getConversation(conversationId, request.user.sub);
    if (!conversation) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', detail: 'Không tìm thấy cuộc trò chuyện.', retryable: false });
    return { data: conversation, meta: { request_id: request.correlationId, actor_id: request.user.sub } };
  }

  @Patch(':conversationId')
  async update(@Param('conversationId') conversationId: string, @Body() body: Partial<ConversationDto> & { status?: 'ACTIVE' | 'ARCHIVED' }, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const updated = await this.store.updateConversation(conversationId, request.user.sub, { title: body.title, status: body.status });
    if (!updated) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', detail: 'Không tìm thấy cuộc trò chuyện.', retryable: false });
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Post(':conversationId/archive')
  archive(@Param('conversationId') conversationId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return this.update(conversationId, { status: 'ARCHIVED' }, request); }

  @Post(':conversationId/unarchive')
  unarchive(@Param('conversationId') conversationId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> { return this.update(conversationId, { status: 'ACTIVE' }, request); }

  @Delete(':conversationId')
  async remove(@Param('conversationId') conversationId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (!await this.store.deleteConversation(conversationId, request.user.sub)) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', detail: 'Không tìm thấy cuộc trò chuyện.', retryable: false });
    return { data: { deleted: true }, meta: { request_id: request.correlationId } };
  }
}

@Module({
  imports: [AuthModule, CoreModule, ToolModule, ConfirmationModule, PersonalModule],
  controllers: [FoodConversationController, RideConversationController, AssistantController],
  providers: [ConversationService, AgentClient, RideConversationService, AssistantService, RestaurantClient, HealthcareClient],
  exports: [ConversationService, RideConversationService, AssistantService],
})
export class ConversationModule {}
