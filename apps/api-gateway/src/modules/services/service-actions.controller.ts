import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

import { FoodClient, HealthcareClient, JsonObject, RestaurantClient } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';

enum FoodOrderStatus {
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  RESTAURANT_CONFIRMING = 'RESTAURANT_CONFIRMING',
  RESTAURANT_REJECTED = 'RESTAURANT_REJECTED',
  RESTAURANT_ACCEPTED = 'RESTAURANT_ACCEPTED',
  PREPARING = 'PREPARING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  DRIVER_ASSIGNED = 'DRIVER_ASSIGNED',
  PICKED_UP = 'PICKED_UP',
  DELIVERING = 'DELIVERING',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

class UpdateFoodStatusDto {
  @IsEnum(FoodOrderStatus)
  status!: string;
}

class FoodCartDto {
  @IsString()
  @MinLength(1)
  restaurant_id!: string;
}

class FoodCartItemDto {
  @IsString()
  @MinLength(1)
  menu_item_id!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FoodSelectedOptionDto)
  selected_options?: Array<{ group_id: string; option_id: string }>;
}

class FoodSelectedOptionDto {
  @IsString()
  @MinLength(1)
  group_id!: string;

  @IsString()
  @MinLength(1)
  option_id!: string;
}

class FoodCartItemUpdateDto {
  @IsInt()
  @Min(1)
  @Max(50)
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

class VoucherDto {
  @IsString()
  @MinLength(1)
  code!: string;
}

class RestaurantAvailabilityDto {
  @IsString()
  @MinLength(1)
  restaurant_id!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  party_size!: number;

  @IsString()
  @MinLength(1)
  start_at!: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(360)
  duration_minutes?: number;

  @IsOptional()
  @IsString()
  seating_type?: string;
}

class RestaurantHoldDto extends RestaurantAvailabilityDto {
}

class HealthcareHoldDto {
  @IsInt()
  @Min(1)
  slot_id!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  patient_id?: number;

  @IsString()
  @MinLength(1)
  symptoms!: string;
}

function correlation(request: CorrelatedRequest): string { return request.correlationId ?? 'cor_unknown'; }
function requiredIdempotency(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', detail: 'Idempotency-Key là bắt buộc cho thao tác ghi.', retryable: false });
  if (normalized.length < 8 || normalized.length > 128) {
    throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_INVALID', detail: 'Idempotency-Key phải có từ 8 đến 128 ký tự.', retryable: false });
  }
  return normalized;
}

@Controller('api/v1/service-actions')
@UseGuards(AuthGuard)
export class ServiceActionsController {
  constructor(private readonly food: FoodClient, private readonly restaurant: RestaurantClient, private readonly healthcare: HealthcareClient) {}


  @Patch('food/orders/:orderId/status')
  async updateFoodStatus(@Param('orderId') orderId: string, @Body() body: UpdateFoodStatusDto, @Headers('Idempotency-Key') idempotencyKey: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const key = requiredIdempotency(idempotencyKey);
    const updated = await this.food.updateOrderStatus(request.user.sub, correlation(request), orderId, { status: body.status }, key);
    return { data: updated, meta: { request_id: request.correlationId } };
  }

  @Get('food/restaurants/:restaurantId')
  async foodRestaurant(@Param('restaurantId') restaurantId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.food.get(`/api/v1/restaurants/${encodeURIComponent(restaurantId)}`, correlation(request), request.user.sub), meta: { request_id: request.correlationId } };
  }

