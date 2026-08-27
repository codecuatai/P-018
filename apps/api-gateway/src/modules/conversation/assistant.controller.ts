import { BadRequestException, Body, Controller, Headers, HttpCode, Post, Req, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { AssistantService } from './assistant.service';

class DeviceCurrentLocationBody {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address_text?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  accuracy_meters?: number;

  @IsDateString()
  captured_at!: string;

  @IsIn(['device'])
  source!: 'device';
}

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

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceCurrentLocationBody)
  current_location?: DeviceCurrentLocationBody;
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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  quantity?: number;
}

type AuthenticatedRequest = CorrelatedRequest & { user: AuthUser };

@Controller('api/v1/assistant')
@UseGuards(AuthGuard)
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
      body.current_location,
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
