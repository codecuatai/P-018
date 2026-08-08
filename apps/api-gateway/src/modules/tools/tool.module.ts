import { Body, Controller, Get, Headers, Injectable, Module, Post, Req, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FoodClient, JsonObject } from '../../clients/service.clients';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { ConfirmationModule } from '../confirmation/confirmation.module';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { CoreModule, CoreStore } from '../core/core.module';
import { AuthUser } from '../auth/auth.types';
import { ToolRegistry } from './tool-registry';

type Permission = 'read' | 'draft_write' | 'preview' | 'confirmation_prepare' | 'transaction';
interface ToolDefinition { name: string; description: string; input_schema: JsonObject; output_schema: JsonObject; permission: Permission; confirmation_required: boolean; version: string }
const objectSchema = (required: string[], properties: JsonObject): JsonObject => ({ type: 'object', additionalProperties: false, required, properties });
const string = { type: 'string' };
const selectedOption = objectSchema(['group_id', 'option_id'], { group_id: string, option_id: string });
const selectedOptions = { type: 'array', items: selectedOption };

const definitions: ToolDefinition[] = [
  { name: 'search_food', description: 'Search food and restaurants.', input_schema: objectSchema([], { keyword: string, district: string, category: string, max_price: { type: 'integer' } }), output_schema: objectSchema([], { items: { type: 'array' } }), permission: 'read', confirmation_required: false, version: '1.0' },
  { name: 'view_menu', description: 'View the authoritative restaurant menu.', input_schema: objectSchema(['restaurant_id'], { restaurant_id: string }), output_schema: objectSchema([], { restaurant: { type: 'object' }, items: { type: 'array' } }), permission: 'read', confirmation_required: false, version: '1.0' },
  { name: 'view_menu_item', description: 'View a menu item and options.', input_schema: objectSchema(['menu_item_id'], { menu_item_id: string }), output_schema: objectSchema([], {}), permission: 'read', confirmation_required: false, version: '1.0' },
  { name: 'list_food_delivery_addresses', description: 'List addresses owned by the current actor, optionally filtered by label.', input_schema: objectSchema([], { label: string }), output_schema: objectSchema([], { addresses: { type: 'array' } }), permission: 'read', confirmation_required: false, version: '1.0' },
  { name: 'get_food_cart', description: 'Get the current user food cart.', input_schema: objectSchema(['cart_id'], { cart_id: string }), output_schema: objectSchema([], {}), permission: 'read', confirmation_required: false, version: '1.0' },
  { name: 'create_cart', description: 'Create a draft cart.', input_schema: objectSchema(['restaurant_id'], { restaurant_id: string }), output_schema: objectSchema([], {}), permission: 'draft_write', confirmation_required: false, version: '1.0' },
  { name: 'add_to_cart', description: 'Add an item; Food recalculates price.', input_schema: objectSchema(['cart_id', 'menu_item_id', 'quantity'], { cart_id: string, menu_item_id: string, quantity: { type: 'integer', minimum: 1, maximum: 50 }, selected_options: selectedOptions, note: { type: 'string', maxLength: 500 } }), output_schema: objectSchema([], {}), permission: 'draft_write', confirmation_required: false, version: '1.0' },
  { name: 'update_food_cart_item', description: 'Update cart item quantity/options.', input_schema: objectSchema(['cart_id', 'cart_item_id', 'quantity'], { cart_id: string, cart_item_id: string, quantity: { type: 'integer', minimum: 1, maximum: 50 }, selected_options: selectedOptions, note: { type: 'string', maxLength: 500 } }), output_schema: objectSchema([], {}), permission: 'draft_write', confirmation_required: false, version: '1.0' },
  { name: 'remove_food_cart_item', description: 'Remove a cart item.', input_schema: objectSchema(['cart_id', 'cart_item_id'], { cart_id: string, cart_item_id: string }), output_schema: objectSchema([], {}), permission: 'draft_write', confirmation_required: false, version: '1.0' },
  { name: 'apply_voucher', description: 'Apply a valid voucher to the cart.', input_schema: objectSchema(['cart_id', 'code'], { cart_id: string, code: string }), output_schema: objectSchema([], {}), permission: 'draft_write', confirmation_required: false, version: '1.0' },
  { name: 'remove_food_voucher', description: 'Remove the cart voucher.', input_schema: objectSchema(['cart_id'], { cart_id: string }), output_schema: objectSchema([], {}), permission: 'draft_write', confirmation_required: false, version: '1.0' },
  { name: 'quote_delivery', description: 'Calculate delivery fee and ETA.', input_schema: objectSchema(['restaurant_id', 'address_id'], { restaurant_id: string, address_id: string }), output_schema: objectSchema([], {}), permission: 'preview', confirmation_required: false, version: '1.0' },
  { name: 'preview_order', description: 'Create an authoritative order preview.', input_schema: objectSchema(['cart_id', 'address_id'], { cart_id: string, address_id: string }), output_schema: objectSchema([], {}), permission: 'preview', confirmation_required: false, version: '1.0' },
  { name: 'get_food_order', description: 'Get an owned food order.', input_schema: objectSchema(['order_id'], { order_id: string }), output_schema: objectSchema([], {}), permission: 'read', confirmation_required: false, version: '1.0' },
  { name: 'track_food_order', description: 'Get owned food order tracking.', input_schema: objectSchema(['order_id'], { order_id: string }), output_schema: objectSchema([], {}), permission: 'read', confirmation_required: false, version: '1.0' },
  { name: 'preview_food_order_cancellation', description: 'Preview cancellation policy and refund.', input_schema: objectSchema(['order_id'], { order_id: string }), output_schema: objectSchema([], {}), permission: 'preview', confirmation_required: false, version: '1.0' },
  { name: 'prepare_food_order_confirmation', description: 'Prepare final order confirmation.', input_schema: objectSchema(['cart_id', 'address_id'], { cart_id: string, address_id: string }), output_schema: objectSchema([], {}), permission: 'confirmation_prepare', confirmation_required: true, version: '1.0' },
  { name: 'prepare_food_order_cancellation_confirmation', description: 'Prepare final cancellation confirmation.', input_schema: objectSchema(['order_id'], { order_id: string }), output_schema: objectSchema([], {}), permission: 'confirmation_prepare', confirmation_required: true, version: '1.0' },
  { name: 'execute_food_order', description: 'Transaction reserved for the public confirmation endpoint.', input_schema: objectSchema([], {}), output_schema: objectSchema([], {}), permission: 'transaction', confirmation_required: true, version: '1.0' },
  { name: 'execute_food_order_cancellation', description: 'Transaction reserved for the public confirmation endpoint.', input_schema: objectSchema([], {}), output_schema: objectSchema([], {}), permission: 'transaction', confirmation_required: true, version: '1.0' },
  { name: 'execute_food_refund', description: 'Privileged refund transaction.', input_schema: objectSchema([], {}), output_schema: objectSchema([], {}), permission: 'transaction', confirmation_required: true, version: '1.0' },
];

