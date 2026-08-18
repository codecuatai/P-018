import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { FoodClient, HealthcareClient, JsonObject, RestaurantClient, RideClient } from '../../clients/service.clients';
import { CoreProductOpsStore, FavoriteDomain, FeedbackRecord, NotificationRecord, ProductOpsDomain, SupportPriority, SupportTicketEventRecord, SupportTicketRecord, SupportTicketStatus } from '../core/product-ops.store';

export type FeedbackDomain = ProductOpsDomain;
export type FeedbackResourceType = 'food_order' | 'ride_booking' | 'restaurant_reservation' | 'healthcare_appointment';
export type LinkedResourceType = FeedbackResourceType;

export interface SyncNotificationsResult {
  items: NotificationRecord[];
  unavailable: string[];
}

@Injectable()
export class ProductOpsService {
  constructor(
    private readonly store: CoreProductOpsStore,
    private readonly food: FoodClient,
    private readonly ride: RideClient,
    private readonly restaurant: RestaurantClient,
    private readonly healthcare: HealthcareClient,
  ) {}

  async listNotifications(actorId: string, correlationId: string, status?: 'UNREAD' | 'READ'): Promise<{ items: NotificationRecord[]; unread_count: number; partial: boolean; unavailable: string[] }> {
    const sync = await this.syncNotifications(actorId, correlationId);
    return { items: await this.store.listNotifications(actorId, status), unread_count: await this.store.countUnreadNotifications(actorId), partial: sync.unavailable.length > 0, unavailable: sync.unavailable };
  }

  async unreadCount(actorId: string, correlationId: string): Promise<{ unread_count: number; partial: boolean; unavailable: string[] }> {
    const sync = await this.syncNotifications(actorId, correlationId);
    return { unread_count: await this.store.countUnreadNotifications(actorId), partial: sync.unavailable.length > 0, unavailable: sync.unavailable };
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
    const event: SupportTicketEventRecord = { id: `ticket-event-${randomUUID()}`, ticketId: ticket.id, actorId, eventType: 'MESSAGE', message, idempotencyKey, createdAt: new Date().toISOString() };
    const updated = await this.store.addSupportEvent(event, event.createdAt);
    if (!updated) throw new NotFoundException({ code: 'SUPPORT_TICKET_NOT_FOUND', detail: 'Không tìm thấy yêu cầu hỗ trợ.', retryable: false });
    return updated;
  }

