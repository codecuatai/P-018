import { Controller, Get, NotFoundException, Query, Req, UseGuards } from '@nestjs/common';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';

// TODO: Rewards/loyalty system — no database schema yet.
// These endpoints return empty/zeroed real data until a loyalty service is built.
// Do NOT add mock/hardcoded points, vouchers, or referral names here.

@Controller('api/v1/rewards')
@UseGuards(AuthGuard)
export class RewardsController {
  @Get('summary')
  summary(@Req() request: CorrelatedRequest & { user: AuthUser }): object {
    void request.user;
    return {
      data: {
        points: 0,
        tier: 'standard',
        tier_label: 'Hạng Phổ Thông',
        next_tier_label: 'Hạng Bạc',
        next_tier_spend_remaining: null,
        points_expiring_soon: 0,
        expiry_date: null,
      },
      meta: { request_id: request.correlationId },
    };
  }

  @Get('vouchers')
  vouchers(
    @Query('status') _status: string | undefined,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): object {
    void request.user;
    return {
      data: { items: [] },
      meta: { request_id: request.correlationId },
    };
  }

  @Get('ledger')
  ledger(@Req() request: CorrelatedRequest & { user: AuthUser }): object {
    void request.user;
    return {
      data: { items: [], total: 0, has_more: false },
      meta: { request_id: request.correlationId },
    };
  }

  @Get('referral')
  referral(@Req() request: CorrelatedRequest & { user: AuthUser }): object {
    const raw = (request.user.sub ?? '').replace(/[^a-zA-Z0-9]/g, '');
    const code = `XONE${raw.slice(-5).toUpperCase()}`;
    return {
      data: {
        referral_code: code,
        referral_url: `https://xone.vn/join?ref=${code}`,
        total_referrals: 0,
        total_points_earned: 0,
        referrals: [],
      },
      meta: { request_id: request.correlationId },
    };
  }
}