function validateValue(schema: JsonObject, value: unknown, path: string): void {
  const type = schema.type;
  const valid = type === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value) : type === 'array' ? Array.isArray(value) : type === 'string' ? typeof value === 'string' : type === 'integer' ? Number.isInteger(value) : type === 'number' ? typeof value === 'number' : type === 'boolean' ? typeof value === 'boolean' : true;
  if (!valid) throw new UnprocessableEntityException({ code: 'INVALID_TOOL_ARGUMENTS', detail: `Invalid tool argument: ${path}.` });
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new UnprocessableEntityException({ code: 'INVALID_TOOL_ARGUMENTS', detail: `Invalid tool argument: ${path}.` });
  if (typeof value === 'string' && typeof schema.maxLength === 'number' && value.length > schema.maxLength) throw new UnprocessableEntityException({ code: 'INVALID_TOOL_ARGUMENTS', detail: `Invalid tool argument: ${path}.` });
  if ((type === 'integer' || type === 'number') && typeof value === 'number' && ((typeof schema.minimum === 'number' && value < schema.minimum) || (typeof schema.maximum === 'number' && value > schema.maximum))) throw new UnprocessableEntityException({ code: 'INVALID_TOOL_ARGUMENTS', detail: `Invalid tool argument: ${path}.` });
  if (type === 'array' && Array.isArray(value) && schema.items) for (const [index, item] of value.entries()) validateValue(schema.items as JsonObject, item, `${path}[${index}]`);
  if (type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const properties = (schema.properties ?? {}) as JsonObject;
    for (const required of (schema.required ?? []) as string[]) if (!(required in value)) throw new UnprocessableEntityException({ code: 'INVALID_TOOL_ARGUMENTS', detail: `Missing tool argument: ${path}.${required}.` });
    for (const key of Object.keys(value)) { if (schema.additionalProperties === false && !properties[key]) throw new UnprocessableEntityException({ code: 'INVALID_TOOL_ARGUMENTS', detail: `Unknown tool argument: ${path}.${key}.` }); if (properties[key]) validateValue(properties[key] as JsonObject, (value as JsonObject)[key], `${path}.${key}`); }
  }
}

