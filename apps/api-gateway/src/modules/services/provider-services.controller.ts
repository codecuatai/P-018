import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { randomUUID } from 'crypto';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { ProviderOfferingsStore, ProviderServiceItemRecord } from './provider-offerings.store';

class UpdateProviderProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  business_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhook_url?: string;

  @IsOptional()
  @IsBoolean()
  is_open?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['ride_driver', 'restaurant_merchant', 'healthcare_doctor'])
  provider_type?: 'ride_driver' | 'restaurant_merchant' | 'healthcare_doctor';
}

class CreateProviderItemDto {
  @IsString()
  @IsIn(['ride', 'food', 'restaurant', 'healthcare'])
  domain!: 'ride' | 'food' | 'restaurant' | 'healthcare';

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

class ToggleItemStatusDto {
  @IsBoolean()
  is_available!: boolean;
}

@Controller('api/v1/provider/services')
@UseGuards(AuthGuard)
export class ProviderServicesController {
  constructor(private readonly store: ProviderOfferingsStore) {}

  private assertProvider(user: AuthUser): void {
    if (user.role !== 'provider') {
      throw new ForbiddenException({
        code: 'PROVIDER_ACCESS_REQUIRED',
        detail: 'Chức năng chỉ dành cho đối tác cung cấp dịch vụ.',
        retryable: false,
      });
    }
  }

  @Get('profile')
  async getProfile(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    let profile = await this.store.getProfile(userId);
    if (!profile) {
      profile = await this.store.upsertProfile(userId, {
        providerType: request.user.provider_type || 'ride_driver',
        businessName: request.user.full_name || request.user.email.split('@')[0],
        phone: request.user.phone,
        status: 'active',
        isOpen: true,
      });
    }
    return { data: profile, meta: { request_id: request.correlationId } };
  }

  @Put('profile')
  async updateProfile(
    @Body() body: UpdateProviderProfileDto,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    const updated = await this.store.upsertProfile(userId, {
      businessName: body.business_name,
      description: body.description,
      address: body.address,
      phone: body.phone,
      webhookUrl: body.webhook_url,
      isOpen: body.is_open,
      providerType: body.provider_type,
    });
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Get('items')
  async listItems(
    @Query('domain') domain: string | undefined,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    const items = await this.store.listItems(userId, domain);
    return { data: { items, count: items.length }, meta: { request_id: request.correlationId } };
  }

  @Post('items')
  async createItem(
    @Body() body: CreateProviderItemDto,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    const now = new Date().toISOString();
    const item: ProviderServiceItemRecord = {
      id: randomUUID(),
      providerId: userId,
      domain: body.domain,
      name: body.name.trim(),
      description: body.description?.trim(),
      price: body.price,
      currency: body.currency || 'VND',
      category: body.category?.trim() || 'Chung',
      metadata: body.metadata || {},
      isAvailable: true,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.store.createItem(item);
    return { data: created, meta: { request_id: request.correlationId } };
  }

  @Patch('items/:id/status')
  async toggleItemStatus(
    @Param('id') id: string,
    @Body() body: ToggleItemStatusDto,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    const updated = await this.store.toggleItem(userId, id, body.is_available);
    if (!updated) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        detail: 'Không tìm thấy dịch vụ tương ứng.',
        retryable: false,
      });
    }
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Delete('items/:id')
  async deleteItem(
    @Param('id') id: string,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    this.assertProvider(request.user);
    const userId = request.user.sub;
    const deleted = await this.store.deleteItem(userId, id);
    if (!deleted) {
      throw new NotFoundException({
        code: 'ITEM_NOT_FOUND',
        detail: 'Không tìm thấy dịch vụ để xóa.',
        retryable: false,
      });
    }
    return { data: { deleted: true, id }, meta: { request_id: request.correlationId } };
  }
}
