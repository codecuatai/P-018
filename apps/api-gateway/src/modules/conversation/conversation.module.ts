import { Body, Controller, Get, Injectable, Module, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { AgentClient, JsonObject } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthModule } from '../auth/auth.module';
import { DemoAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CoreModule, CoreStore } from '../core/core.module';

class MessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}

@Injectable()
export class ConversationService {
  constructor(private readonly store: CoreStore, private readonly agent: AgentClient) {}

  async send(conversationId: string, user: AuthUser, message: string, correlationId: string): Promise<JsonObject> {
    const current = await this.store.getConversation(conversationId, user.sub);
    const messages = current?.messages ?? [];
    const response = await this.agent.chat({ conversation_id: conversationId, user_id: user.sub, message, messages, workflow_context: current?.state ?? {}, correlation_id: correlationId }, correlationId);
    messages.push({ role: 'user', content: message, createdAt: new Date().toISOString() });
    messages.push({ role: 'assistant', content: String(response.message ?? response.response ?? ''), createdAt: new Date().toISOString() });
    const updates = response.state_updates;
    const state = { ...(current?.state ?? {}), ...(typeof updates === 'object' && updates !== null ? updates as JsonObject : {}) };
    await this.store.saveConversation({ conversationId, actorId: user.sub, messages, state });
    return response;
  }
}

@Controller('api/v1/conversations')
@UseGuards(DemoAuthGuard)
export class ConversationController {
  constructor(private readonly conversations: ConversationService, private readonly store: CoreStore) {}

  @Post(':conversationId/messages')
  message(@Param('conversationId') conversationId: string, @Body() body: MessageDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return this.conversations.send(conversationId, request.user, body.message, request.correlationId ?? 'cor_unknown').then((data) => ({ data, meta: { request_id: request.correlationId } }));
  }

  @Get(':conversationId')
  async get(@Param('conversationId') conversationId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const conversation = await this.store.getConversation(conversationId, request.user.sub);
    return { data: { conversation_id: conversationId, messages: conversation?.messages ?? [], state: conversation?.state ?? {} }, meta: { request_id: request.correlationId, actor_id: request.user.sub } };
  }
}

@Module({ imports: [AuthModule, CoreModule], controllers: [ConversationController], providers: [ConversationService, AgentClient] })
export class ConversationModule {}