function validateArguments(definition: ToolDefinition, args: JsonObject): void {
  validateValue(definition.input_schema, args, 'arguments');
}

@Injectable()
export class ToolService {
  constructor(private readonly food: FoodClient, private readonly confirmations: ConfirmationService, private readonly store: CoreStore) {}
  list(): ToolDefinition[] { return definitions; }
  async execute(name: string, args: JsonObject, actor: AuthUser, correlationId: string, conversationId?: string): Promise<JsonObject> {
    const startedAt = Date.now();
    await this.store.audit({ action: 'tool.execute.started', actorId: actor.sub, correlationId, metadata: { tool_name: name, permission: definitions.find((tool) => tool.name === name)?.permission ?? 'unknown' } });
    try {
      const result = await this.executeUnsafe(name, args, actor, correlationId, conversationId);
      await this.store.audit({ action: 'tool.execute.succeeded', actorId: actor.sub, correlationId, metadata: { tool_name: name, duration_ms: Date.now() - startedAt, resource_ids: this.resourceIds(args) } });
      return result;
    } catch (error: unknown) {
      await this.store.audit({ action: 'tool.execute.failed', actorId: actor.sub, correlationId, metadata: { tool_name: name, duration_ms: Date.now() - startedAt, resource_ids: this.resourceIds(args), error_code: this.errorCode(error) } });
      throw error;
    }
  }

  private resourceIds(args: JsonObject): string[] { return Object.entries(args).filter(([key, value]) => key.endsWith('_id') && typeof value === 'string').map(([, value]) => String(value)); }
  private errorCode(error: unknown): string { const response = error instanceof Error && 'getResponse' in error && typeof (error as { getResponse?: unknown }).getResponse === 'function' ? (error as { getResponse: () => unknown }).getResponse() : undefined; return typeof response === 'object' && response !== null && 'code' in response ? String((response as { code: unknown }).code) : error instanceof Error ? error.name : 'UNKNOWN'; }

