import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';

@Controller('api/v1/rewards')
@UseGuards(AuthGuard)
export class RewardsController {
  @Get('summary')
  summary(@Req() request: CorrelatedRequest & { user: AuthUser }): object {
    return {
      data: {
        points: 1250,
        tier: 'silver',
        tier_label: 'Hạng Bạc',
        next_tier_label: 'Hạng Vàng',
        next_tier_spend_remaining: 3750000,
        points_expiring_soon: 250,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      meta: { request_id: request.correlationId },
    };
  }

  @Get('vouchers')
  vouchers(@Query('status') status: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): object {
    const allVouchers = [
      {
        id: 'vch_ride_50k',
        code: 'RIDE50K',
        title: 'Giảm 50.000đ chuyến đi từ 150k',
        discount_value: 50000,
        discount_type: 'fixed' as const,
        min_order_value: 150000,
        service: 'ride',
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active' as const,
      },
      {
        id: 'vch_food_20pct',
        code: 'FOOD20',
        title: 'Giảm 20% đơn đồ ăn bất kỳ',
        discount_value: 20,
        discount_type: 'percent' as const,
        min_order_value: 100000,
        service: 'food',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active' as const,
      },
      {
        id: 'vch_clinic_100k',
        code: 'CLINIC100',
        title: 'Giảm 100.000đ khám tổng quát',
        discount_value: 100000,
        discount_type: 'fixed' as const,
        min_order_value: 300000,
        service: 'healthcare',
        expires_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'expired' as const,
      },
    ];

    const items = status ? allVouchers.filter((v) => v.status === status) : allVouchers;
    return { data: { items }, meta: { request_id: request.correlationId } };
  }

  @Get('ledger')
  ledger(@Req() request: CorrelatedRequest & { user: AuthUser }): object {
    const items = [
      {
        id: 'ledg_1',
        type: 'earn' as const,
        points: 150,
        description: 'Tích điểm chuyến xe #RB-8921',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'ledg_2',
        type: 'earn' as const,
        points: 200,
        description: 'Tích điểm đơn hàng Quán Cơm Niêu',
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'ledg_3',
        type: 'burn' as const,
        points: -500,
        description: 'Đổi voucher Giảm 50k chuyến xe',
        created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    return { data: { items, total: items.length, has_more: false }, meta: { request_id: request.correlationId } };
  }

  @Get('referral')
  referral(@Req() request: CorrelatedRequest & { user: AuthUser }): object {
    const code = `XONE${request.user.sub.replace(/[^a-zA-Z0-9]/g, '').slice(-5).toUpperCase()}`;
    return {
      data: {
        referral_code: code,
        referral_url: `https://xone.vn/join?ref=${code}`,
        total_referrals: 2,
        total_points_earned: 600,
        referrals: [
          { name: 'Nguyễn Văn Minh', joined_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), status: 'rewarded' as const },
          { name: 'Trần Thị Thu Thảo', joined_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), status: 'pending' as const },
        ],
      },
      meta: { request_id: request.correlationId },
    };
  }
}