  @Get('food/restaurants/:restaurantId/menu')
  async foodMenu(@Param('restaurantId') restaurantId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.food.get(`/api/v1/restaurants/${encodeURIComponent(restaurantId)}/menu`, correlation(request), request.user.sub), meta: { request_id: request.correlationId } };
  }

  @Post('food/cart')
  async createCart(@Body() body: FoodCartDto, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.food.createCart(request.user.sub, correlation(request), requiredIdempotency(key), body.restaurant_id), meta: { request_id: request.correlationId } };
  }

  @Get('food/cart/:cartId')
  async getCart(@Param('cartId') cartId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.food.getCart(request.user.sub, correlation(request), cartId), meta: { request_id: request.correlationId } };
  }

  @Post('food/cart/:cartId/items')
  async addCartItem(@Param('cartId') cartId: string, @Body() body: FoodCartItemDto, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.food.addCartItem(request.user.sub, correlation(request), cartId, body as unknown as JsonObject, requiredIdempotency(key)), meta: { request_id: request.correlationId } };
  }

  @Patch('food/cart/:cartId/items/:itemId')
  async updateCartItem(@Param('cartId') cartId: string, @Param('itemId') itemId: string, @Body() body: FoodCartItemUpdateDto, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.food.updateCartItem(request.user.sub, correlation(request), cartId, itemId, body as unknown as JsonObject, requiredIdempotency(key)), meta: { request_id: request.correlationId } };
  }

  @Delete('food/cart/:cartId/items/:itemId')
  async removeCartItem(@Param('cartId') cartId: string, @Param('itemId') itemId: string, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.food.removeCartItem(request.user.sub, correlation(request), cartId, itemId, requiredIdempotency(key)), meta: { request_id: request.correlationId } };
  }

  @Post('food/cart/:cartId/voucher')
  async applyVoucher(@Param('cartId') cartId: string, @Body() body: VoucherDto, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.food.applyVoucher(request.user.sub, correlation(request), cartId, body.code, requiredIdempotency(key)), meta: { request_id: request.correlationId } };
  }

  @Delete('food/cart/:cartId/voucher')
  async removeVoucher(@Param('cartId') cartId: string, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.food.removeVoucher(request.user.sub, correlation(request), cartId, requiredIdempotency(key)), meta: { request_id: request.correlationId } };
  }

  @Get('restaurant/:restaurantId')
  async restaurantDetail(@Param('restaurantId') restaurantId: string, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.restaurant.getRestaurant(restaurantId, request.user.sub, correlation(request)), meta: { request_id: request.correlationId } };
  }

  @Post('restaurant/availability')
  async availability(@Body() body: RestaurantAvailabilityDto, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (!body.restaurant_id?.trim()) throw new BadRequestException({ code: 'RESTAURANT_ID_REQUIRED', detail: 'Restaurant id là bắt buộc.', retryable: false });
    return { data: await this.restaurant.checkAvailability(request.user.sub, correlation(request), body.restaurant_id, { party_size: body.party_size, start_at: body.start_at, duration_minutes: body.duration_minutes ?? 120, ...(body.seating_type ? { seating_type: body.seating_type } : {}) }), meta: { request_id: request.correlationId } };
  }

  @Post('restaurant/hold')
  async hold(@Body() body: RestaurantHoldDto, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const { restaurant_id, ...payload } = body;
    return { data: await this.restaurant.createHold(request.user.sub, correlation(request), requiredIdempotency(key), { restaurant_id, ...payload, duration_minutes: payload.duration_minutes ?? 120 }), meta: { request_id: request.correlationId } };
  }

  @Post('restaurant/:reservationId/cancel')
  async cancelRestaurant(@Param('reservationId') reservationId: string, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.restaurant.cancelReservation(request.user.sub, correlation(request), requiredIdempotency(key), reservationId), meta: { request_id: request.correlationId } };
  }

  @Get('healthcare/doctors')
  async doctors(@Query('department') department: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    if (!department?.trim()) throw new BadRequestException({ code: 'DEPARTMENT_REQUIRED', detail: 'Chuyên khoa là bắt buộc.', retryable: false });
    return { data: await this.healthcare.listDoctors(request.user.sub, correlation(request), department.trim()), meta: { request_id: request.correlationId } };
  }

  @Post('healthcare/hold')
  async holdHealthcare(@Body() body: HealthcareHoldDto, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return { data: await this.healthcare.holdSlot(request.user.sub, correlation(request), requiredIdempotency(key), { slot_id: body.slot_id, ...(body.patient_id ? { patient_id: body.patient_id } : {}), symptoms: body.symptoms }), meta: { request_id: request.correlationId } };
  }

  @Post('healthcare/:appointmentId/payment')
  async healthcarePayment(@Param('appointmentId') appointmentId: string, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const id = Number(appointmentId);
    if (!Number.isInteger(id) || id < 1) throw new BadRequestException({ code: 'APPOINTMENT_ID_INVALID', detail: 'Appointment id không hợp lệ.', retryable: false });
    return { data: await this.healthcare.acknowledgePayment(id, request.user.sub, correlation(request), requiredIdempotency(key)), meta: { request_id: request.correlationId } };
  }

  @Post('healthcare/:appointmentId/cancel')
  async cancelHealthcare(@Param('appointmentId') appointmentId: string, @Headers('Idempotency-Key') key: string | undefined, @Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    const id = Number(appointmentId);
    if (!Number.isInteger(id) || id < 1) throw new BadRequestException({ code: 'APPOINTMENT_ID_INVALID', detail: 'Appointment id không hợp lệ.', retryable: false });
    return { data: await this.healthcare.cancelAppointment(request.user.sub, correlation(request), requiredIdempotency(key), id), meta: { request_id: request.correlationId } };
  }
}
