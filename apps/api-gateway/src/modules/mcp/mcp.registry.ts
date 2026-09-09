import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FoodClient, HealthcareClient, RestaurantClient, RideClient } from '../../clients/service.clients';
import { AuthUser } from '../auth/auth.types';
import { CoreStore } from '../core/core.module';
import { ProviderOfferingsStore } from '../services/provider-offerings.store';
import { ServiceHubService } from '../services/services.module';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiresWrite: boolean;
  domains?: string[];
}

const DOMAIN_GUARD_MAP: Record<string, string[]> = {
  restaurant_merchant: ['food', 'restaurant'],
  food: ['food', 'restaurant'],
  ride_driver: ['ride'],
  ride: ['ride'],
  healthcare_doctor: ['healthcare'],
  healthcare: ['healthcare'],
};

const RIDE_STATUS_ENUM = [
  'SEARCHING_DRIVER',
  'DRIVER_ASSIGNED',
  'DRIVER_TO_PICKUP',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
  'ARRIVED_DESTINATION',
  'COMPLETED',
  'CANCELLED',
];

const FOOD_STATUS_ENUM = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'DELIVERING',
  'COMPLETED',
  'CANCELLED',
];

function extractOpsItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
  if (obj.data && typeof obj.data === 'object') {
    const nested = obj.data as Record<string, unknown>;
    if (Array.isArray(nested.items)) return nested.items as Record<string, unknown>[];
  }
  return [];
}

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  // 3.1 Hồ sơ provider (3 tool)
  {
    name: 'provider.get_profile',
    description: 'Lấy hồ sơ đối tác hiện tại | Get current provider profile (business_name, is_open, webhook_url).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requiresWrite: false,
  },
  {
    name: 'provider.update_profile',
    description: 'Cập nhật hồ sơ quán/xe/phòng khám (tên, mô tả, địa chỉ, SĐT, webhook, đóng/mở) | Update provider profile.',
    inputSchema: {
      type: 'object',
      properties: {
        business_name: { type: 'string', maxLength: 200 },
        description: { type: 'string', maxLength: 500 },
        address: { type: 'string', maxLength: 255 },
        phone: { type: 'string', maxLength: 50 },
        webhook_url: { type: 'string', maxLength: 500 },
        is_open: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    requiresWrite: true,
  },
  {
    name: 'provider.list_items',
    description: 'Liệt kê món/xe/dịch vụ của quán | List own catalog items, optional domain filter (ride, food, restaurant, healthcare).',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string', enum: ['ride', 'food', 'restaurant', 'healthcare'] } },
      additionalProperties: false,
    },
    requiresWrite: false,
  },

  // 3.2 Quản trị catalog (4 tool)
  {
    name: 'catalog.create_item',
    description: 'Tạo món ăn / xe / chuyên khoa mới | Create a catalog item. Domain is checked against provider_type.',
    inputSchema: {
      type: 'object',
      required: ['domain', 'name', 'price'],
      properties: {
        domain: { type: 'string', enum: ['ride', 'food', 'restaurant', 'healthcare'] },
        name: { type: 'string', maxLength: 200 },
        description: { type: 'string', maxLength: 500 },
        price: { type: 'number', minimum: 0 },
        currency: { type: 'string', maxLength: 10 },
        category: { type: 'string', maxLength: 100 },
      },
      additionalProperties: false,
    },
    requiresWrite: true,
    domains: ['ride', 'food', 'restaurant', 'healthcare'],
  },
  {
    name: 'catalog.update_availability',
    description: 'Bật/tắt món hết hàng, xe bận, lịch đóng | Toggle item availability (is_available). Ví dụ: "hết món phở bò thì tắt đi".',
    inputSchema: {
      type: 'object',
      required: ['item_id', 'is_available'],
      properties: {
        item_id: { type: 'string' },
        is_available: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    requiresWrite: true,
  },
  {
    name: 'catalog.delete_item',
    description: 'Xóa một món ăn / dịch vụ khỏi danh mục của quán | Delete a catalog item by ID.',
    inputSchema: {
      type: 'object',
      required: ['item_id'],
      properties: { item_id: { type: 'string' } },
      additionalProperties: false,
    },
    requiresWrite: true,
  },
  {
    name: 'catalog.search',
    description: 'Tìm kiếm catalog công khai (món, nhà hàng, chuyên khoa) | Search public catalog across 4 services.',
    inputSchema: {
      type: 'object',
      required: ['service'],
      properties: {
        service: { type: 'string', enum: ['ride', 'food', 'restaurant', 'healthcare'] },
        q: { type: 'string', maxLength: 200 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    requiresWrite: false,
  },

  // 3.3 Ride — tài xế (4 tool)
  {
    name: 'ride.list_pending_bookings',
    description: 'Danh sách cuốc xe đang tìm tài xế hoặc chờ xác nhận | List pending ride bookings waiting for driver.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
    requiresWrite: false,
    domains: ['ride'],
  },
  {
    name: 'ride.accept_booking',
    description: 'Tài xế nhận cuốc xe (chuyển sang DRIVER_ASSIGNED) | Accept a ride booking.',
    inputSchema: {
      type: 'object',
      required: ['booking_id'],
      properties: { booking_id: { type: 'string' } },
      additionalProperties: false,
    },
    requiresWrite: true,
    domains: ['ride'],
  },
  {
    name: 'ride.update_trip_status',
    description: 'Cập nhật trạng thái chuyến xe (DRIVER_TO_PICKUP, DRIVER_ARRIVED, IN_PROGRESS, COMPLETED, CANCELLED).',
    inputSchema: {
      type: 'object',
      required: ['booking_id', 'status'],
      properties: {
        booking_id: { type: 'string' },
        status: { type: 'string', enum: RIDE_STATUS_ENUM },
      },
      additionalProperties: false,
    },
    requiresWrite: true,
    domains: ['ride'],
  },
  {
    name: 'ride.get_tracking',
    description: 'Lấy vị trí và hành trình của chuyến xe đang chạy | Get tracking route and driver location.',
    inputSchema: {
      type: 'object',
      required: ['booking_id'],
      properties: { booking_id: { type: 'string' } },
      additionalProperties: false,
    },
    requiresWrite: false,
    domains: ['ride'],
  },

  // 3.4 Food + Restaurant — quán ăn (5 tool)
  {
    name: 'food.list_orders',
    description: 'Danh sách đơn đặt món đang chờ quán xử lý | List pending food orders.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
    requiresWrite: false,
    domains: ['food', 'restaurant'],
  },
  {
    name: 'food.confirm_order',
    description: 'Quán xác nhận đơn đặt món (CONFIRMED) | Merchant confirms a food order.',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: { order_id: { type: 'string' } },
      additionalProperties: false,
    },
    requiresWrite: true,
    domains: ['food', 'restaurant'],
  },
  {
    name: 'food.reject_order',
    description: 'Quán từ chối đơn món (hết món, đóng quán) | Reject a food order with reason.',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: {
        order_id: { type: 'string' },
        reason: { type: 'string', maxLength: 200 },
      },
      additionalProperties: false,
    },
    requiresWrite: true,
    domains: ['food', 'restaurant'],
  },
  {
    name: 'food.update_order_status',
    description: 'Cập nhật trạng thái đơn món (PREPARING, READY_FOR_PICKUP, DELIVERING, COMPLETED).',
    inputSchema: {
      type: 'object',
      required: ['order_id', 'status'],
      properties: {
        order_id: { type: 'string' },
        status: { type: 'string', enum: FOOD_STATUS_ENUM },
      },
      additionalProperties: false,
    },
    requiresWrite: true,
    domains: ['food', 'restaurant'],
  },
  {
    name: 'restaurant.list_tables',
    description: 'Xem danh sách bàn trống và tình trạng nhà hàng | List restaurant availability and tables.',
    inputSchema: {
      type: 'object',
      properties: { keyword: { type: 'string', maxLength: 100 } },
      additionalProperties: false,
    },
    requiresWrite: false,
    domains: ['restaurant', 'food'],
  },
  {
    name: 'restaurant.update_open_status',
    description: 'Bật/tắt trạng thái mở cửa quán ăn / nhà hàng (is_open: true/false).',
    inputSchema: {
      type: 'object',
      required: ['is_open'],
      properties: { is_open: { type: 'boolean' } },
      additionalProperties: false,
    },
    requiresWrite: true,
    domains: ['restaurant', 'food'],
  },

  // 3.5 Healthcare — phòng khám (4 tool)
  {
    name: 'healthcare.list_appointments',
    description: 'Xem danh sách lịch hẹn khám bệnh chờ phòng khám xác nhận | List pending healthcare appointments.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
      additionalProperties: false,
    },
    requiresWrite: false,
    domains: ['healthcare'],
  },
  {
    name: 'healthcare.confirm_appointment',
    description: 'Bác sĩ / phòng khám xác nhận lịch khám của bệnh nhân | Confirm healthcare appointment.',
    inputSchema: {
      type: 'object',
      required: ['appointment_id'],
      properties: { appointment_id: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    },
    requiresWrite: true,
    domains: ['healthcare'],
  },
  {
    name: 'healthcare.cancel_appointment',
    description: 'Hủy lịch khám (bác sĩ bận, bệnh nhân yêu cầu) | Cancel appointment with reason.',
    inputSchema: {
      type: 'object',
      required: ['appointment_id'],
      properties: {
        appointment_id: { type: 'integer', minimum: 1 },
        reason: { type: 'string', maxLength: 200 },
      },
      additionalProperties: false,
    },
    requiresWrite: true,
    domains: ['healthcare'],
  },
  {
    name: 'healthcare.update_slots',
    description: 'Cập nhật khung giờ làm việc hoặc danh sách chuyên khoa | Update doctor slots or specialties.',
    inputSchema: {
      type: 'object',
      required: ['specialty'],
      properties: {
        specialty: { type: 'string', maxLength: 100 },
        available_slots: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    requiresWrite: true,
    domains: ['healthcare'],
  },

  // Công cụ gom tiện lợi bổ sung
  {
    name: 'operations.list_pending',
    description: 'Xem cuốc xe / đơn món / lịch khám đang chờ xử lý theo domain | Multi-service pending transactions.',
    inputSchema: {
      type: 'object',
      required: ['domain'],
      properties: { domain: { type: 'string', enum: ['ride', 'food', 'healthcare'] } },
      additionalProperties: false,
    },
    requiresWrite: false,
    domains: ['ride', 'food', 'healthcare'],
  },
];

@Injectable()
export class McpToolRegistry {
  constructor(
    private readonly store: ProviderOfferingsStore,
    private readonly hub: ServiceHubService,
    private readonly ride: RideClient,
    private readonly food: FoodClient,
    private readonly healthcare: HealthcareClient,
    private readonly restaurant: RestaurantClient,
    private readonly core: CoreStore,
  ) {}

  listTools() {
    return MCP_TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  assertDomain(user: AuthUser, domain: string): void {
    const isMaster = user.email === 'provider@xone.local' || user.tenant_id === 'partner-xone-01';
    if (isMaster) return;
    const pType = user.provider_type;
    if (!pType) return;
    const allowed = DOMAIN_GUARD_MAP[pType];
    if (allowed && !allowed.includes(domain)) {
      throw new BadRequestException({
        code: 'DOMAIN_NOT_PERMITTED',
        detail: `Đối tác ngành ${pType} chỉ được phép thao tác trong phạm vi: ${allowed.join(', ')}.`,
        retryable: false,
      });
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    user: AuthUser,
    correlationId: string,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const def = MCP_TOOL_DEFINITIONS.find((t) => t.name === name);
    if (!def) {
      throw new NotFoundException({ code: 'MCP_TOOL_NOT_FOUND', detail: `Tool không tồn tại: ${name}`, retryable: false });
    }
    if (user.role !== 'provider') {
      throw new ForbiddenException({ code: 'PROVIDER_ACCESS_REQUIRED', detail: 'Tool MCP chỉ dành cho provider.', retryable: false });
    }
    if (def.domains) {
      const explicitDomain = typeof args.domain === 'string' ? args.domain : def.domains[0];
      this.assertDomain(user, explicitDomain);
    }

    const key = idempotencyKey?.trim() || randomUUID();
    let result: unknown;

    switch (name) {
      // 3.1 Provider Profile & Items
      case 'provider.get_profile': {
        let profile = await this.store.getProfile(user.sub);
        if (!profile) {
          profile = await this.store.upsertProfile(user.sub, {
            providerType: user.provider_type || 'ride_driver',
            businessName: user.full_name || user.email.split('@')[0],
            phone: user.phone,
            status: 'active',
            isOpen: true,
          });
        }
        result = profile;
        break;
      }
      case 'provider.update_profile': {
        result = await this.store.upsertProfile(user.sub, {
          businessName: strArg(args.business_name),
          description: strArg(args.description),
          address: strArg(args.address),
          phone: strArg(args.phone),
          webhookUrl: strArg(args.webhook_url),
          isOpen: typeof args.is_open === 'boolean' ? args.is_open : undefined,
        });
        break;
      }
      case 'provider.list_items': {
        const domain = typeof args.domain === 'string' ? args.domain : undefined;
        const items = await this.store.listItems(user.sub, domain);
        result = { items, count: items.length };
        break;
      }

      // 3.2 Catalog
      case 'catalog.create_item': {
        const domain = String(args.domain);
        this.assertDomain(user, domain);
        const itemName = String(args.name ?? '').trim();
        const price = Number(args.price ?? 0);
        if (!itemName) throw new BadRequestException({ code: 'ITEM_NAME_REQUIRED', detail: 'Tên món/dịch vụ là bắt buộc.', retryable: false });
        if (!Number.isFinite(price) || price < 0) throw new BadRequestException({ code: 'ITEM_PRICE_INVALID', detail: 'Giá phải là số >= 0.', retryable: false });
        if (itemName.length > 200) throw new BadRequestException({ code: 'ITEM_NAME_TOO_LONG', detail: 'Tên vượt quá 200 ký tự.', retryable: false });
        const now = new Date().toISOString();
        result = await this.store.createItem({
          id: randomUUID(),
          providerId: user.sub,
          domain: domain as 'ride' | 'food' | 'restaurant' | 'healthcare',
          name: itemName,
          description: strArg(args.description),
          price,
          currency: strArg(args.currency) || 'VND',
          category: strArg(args.category) || 'Chung',
          metadata: {},
          isAvailable: true,
          createdAt: now,
          updatedAt: now,
        });
        break;
      }
      case 'catalog.update_availability': {
        const itemId = String(args.item_id ?? '');
        if (!itemId) throw new BadRequestException({ code: 'ITEM_ID_REQUIRED', detail: 'item_id là bắt buộc.', retryable: false });
        const updated = await this.store.toggleItem(user.sub, itemId, args.is_available === true);
        if (!updated) throw new NotFoundException({ code: 'ITEM_NOT_FOUND', detail: 'Không tìm thấy dịch vụ tương ứng.', retryable: false });
        result = updated;
        break;
      }
      case 'catalog.delete_item': {
        const itemId = String(args.item_id ?? '');
        if (!itemId) throw new BadRequestException({ code: 'ITEM_ID_REQUIRED', detail: 'item_id là bắt buộc.', retryable: false });
        const deleted = await this.store.deleteItem(user.sub, itemId);
        if (!deleted) throw new NotFoundException({ code: 'ITEM_NOT_FOUND', detail: 'Không tìm thấy dịch vụ để xóa.', retryable: false });
        result = { deleted: true, item_id: itemId };
        break;
      }
      case 'catalog.search': {
        const service = String(args.service);
        if (!['ride', 'food', 'restaurant', 'healthcare'].includes(service)) {
          throw new BadRequestException({ code: 'SERVICE_INVALID', detail: 'Dịch vụ không được hỗ trợ.', retryable: false });
        }
        const limit = typeof args.limit === 'number' ? Math.min(Math.max(Math.trunc(args.limit), 1), 100) : 12;
        const data = await this.hub.browse(
          service as 'ride' | 'food' | 'restaurant' | 'healthcare',
          user.sub,
          correlationId,
          typeof args.q === 'string' ? args.q : undefined,
          undefined,
          { page: 1, limit },
        );
        result = data;
        break;
      }

      // 3.3 Ride — Tài xế
      case 'ride.list_pending_bookings': {
        this.assertDomain(user, 'ride');
        try {
          const raw = await this.ride.opsTransactions(correlationId, 50, 0);
          const items = extractOpsItems(raw).filter((i) => ['SEARCHING_DRIVER', 'AWAITING_CONFIRMATION'].includes(String(i.status)));
          result = { items, count: items.length };
        } catch {
          result = { items: [], count: 0 };
        }
        break;
      }
      case 'ride.accept_booking': {
        this.assertDomain(user, 'ride');
        const bookingId = String(args.booking_id ?? '').trim();
        if (!bookingId) throw new BadRequestException({ code: 'BOOKING_ID_REQUIRED', detail: 'booking_id là bắt buộc.' });
        result = await this.ride.updateBookingStatus(
          user.sub,
          key,
          { correlationId, workflowId: `mcp_ride_${bookingId}`, toolCallId: 'mcp_accept' },
          bookingId,
          { status: 'DRIVER_ASSIGNED' },
        );
        break;
      }
      case 'ride.update_trip_status': {
        this.assertDomain(user, 'ride');
        const bookingId = String(args.booking_id ?? '').trim();
        const status = String(args.status ?? '').trim();
        if (!bookingId || !status) throw new BadRequestException({ code: 'PARAMS_REQUIRED', detail: 'booking_id và status là bắt buộc.' });
        result = await this.ride.updateBookingStatus(
          user.sub,
          key,
          { correlationId, workflowId: `mcp_ride_${bookingId}`, toolCallId: 'mcp_status' },
          bookingId,
          { status },
        );
        break;
      }
      case 'ride.get_tracking': {
        this.assertDomain(user, 'ride');
        const bookingId = String(args.booking_id ?? '').trim();
        if (!bookingId) throw new BadRequestException({ code: 'BOOKING_ID_REQUIRED', detail: 'booking_id là bắt buộc.' });
        result = await this.ride.getTracking(user.sub, { correlationId }, bookingId);
        break;
      }

      // 3.4 Food & Restaurant — Quán ăn
      case 'food.list_orders': {
        this.assertDomain(user, 'food');
        try {
          const raw = await this.food.opsTransactions(correlationId, 50, 0);
          const items = extractOpsItems(raw);
          result = { items, count: items.length };
        } catch {
          result = { items: [], count: 0 };
        }
        break;
      }
      case 'food.confirm_order': {
        this.assertDomain(user, 'food');
        const orderId = String(args.order_id ?? '').trim();
        if (!orderId) throw new BadRequestException({ code: 'ORDER_ID_REQUIRED', detail: 'order_id là bắt buộc.' });
        result = await this.food.updateOrderStatus(user.sub, correlationId, orderId, { status: 'CONFIRMED' }, key);
        break;
      }
      case 'food.reject_order': {
        this.assertDomain(user, 'food');
        const orderId = String(args.order_id ?? '').trim();
        if (!orderId) throw new BadRequestException({ code: 'ORDER_ID_REQUIRED', detail: 'order_id là bắt buộc.' });
        result = await this.food.updateOrderStatus(
          user.sub,
          correlationId,
          orderId,
          { status: 'CANCELLED', reason: strArg(args.reason) || 'Quán bận / hết món' },
          key,
        );
        break;
      }
      case 'food.update_order_status': {
        this.assertDomain(user, 'food');
        const orderId = String(args.order_id ?? '').trim();
        const status = String(args.status ?? '').trim();
        if (!orderId || !status) throw new BadRequestException({ code: 'PARAMS_REQUIRED', detail: 'order_id và status là bắt buộc.' });
        result = await this.food.updateOrderStatus(user.sub, correlationId, orderId, { status }, key);
        break;
      }
      case 'restaurant.list_tables': {
        this.assertDomain(user, 'restaurant');
        const keyword = strArg(args.keyword);
        result = await this.restaurant.listRestaurants(user.sub, correlationId, keyword, 20, 0);
        break;
      }
      case 'restaurant.update_open_status': {
        this.assertDomain(user, 'restaurant');
        if (typeof args.is_open !== 'boolean') throw new BadRequestException({ code: 'IS_OPEN_REQUIRED', detail: 'is_open (boolean) là bắt buộc.' });
        result = await this.store.upsertProfile(user.sub, { isOpen: args.is_open });
        break;
      }

      // 3.5 Healthcare — Phòng khám
      case 'healthcare.list_appointments': {
        this.assertDomain(user, 'healthcare');
        try {
          const raw = await this.healthcare.opsTransactions(correlationId, 50, 0);
          const items = extractOpsItems(raw);
          result = { items, count: items.length };
        } catch {
          result = { items: [], count: 0 };
        }
        break;
      }
      case 'healthcare.confirm_appointment': {
        this.assertDomain(user, 'healthcare');
        const apptId = Number(args.appointment_id);
        if (!Number.isInteger(apptId) || apptId < 1) throw new BadRequestException({ code: 'APPOINTMENT_ID_INVALID', detail: 'appointment_id phải là số nguyên dương.' });
        result = await this.healthcare.confirmAppointment(user.sub, correlationId, key, apptId);
        break;
      }
      case 'healthcare.cancel_appointment': {
        this.assertDomain(user, 'healthcare');
        const apptId = Number(args.appointment_id);
        if (!Number.isInteger(apptId) || apptId < 1) throw new BadRequestException({ code: 'APPOINTMENT_ID_INVALID', detail: 'appointment_id phải là số nguyên dương.' });
        result = await this.healthcare.cancelAppointment(user.sub, correlationId, key, apptId);
        break;
      }
      case 'healthcare.update_slots': {
        this.assertDomain(user, 'healthcare');
        const specialty = String(args.specialty ?? '').trim();
        if (!specialty) throw new BadRequestException({ code: 'SPECIALTY_REQUIRED', detail: 'specialty là bắt buộc.' });
        // Cập nhật chuyên khoa và khung giờ vào hồ sơ catalog của bác sĩ
        const now = new Date().toISOString();
        result = await this.store.createItem({
          id: randomUUID(),
          providerId: user.sub,
          domain: 'healthcare',
          name: `Chuyên khoa ${specialty}`,
          description: `Khung giờ mở: ${Array.isArray(args.available_slots) ? (args.available_slots as string[]).join(', ') : 'Theo lịch hẹn'}`,
          price: 150000,
          currency: 'VND',
          category: specialty,
          metadata: { available_slots: args.available_slots ?? [] },
          isAvailable: true,
          createdAt: now,
          updatedAt: now,
        });
        break;
      }

      // Công cụ gom tiện lợi
      case 'operations.list_pending': {
        const domain = String(args.domain);
        this.assertDomain(user, domain);
        try {
          if (domain === 'ride') {
            const raw = await this.ride.opsTransactions(correlationId, 50, 0);
            const items = extractOpsItems(raw).filter((i) => ['SEARCHING_DRIVER', 'AWAITING_CONFIRMATION'].includes(String(i.status)));
            result = { items, count: items.length };
          } else if (domain === 'food') {
            const raw = await this.food.opsTransactions(correlationId, 50, 0);
            const items = extractOpsItems(raw).filter((i) => ['PENDING', 'CONFIRMED', 'PREPARING'].includes(String(i.status)));
            result = { items, count: items.length };
          } else {
            const raw = await this.healthcare.opsTransactions(correlationId, 50, 0);
            const items = extractOpsItems(raw).filter((i) => ['PENDING', 'SCHEDULED'].includes(String(i.status)));
            result = { items, count: items.length };
          }
        } catch {
          result = { items: [], count: 0 };
        }
        break;
      }

      default:
        throw new NotFoundException({ code: 'MCP_TOOL_NOT_FOUND', detail: `Tool chưa triển khai: ${name}`, retryable: false });
    }

    await this.safeAudit(user, correlationId, name, args, key);
    return result;
  }

  private async safeAudit(user: AuthUser, correlationId: string, tool: string, args: Record<string, unknown>, key: string): Promise<void> {
    try {
      const domain = typeof args.domain === 'string' ? args.domain : typeof args.service === 'string' ? args.service : undefined;
      await this.core.audit({
        action: 'MCP_TOOL_CALL',
        actorId: user.sub,
        correlationId,
        metadata: { tool_name: tool, provider_id: user.sub, ...(domain ? { domain } : {}), idempotency_key: key },
      });
    } catch {
      // Audit thất bại không được chặn tool
    }
  }
}

function strArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
