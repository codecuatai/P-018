import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

import { FoodClient, HealthcareClient, JsonObject, RestaurantClient, RideClient } from '../../clients/service.clients';
import { CoreProductOpsStore, FavoriteDomain, FeedbackRecord, NotificationPreferencesRecord, NotificationRecord, ProductOpsDomain, SupportPriority, SupportTicketEventRecord, SupportTicketRecord, SupportTicketStatus } from '../core/product-ops.store';

export type FeedbackDomain = ProductOpsDomain;
export type FeedbackResourceType = 'food_order' | 'ride_booking' | 'restaurant_reservation' | 'healthcare_appointment';
export type LinkedResourceType = FeedbackResourceType;

@Injectable()
export class ProductOpsService {
  constructor(
    private readonly store: CoreProductOpsStore,
    private readonly food: FoodClient,
    private readonly ride: RideClient,
    private readonly restaurant: RestaurantClient,
    private readonly healthcare: HealthcareClient,
  ) {}

  async listNotifications(actorId: string, options: { status?: 'UNREAD' | 'READ'; page?: number; pageSize?: number } = {}): Promise<{ items: NotificationRecord[]; unread_count: number; total: number; page: number; page_size: number; has_more: boolean; partial: boolean; unavailable: string[] }> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const [items, total, unreadCount] = await Promise.all([
      this.store.listNotifications(actorId, { status: options.status, page, pageSize }),
      this.store.countNotifications(actorId, options.status),
      this.store.countUnreadNotifications(actorId),
    ]);
    return { items, unread_count: unreadCount, total, page, page_size: pageSize, has_more: page * pageSize < total, partial: false, unavailable: [] };
  }

  async unreadCount(actorId: string): Promise<{ unread_count: number; partial: boolean; unavailable: string[] }> {
    return { unread_count: await this.store.countUnreadNotifications(actorId), partial: false, unavailable: [] };
  }

  async markNotificationRead(id: string, actorId: string): Promise<NotificationRecord> {
    const value = await this.store.markNotificationRead(id, actorId);
    if (!value) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', detail: 'Không tìm thấy thông báo.', retryable: false });
    return value;
  }

  async markAllNotificationsRead(actorId: string): Promise<{ updated: number }> {
    return { updated: await this.store.markAllNotificationsRead(actorId) };
  }

  async listFavorites(actorId: string): Promise<{ items: Awaited<ReturnType<CoreProductOpsStore['listFavorites']>> }> {
    return { items: await this.store.listFavorites(actorId) };
  }

  async createFavorite(actorId: string, domain: FavoriteDomain, resourceId: string, correlationId: string): Promise<Awaited<ReturnType<CoreProductOpsStore['createFavorite']>>> {
    await this.assertFavoriteResource(domain, resourceId, actorId, correlationId);
    return this.store.createFavorite({ id: randomUUID(), actorId, domain, resourceId, createdAt: new Date().toISOString() });
  }

  async deleteFavorite(id: string, actorId: string): Promise<{ deleted: boolean }> {
    return { deleted: await this.store.deleteFavorite(id, actorId) };
  }

  async listFeedback(actorId: string): Promise<{ items: Awaited<ReturnType<CoreProductOpsStore['listFeedback']>> }> {
    return { items: await this.store.listFeedback(actorId) };
  }

  async createFeedback(actorId: string, correlationId: string, input: { domain: FeedbackDomain; resourceType: FeedbackResourceType; resourceId: string; rating: number; comment?: string }): Promise<FeedbackRecord> {
    const resource = await this.assertLinkedResource(actorId, correlationId, input.resourceType, input.resourceId);
    if (!isCompleted(input.domain, resource)) throw new ConflictException({ code: 'RESOURCE_NOT_COMPLETED', detail: 'Chỉ giao dịch đã hoàn tất mới có thể được đánh giá.', retryable: false });
    const now = new Date().toISOString();
    return this.store.upsertFeedback({ id: randomUUID(), actorId, domain: input.domain, resourceType: input.resourceType, resourceId: input.resourceId, rating: input.rating, ...(input.comment ? { comment: input.comment } : {}), createdAt: now, updatedAt: now });
  }

  async updateFeedback(id: string, actorId: string, patch: { rating?: number; comment?: string }): Promise<FeedbackRecord> {
    const existing = await this.store.getFeedback(id, actorId);
    if (!existing) throw new NotFoundException({ code: 'FEEDBACK_NOT_FOUND', detail: 'Không tìm thấy đánh giá.', retryable: false });
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    if (existing.createdAt < sevenDaysAgo) throw new ConflictException({ code: 'FEEDBACK_EDIT_WINDOW_EXPIRED', detail: 'Chỉ có thể sửa đánh giá trong vòng 7 ngày.', retryable: false });
    const updated = await this.store.updateFeedback(id, actorId, patch, new Date().toISOString());
    if (!updated) throw new NotFoundException({ code: 'FEEDBACK_NOT_FOUND', detail: 'Không tìm thấy đánh giá.', retryable: false });
    return updated;
  }

  async getNotificationPreferences(actorId: string): Promise<NotificationPreferencesRecord> {
    return this.store.getNotificationPreferences(actorId);
  }

  async updateNotificationPreferences(actorId: string, patch: { bookingUpdates?: boolean; promotions?: boolean; system?: boolean; emailEnabled?: boolean }): Promise<NotificationPreferencesRecord> {
    return this.store.updateNotificationPreferences(actorId, patch);
  }

  async listSupportTickets(actorId: string, options: { status?: SupportTicketStatus; page?: number; pageSize?: number } = {}): Promise<Awaited<ReturnType<CoreProductOpsStore['listSupportTickets']>>> {
    return this.store.listSupportTickets(actorId, options);
  }

  async createSupportTicket(actorId: string, correlationId: string, idempotencyKey: string, input: { subject: string; description: string; resourceType?: LinkedResourceType; resourceId?: string; priority?: SupportPriority }): Promise<SupportTicketRecord> {
    if ((input.resourceType && !input.resourceId) || (!input.resourceType && input.resourceId)) throw new UnprocessableEntityException({ code: 'RESOURCE_LINK_INVALID', detail: 'Liên kết giao dịch cần đủ loại và mã tài nguyên.', retryable: false });
    if (input.resourceType && input.resourceId) await this.assertLinkedResource(actorId, correlationId, input.resourceType, input.resourceId);
    const now = new Date().toISOString();
    const ticketId = `ticket-${randomUUID()}`;
    const event: SupportTicketEventRecord = { id: `ticket-event-${randomUUID()}`, ticketId, actorId, eventType: 'CREATED', message: input.description, idempotencyKey, createdAt: now };
    return this.store.createSupportTicket({ id: ticketId, actorId, ...(input.resourceType ? { resourceType: input.resourceType } : {}), ...(input.resourceId ? { resourceId: input.resourceId } : {}), subject: input.subject, description: input.description, status: 'OPEN', priority: input.priority ?? 'NORMAL', idempotencyKey, createdAt: now, updatedAt: now }, event);
  }

  async getSupportTicket(id: string, actorId: string): Promise<SupportTicketRecord> {
    const value = await this.store.getSupportTicket(id, actorId);
    if (!value) throw new NotFoundException({ code: 'SUPPORT_TICKET_NOT_FOUND', detail: 'Không tìm thấy yêu cầu hỗ trợ.', retryable: false });
    return value;
  }

  async addSupportMessage(id: string, actorId: string, idempotencyKey: string, message: string): Promise<SupportTicketRecord> {
    const ticket = await this.getSupportTicket(id, actorId);
    if (ticket.status === 'CLOSED') throw new ConflictException({ code: 'SUPPORT_TICKET_CLOSED', detail: 'Yêu cầu hỗ trợ đã đóng.', retryable: false });
    const requestHash = createHash('sha256').update(JSON.stringify({ message })).digest('hex');
    const event: SupportTicketEventRecord = { id: `ticket-event-${randomUUID()}`, ticketId: ticket.id, actorId, eventType: 'MESSAGE', message, idempotencyKey, requestHash, createdAt: new Date().toISOString() };
    let updated;
    try {
      updated = await this.store.addSupportEvent(event, event.createdAt, undefined, requestHash);
    } catch (error) {
      if (error instanceof Error && error.message === 'IDEMPOTENCY_KEY_REUSED') throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED', detail: 'Idempotency key was reused with a different support message.', retryable: false });
      throw error;
    }
    if (!updated) throw new NotFoundException({ code: 'SUPPORT_TICKET_NOT_FOUND', detail: 'Không tìm thấy yêu cầu hỗ trợ.', retryable: false });
    return updated;
  }

  async prepareFoodReorder(actorId: string, correlationId: string, idempotencyKey: string, orderId: string): Promise<JsonObject> {
    const oldOrder = await this.food.getOrder(actorId, correlationId, orderId);
    const restaurantId = stringAt(oldOrder, ['restaurant_id']) ?? objectString(oldOrder.restaurant, 'id');
    if (!restaurantId) throw new ConflictException({ code: 'REORDER_CONTEXT_UNAVAILABLE', detail: 'Đơn cũ thiếu thông tin nhà hàng để đặt lại.', retryable: false });
    const currentRestaurant = await this.food.get(`/api/v1/restaurants/${encodeURIComponent(restaurantId)}`, correlationId, actorId);
    // Phải lấy trọn thực đơn: `available` bên dưới dùng để quyết định món cũ còn bán
    // hay không. Với mặc định 100 món, mọi món từ thứ 101 trở đi của 52 nhà hàng có
    // thực đơn lớn sẽ bị báo sai là hết hàng khi người dùng đặt lại đơn.
    const currentMenu = await this.food.get(`/api/v1/restaurants/${encodeURIComponent(restaurantId)}/menu?limit=500`, correlationId, actorId);
    const menuItems = arrayAt(currentMenu, 'items');
    const available = new Set(menuItems.map((item) => String(item.id ?? '')));
    const unavailable: JsonObject[] = [];
    const cart = await this.food.createCart(actorId, correlationId, `${idempotencyKey}:cart`, restaurantId);
    for (const [index, item] of arrayAt(oldOrder, 'items').entries()) {
      const menuItemId = String(item.menu_item_id ?? item.id ?? '');
      if (!menuItemId || !available.has(menuItemId)) { unavailable.push(item); continue; }
      try {
        await this.food.addCartItem(actorId, correlationId, String(cart.id), { menu_item_id: menuItemId, quantity: Number(item.quantity ?? 1), ...(Array.isArray(item.selected_options) ? { selected_options: item.selected_options } : {}), ...(item.note ? { note: String(item.note) } : {}) }, `${idempotencyKey}:item:${index}`);
      } catch {
        unavailable.push(item);
      }
    }
    const addressId = stringAt(oldOrder, ['address_id']) ?? objectString(oldOrder.delivery, 'address_id');
    let deliveryQuote: JsonObject | undefined;
    if (addressId) {
      try { deliveryQuote = await this.food.deliveryQuote(actorId, correlationId, { restaurant_id: restaurantId, address_id: addressId }); } catch { deliveryQuote = undefined; }
    }
    return { kind: 'food_reorder', old_order_id: orderId, restaurant: currentRestaurant, menu: currentMenu, cart: await this.food.getCart(actorId, correlationId, String(cart.id)), ...(deliveryQuote ? { delivery_quote: deliveryQuote } : {}), unavailable_items: unavailable, auto_placed: false, requires_fresh_preview: true };
  }

  async prepareRideRebook(actorId: string, correlationId: string, idempotencyKey: string, bookingId: string): Promise<JsonObject> {
    const booking = await this.ride.getBooking(actorId, { correlationId }, bookingId);
    const quote = await this.ride.getQuote(actorId, { correlationId }, booking.quote_id);
    const nextQuote = await this.ride.createQuote(actorId, idempotencyKey, { correlationId, workflowId: `rebook-${idempotencyKey}` }, {
      pickup_address: quote.pickup_address,
      dropoff_address: quote.dropoff_address,
      vehicle_type: quote.vehicle_type,
      passenger_count: quote.passenger_count,
      ...(quote.pickup_latitude !== undefined ? { pickup_latitude: quote.pickup_latitude } : {}),
      ...(quote.pickup_longitude !== undefined ? { pickup_longitude: quote.pickup_longitude } : {}),
      ...(quote.dropoff_latitude !== undefined ? { dropoff_latitude: quote.dropoff_latitude } : {}),
      ...(quote.dropoff_longitude !== undefined ? { dropoff_longitude: quote.dropoff_longitude } : {}),
      ...(quote.route_provider ? { route_provider: quote.route_provider } : {}),
      ...(quote.route_distance_meters !== undefined && quote.route_distance_meters !== null ? { route_distance_meters: quote.route_distance_meters } : {}),
      ...(quote.route_duration_seconds !== undefined && quote.route_duration_seconds !== null ? { route_duration_seconds: quote.route_duration_seconds } : {}),
      ...(quote.route_geometry?.length ? { route_geometry: quote.route_geometry } : {}),
      ...(quote.route_snapshot_hash ? { route_snapshot_hash: quote.route_snapshot_hash } : {}),
      ...(quote.stopovers ? { stopovers: quote.stopovers } : {}),
    });
    return { kind: 'ride_rebook', old_booking_id: bookingId, quote: nextQuote, auto_booked: false };
  }

  async prepareRestaurantRebook(actorId: string, correlationId: string, reservationId: string, input: { startAt?: string; partySize?: number } = {}): Promise<JsonObject> {
    const reservation = await this.restaurant.getReservation(reservationId, actorId, correlationId);
    const restaurantId = stringAt(reservation, ['restaurant_id']) ?? objectString(reservation.restaurant, 'id');
    if (!restaurantId) throw new ConflictException({ code: 'REBOOK_CONTEXT_UNAVAILABLE', detail: 'Đặt bàn cũ thiếu thông tin nhà hàng.', retryable: false });
    const restaurant = await this.restaurant.getRestaurant(restaurantId, actorId, correlationId);
    const partySize = input.partySize ?? numberAt(reservation, ['party_size', 'guests']) ?? 2;
    const startAt = input.startAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const availability = await this.restaurant.checkAvailability(actorId, correlationId, restaurantId, { party_size: partySize, start_at: startAt, duration_minutes: 120 });
    return { kind: 'restaurant_rebook', old_reservation_id: reservationId, restaurant, availability, prefill: { party_size: partySize, start_at: startAt }, auto_reserved: false, requires_fresh_hold: true };
  }

  async prepareHealthcareRebook(actorId: string, correlationId: string, appointmentId: number): Promise<JsonObject> {
    const appointment = await this.healthcare.getAppointment(appointmentId, actorId, correlationId);
    const facilityId = stringAt(appointment, ['facility_source_id', 'facility_id']) ?? objectString(appointment.facility, 'source_id');
    const department = stringAt(appointment, ['department_code', 'department']) ?? objectString(appointment.department, 'code');
    const current: JsonObject = {};
    if (facilityId) { try { current.facility = await this.healthcare.getFacility(facilityId, actorId, correlationId); } catch { current.facility_unavailable = true; } }
    if (department) { try { current.doctors = await this.healthcare.listDoctors(actorId, correlationId, department); } catch { current.doctors_unavailable = true; } }
    return { kind: 'healthcare_rebook', old_appointment_id: appointmentId, appointment, ...current, auto_booked: false, requires_current_slot: true };
  }

  private async assertFavoriteResource(domain: FavoriteDomain, resourceId: string, actorId: string, correlationId: string): Promise<void> {
    if (domain === 'food') await this.food.get(`/api/v1/restaurants/${encodeURIComponent(resourceId)}`, correlationId, actorId);
    else if (domain === 'restaurant') await this.restaurant.getRestaurant(resourceId, actorId, correlationId);
    else await this.healthcare.getFacility(resourceId, actorId, correlationId);
  }

  private async assertLinkedResource(actorId: string, correlationId: string, resourceType: LinkedResourceType, resourceId: string): Promise<JsonObject> {
    if (resourceType === 'food_order') return this.food.getOrder(actorId, correlationId, resourceId);
    if (resourceType === 'ride_booking') return this.ride.getBooking(actorId, { correlationId }, resourceId) as unknown as JsonObject;
    if (resourceType === 'restaurant_reservation') return this.restaurant.getReservation(resourceId, actorId, correlationId);
    const appointmentId = Number(resourceId);
    if (!Number.isInteger(appointmentId) || appointmentId < 1) throw new UnprocessableEntityException({ code: 'RESOURCE_ID_INVALID', detail: 'Mã lịch khám không hợp lệ.', retryable: false });
    return this.healthcare.getAppointment(appointmentId, actorId, correlationId);
  }

}