  private async executeUnsafe(name: string, args: JsonObject, actor: AuthUser, correlationId: string, conversationId?: string): Promise<JsonObject> {
    const definition = definitions.find((tool) => tool.name === name);
    if (!definition) throw new UnauthorizedException({ code: 'TOOL_NOT_FOUND', detail: 'Tool is not registered.' });
    if (!['read', 'draft_write', 'preview', 'confirmation_prepare'].includes(definition.permission)) throw new UnauthorizedException({ code: 'TOOL_NOT_ALLOWED', detail: 'Agent cannot execute this permission.' });
    validateArguments(definition, args);
    switch (name) {
      case 'search_food': { const params = new URLSearchParams({ keyword: String(args.keyword ?? '') }); if (typeof args.district === 'string') params.set('district', args.district); if (typeof args.category === 'string') params.set('category', args.category); if (typeof args.max_price === 'number') params.set('max_price', String(args.max_price)); return this.food.get(`/api/v1/food/search?${params.toString()}`, correlationId, actor.sub); }
      case 'view_menu': return this.food.get(`/api/v1/restaurants/${String(args.restaurant_id)}/menu`, correlationId);
      case 'view_menu_item': return this.food.get(`/api/v1/menu-items/${String(args.menu_item_id)}`, correlationId);
      case 'list_food_delivery_addresses': return this.food.get(`/api/v1/addresses${typeof args.label === 'string' && args.label ? `?label=${encodeURIComponent(args.label)}` : ''}`, correlationId, actor.sub);
      case 'get_food_cart': return this.food.get(`/api/v1/carts/${String(args.cart_id)}?user_id=${encodeURIComponent(actor.sub)}`, correlationId, actor.sub);
      case 'create_cart': return this.food.post('/api/v1/carts', { user_id: actor.sub, restaurant_id: args.restaurant_id }, correlationId, `cart:${actor.sub}:${String(args.restaurant_id)}:${conversationId ?? correlationId}`, actor.sub);
      case 'add_to_cart': return this.food.post(`/api/v1/carts/${String(args.cart_id)}/items`, args, correlationId, undefined, actor.sub);
      case 'update_food_cart_item': return this.food.patch(`/api/v1/carts/${String(args.cart_id)}/items/${String(args.cart_item_id)}`, args, correlationId, actor.sub);
      case 'remove_food_cart_item': return this.food.delete(`/api/v1/carts/${String(args.cart_id)}/items/${String(args.cart_item_id)}`, correlationId, actor.sub);
      case 'apply_voucher': return this.food.post(`/api/v1/carts/${String(args.cart_id)}/voucher`, { code: args.code }, correlationId, undefined, actor.sub);
      case 'remove_food_voucher': return this.food.delete(`/api/v1/carts/${String(args.cart_id)}/voucher`, correlationId, actor.sub);
      case 'quote_delivery': return this.food.post('/api/v1/delivery/quote', args, correlationId, undefined, actor.sub);
      case 'preview_order': return this.food.post('/api/v1/orders/preview', { ...args, user_id: actor.sub }, correlationId, undefined, actor.sub);
      case 'get_food_order': return this.food.get(`/api/v1/orders/${String(args.order_id)}?user_id=${encodeURIComponent(actor.sub)}`, correlationId, actor.sub);
      case 'track_food_order': return this.food.get(`/api/v1/orders/${String(args.order_id)}/tracking?user_id=${encodeURIComponent(actor.sub)}`, correlationId, actor.sub);
      case 'preview_food_order_cancellation': return this.food.post(`/api/v1/orders/${String(args.order_id)}/cancel-preview?user_id=${encodeURIComponent(actor.sub)}`, {}, correlationId, undefined, actor.sub);
      case 'prepare_food_order_confirmation': return this.confirmations.prepare(actor, { ...args, user_id: actor.sub }, correlationId) as unknown as JsonObject;
      case 'prepare_food_order_cancellation_confirmation': return this.confirmations.prepareCancellation(actor, String(args.order_id), correlationId);
      default: throw new UnauthorizedException({ code: 'TOOL_NOT_ALLOWED', detail: 'Tool is not available.' });
    }
  }
}

function requireInternal(token: string | undefined, actorId: string | undefined, expected: string, bodyActor: string | undefined): void {
  if (!token || token !== expected || !actorId || !bodyActor || actorId !== bodyActor) throw new UnauthorizedException({ code: 'UNAUTHORIZED', detail: 'Internal service authentication and actor assertion are required.' });
}

@Controller('internal/tools')
export class ToolController {
  constructor(private readonly tools: ToolService, private readonly config: ConfigService) {}
  @Get()
  list(@Headers('x-internal-service-token') token: string | undefined, @Req() request: CorrelatedRequest): object { if (!token || token !== this.config.getOrThrow<string>('INTERNAL_SERVICE_TOKEN')) throw new UnauthorizedException({ code: 'UNAUTHORIZED', detail: 'Internal service authentication required.' }); return { data: this.tools.list(), meta: { request_id: request.correlationId } }; }
  @Post('execute')
  execute(@Headers('x-internal-service-token') token: string | undefined, @Headers('x-actor-id') actorId: string | undefined, @Body() body: { name: string; arguments: JsonObject; actor_id?: string; conversation_id?: string }, @Req() request: CorrelatedRequest): Promise<object> { requireInternal(token, actorId, this.config.getOrThrow<string>('INTERNAL_SERVICE_TOKEN'), body.actor_id); return this.tools.execute(body.name, body.arguments, { sub: actorId!, email: 'internal@xone.local', role: 'customer' }, request.correlationId ?? 'cor_unknown', body.conversation_id).then((data) => ({ data, meta: { request_id: request.correlationId } })); }
}

@Module({
  imports: [ConfirmationModule, CoreModule],
  controllers: [ToolController],
  providers: [ToolService, FoodClient, ToolRegistry],
  exports: [ToolService, ToolRegistry],
})
export class ToolModule {}
