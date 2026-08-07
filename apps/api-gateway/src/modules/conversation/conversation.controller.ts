import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { RideConversationService } from './ride-conversation.service';

class ChatTurnDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  workflow_id?: string;
}

@Controller('api/v1')
export class ConversationController {
  constructor(private readonly conversations: RideConversationService) {}

  @Post('chat')
  async chat(
    @Body() body: ChatTurnDto,
    @Headers('x-actor-id') actorHeader: string | undefined,
    @Req() request: CorrelatedRequest,
  ): Promise<object> {
    const actorId = requireActor(actorHeader);
    const data = await this.conversations.chat(
      actorId,
      body.message,
      body.workflow_id,
      requireCorrelationId(request),
    );
    return envelope(data, requireCorrelationId(request));
  }

  @Post('workflows/:workflowId/confirm-service')
  async confirmService(
    @Param('workflowId') workflowId: string,
    @Headers('x-actor-id') actorHeader: string | undefined,
    @Req() request: CorrelatedRequest,
  ): Promise<object> {
    const data = await this.conversations.confirmService(
      requireActor(actorHeader),
      workflowId,
      requireCorrelationId(request),
    );
    return envelope(data, requireCorrelationId(request));
  }

  @Post('workflows/:workflowId/confirm-payment')
  async confirmPayment(
    @Param('workflowId') workflowId: string,
    @Headers('x-actor-id') actorHeader: string | undefined,
    @Req() request: CorrelatedRequest,
  ): Promise<object> {
    const data = await this.conversations.confirmPayment(
      requireActor(actorHeader),
      workflowId,
      requireCorrelationId(request),
    );
    return envelope(data, requireCorrelationId(request));
  }
}

function requireActor(value: string | undefined): string {
  if (!value || value.length > 128) {
    throw new BadRequestException('X-Actor-Id is required.');
  }
  return value;
}

function requireCorrelationId(request: CorrelatedRequest): string {
  if (!request.correlationId) {
    throw new BadRequestException('Correlation ID is unavailable.');
  }
  return request.correlationId;
}

function envelope(data: object, requestId: string): object {
  return {
    data,
    meta: {
      request_id: requestId,
      timestamp: new Date().toISOString(),
    },
  };
}
