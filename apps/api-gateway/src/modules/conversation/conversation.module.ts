import { Body, Controller, Get, Injectable, Module, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { AgentClient, JsonObject } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthModule } from '../auth/auth.module';
import { DemoAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { CoreModule, CoreStore } from '../core/core.module';
import { ToolModule } from '../tools/tool.module';
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

  async send(conversationId: string, user: AuthUser, message: string, correlationId: string): Promise<JsonObject> {
    const current = await this.store.getConversation(conversationId, user.sub);
    const messages = current?.messages ?? [];
    const response = await this.agent.chat({ conversation_id: conversationId, user_id: user.sub, message, messages, workflow_context: current?.state ?? {}, correlation_id: correlationId }, correlationId);
    const userMessage = { role: 'user' as const, content: message, createdAt: new Date().toISOString() };
    const assistantMessage = { role: 'assistant' as const, content: String(response.message ?? response.response ?? ''), createdAt: new Date().toISOString() };
    const updates = response.state_updates;
    const stateUpdates = typeof updates === 'object' && updates !== null ? updates as JsonObject : {};
    await this.store.appendConversationTurn({ conversationId, actorId: user.sub, userMessage, assistantMessage, stateUpdates });
    return response;
  }
}

@Controller('api/v1/conversations')
@UseGuards(DemoAuthGuard)
export class FoodConversationController {
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

@Module({
  imports: [AuthModule, CoreModule, ToolModule],
  controllers: [FoodConversationController, RideConversationController],
  providers: [ConversationService, AgentClient, RideConversationService],
})
export class ConversationModule {}