  async prepareFoodReorder(actorId: string, correlationId: string, idempotencyKey: string, orderId: string): Promise<JsonObject> {
    const oldOrder = await this.food.getOrder(actorId, correlationId, orderId);
    const restaurantId = stringAt(oldOrder, ['restaurant_id']) ?? objectString(oldOrder.restaurant, 'id');
    if (!restaurantId) throw new ConflictException({ code: 'REORDER_CONTEXT_UNAVAILABLE', detail: 'Đơn cũ thiếu thông tin nhà hàng để đặt lại.', retryable: false });
    const currentRestaurant = await this.food.get(`/api/v1/restaurants/${encodeURIComponent(restaurantId)}`, correlationId, actorId);
    const currentMenu = await this.food.get(`/api/v1/restaurants/${encodeURIComponent(restaurantId)}/menu`, correlationId, actorId);
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

  private async syncNotifications(actorId: string, correlationId: string): Promise<SyncNotificationsResult> {
    const responses = await Promise.allSettled([
      this.food.listOrders(correlationId, actorId),
      this.ride.listBookings(actorId, { correlationId }),
      this.restaurant.listReservations(actorId, correlationId),
      this.healthcare.listAppointments(actorId, correlationId),
    ]);
    const names = ['food', 'ride', 'restaurant', 'healthcare'];
    const unavailable: string[] = [];
    const writes: Array<Promise<NotificationRecord>> = [];
    responses.forEach((result, index) => {
      if (result.status === 'rejected') { unavailable.push(names[index]); return; }
      for (const item of extractItems(result.value)) {
        const resourceId = historyId(item);
        if (!resourceId) continue;
        const status = String(item.status ?? '').toUpperCase();
        const events = notificationEvents(names[index], resourceId, status, item);
        for (const event of events) writes.push(this.store.upsertNotification({ id: `notification-${event.eventKey}`, actorId, ...event, status: 'UNREAD', createdAt: new Date().toISOString() }));
      }
    });
    await Promise.allSettled(writes);
    return { items: await this.store.listNotifications(actorId), unavailable };
  }
}

function extractItems(value: JsonObject): JsonObject[] {
  if (Array.isArray(value.items)) return value.items.filter(isObject);
  if (isObject(value.items) && Array.isArray(value.items.items)) return value.items.items.filter(isObject);
  return [];
}

function historyId(value: JsonObject): string | undefined {
  const id = value.id ?? value.booking_id ?? value.appointment_id ?? value.reservation_id;
  return id === undefined || id === null ? undefined : String(id);
}

function notificationEvents(domain: string, resourceId: string, status: string, resource: JsonObject): Array<Pick<NotificationRecord, 'eventKey' | 'type' | 'title' | 'body' | 'resourceType' | 'resourceId'>> {
  const events: Array<Pick<NotificationRecord, 'eventKey' | 'type' | 'title' | 'body' | 'resourceType' | 'resourceId'>> = [];
  const add = (suffix: string, type: string, title: string, body: string, resourceType: string) => events.push({ eventKey: `${domain}:${resourceId}:${suffix}`, type, title, body, resourceType, resourceId });
  if (domain === 'ride' && status === 'DRIVER_ASSIGNED') add('DRIVER_ASSIGNED', 'RIDE_DRIVER_ASSIGNED', 'Tài xế đã nhận chuyến', 'Tài xế đang chuẩn bị đến điểm đón của bạn.', 'ride_booking');
  if (domain === 'ride' && status === 'DRIVER_ARRIVED') add('DRIVER_ARRIVED', 'RIDE_DRIVER_ARRIVED', 'Tài xế đã đến điểm đón', 'Tài xế đang chờ bạn tại điểm đón.', 'ride_booking');
  if (domain === 'food' && ['RESTAURANT_ACCEPTED', 'ACCEPTED', 'CONFIRMED'].includes(status)) add('ACCEPTED', 'FOOD_ACCEPTED', 'Nhà hàng đã nhận đơn', 'Đơn ăn của bạn đang được chuẩn bị.', 'food_order');
  if (domain === 'food' && ['PREPARING', 'READY_FOR_PICKUP'].includes(status)) add('PREPARING', 'FOOD_PREPARING', 'Đơn ăn đang được chuẩn bị', 'Nhà hàng đang hoàn thiện món cho bạn.', 'food_order');
  if (domain === 'restaurant' && ['CONFIRMED', 'BOOKED', 'RESERVED'].includes(status)) add('CONFIRMED', 'RESTAURANT_CONFIRMED', 'Đặt bàn đã được xác nhận', 'Thông tin đặt bàn của bạn đã được ghi nhận.', 'restaurant_reservation');
  if (domain === 'healthcare' && ['CONFIRMED', 'BOOKED', 'PAYMENT_CONFIRMED'].includes(status)) add('CONFIRMED', 'HEALTHCARE_CONFIRMED', 'Lịch khám đã được xác nhận', 'Bạn có thể xem lại thời gian và cơ sở trong lịch sử.', 'healthcare_appointment');
  if (domain === 'healthcare') {
    const start = stringAt(resource, ['start_at', 'start_time', 'appointment_time']) ?? objectString(resource.slot, 'start_time');
    const timestamp = start ? Date.parse(start) : Number.NaN;
    if (Number.isFinite(timestamp) && timestamp > Date.now() && timestamp <= Date.now() + 48 * 60 * 60 * 1000) add('REMINDER', 'HEALTHCARE_REMINDER', 'Sắp đến lịch khám', 'Lịch khám của bạn sẽ diễn ra trong vòng 48 giờ tới.', 'healthcare_appointment');
  }
  return events;
}

function isCompleted(domain: ProductOpsDomain, resource: JsonObject): boolean {
  const status = String(resource.status ?? '').toUpperCase();
  if (domain === 'food') return ['DELIVERED', 'COMPLETED', 'FULFILLED'].includes(status);
  if (domain === 'ride') return status === 'COMPLETED';
  if (domain === 'restaurant') return ['CONFIRMED', 'COMPLETED', 'SEATED'].includes(status);
  return ['CONFIRMED', 'COMPLETED', 'PAYMENT_CONFIRMED'].includes(status);
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
