import { BadRequestException, Body, Controller, Headers, HttpCode, Post, Req, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { DemoAuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { AssistantService } from './assistant.service';

class AssistantChatBody {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  conversation_id?: string;
}

class AssistantActionBody {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  conversation_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  action_id!: string;
}

type AuthenticatedRequest = CorrelatedRequest & { user: AuthUser };

@Controller('api/v1/assistant')
@UseGuards(DemoAuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  @HttpCode(200)
  async chat(@Body() body: AssistantChatBody, @Req() request: AuthenticatedRequest) {
    const result = await this.assistant.chat(
      request.user,
      body.message,
      body.conversation_id,
      request.correlationId ?? 'cor_unknown',
    );
    return { data: result, meta: { request_id: request.correlationId } };
  }

  @Post('actions')
  @HttpCode(200)
  async action(
    @Body() body: AssistantActionBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const key = idempotencyKey?.trim() ?? '';
    if (!key) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key is required.' });
    }
    if (key.length > 255) {
      throw new UnprocessableEntityException({ code: 'IDEMPOTENCY_KEY_INVALID', detail: 'Idempotency-Key must be at most 255 characters.' });
    }
    const result = await this.assistant.act(
      request.user,
      body,
      request.correlationId ?? 'cor_unknown',
      key,
    );
    return { data: result, meta: { request_id: request.correlationId } };
  }
}
