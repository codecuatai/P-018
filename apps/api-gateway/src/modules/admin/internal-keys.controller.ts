import { Controller, Get, Headers, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AdminService } from './admin.service';

function secureCompare(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@Controller('internal/api-keys')
export class InternalKeysController {
  constructor(
    private readonly admin: AdminService,
    private readonly config: ConfigService,
  ) {}

  @Get('active')
  async getActiveKeys(
    @Headers('x-internal-service-token') token: string | undefined,
    @Query('provider') provider: 'gemini' | 'trello' | 'geoapify' | 'google_maps' | 'other' = 'gemini',
    @Req() request?: CorrelatedRequest,
  ): Promise<{ data: { provider: string; keys: string[] }; meta: { request_id?: string } }> {
    const expected = this.config.getOrThrow<string>('INTERNAL_SERVICE_TOKEN');
    if (!secureCompare(token, expected)) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        detail: 'Internal service authentication required.',
      });
    }

    const keys = await this.admin.getActiveDecryptedKeys(provider);
    return {
      data: {
        provider,
        keys,
      },
      meta: {
        request_id: request?.correlationId,
      },
    };
  }
}