function isCompleted(domain: ProductOpsDomain, resource: JsonObject): boolean {
  const status = String(resource.status ?? '').toUpperCase();
  if (domain === 'food') return ['DELIVERED', 'COMPLETED', 'FULFILLED'].includes(status);
  if (domain === 'ride') return ['COMPLETED', 'FULFILLED'].includes(status);
  if (domain === 'restaurant') {
    if (['COMPLETED', 'FULFILLED'].includes(status)) return true;
    if (status === 'SEATED') {
      const start = stringAt(resource, ['start_at', 'reservation_time', 'start_time']);
      if (start) {
        const timestamp = Date.parse(start);
        return Number.isFinite(timestamp) && Date.now() >= timestamp;
      }
    }
    return false;
  }
  if (domain === 'healthcare') {
    return ['COMPLETED', 'FULFILLED'].includes(status);
  }
  return false;
}

function arrayAt(value: JsonObject, key: string): JsonObject[] {
  return Array.isArray(value[key]) ? value[key].filter(isObject) : [];
}

function stringAt(value: JsonObject, keys: string[]): string | undefined {
  for (const key of keys) if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  return undefined;
}

function numberAt(value: JsonObject, keys: string[]): number | undefined {
  for (const key of keys) if (typeof value[key] === 'number' && Number.isFinite(value[key])) return value[key];
  return undefined;
}

function objectString(value: unknown, key: string): string | undefined {
  return isObject(value) && typeof value[key] === 'string' && value[key].trim() ? String(value[key]).trim() : undefined;
}

function isObject(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
