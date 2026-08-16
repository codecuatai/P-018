import { InMemoryCoreRepository, CoreStore } from '../src/modules/core/core.module';
import {
  MultiServicePlan,
  buildMultiServicePlan,
  rankCandidates,
  recordCompensationResult,
  recordStepResult,
} from '../src/modules/workflow/multi-service-reliability';
import { HealthcareClient, RestaurantClient } from '../src/clients/service.clients';
import { MultiServiceReliabilityService } from '../src/modules/workflow/reliability.module';

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 'restaurant-001',
    authority: 'restaurant-service' as const,
    address: '12 Hàng Bông, Hà Nội',
    latitude: 21.0285,
    longitude: 105.8048,
    ...overrides,
  };
}

describe('multi-service reliability state machine', () => {
  it('passes authoritative restaurant coordinates to Ride and rejects suspicious defaults', () => {
    const plan = buildMultiServicePlan('wf-restaurant', 'actor-1', 'restaurant_ride', source(), '2026-08-12T00:00:00.000Z');
    expect(plan.destination).toEqual({
      resource_id: 'restaurant-001',
      authority: 'restaurant-service',
      address: '12 Hàng Bông, Hà Nội',
      coordinates: { latitude: 21.0285, longitude: 105.8048 },
      coordinate_status: 'validated',
    });

    const suspicious = buildMultiServicePlan('wf-default', 'actor-1', 'restaurant_ride', source({ coordinate_status: 'suspicious_default' }), '2026-08-12T00:00:00.000Z');
    expect(suspicious.destination?.coordinates).toBeUndefined();
    expect(suspicious.destination?.coordinate_status).toBe('suspicious_default');
  });

  it('marks Healthcare success plus Ride failure as PARTIAL_SUCCESS without cancelling Healthcare', () => {
    let plan = buildMultiServicePlan('wf-healthcare', 'actor-1', 'healthcare_ride', source({ id: 'facility-001', authority: 'healthcare-service' }), '2026-08-12T00:00:00.000Z');
    plan = recordStepResult(plan, 'healthcare_appointment', { status: 'SUCCEEDED', idempotency_key: 'health-1', result: { appointment_id: 'apt-1' } }, '2026-08-12T00:00:01.000Z');
    plan = recordStepResult(plan, 'ride_quote', { status: 'FAILED', idempotency_key: 'ride-1', error_code: 'NO_DRIVER' }, '2026-08-12T00:00:02.000Z');
    expect(plan.status).toBe('PARTIAL_SUCCESS');
    expect(plan.steps.find((step) => step.id === 'healthcare_appointment')?.status).toBe('SUCCEEDED');
    expect(plan.steps.find((step) => step.id === 'ride_quote')?.error_code).toBe('NO_DRIVER');
    expect(plan.compensation).toHaveLength(0);
  });

  it('does not execute dependent Ride after Restaurant failure', () => {
    const plan = recordStepResult(
      buildMultiServicePlan('wf-restaurant-fail', 'actor-1', 'restaurant_ride', source(), '2026-08-12T00:00:00.000Z'),
      'restaurant_selection',
      { status: 'FAILED', idempotency_key: 'restaurant-1', error_code: 'RESTAURANT_UNAVAILABLE' },
      '2026-08-12T00:00:01.000Z',
    );
    expect(plan.steps.find((step) => step.id === 'ride_quote')).toMatchObject({ status: 'SKIPPED', skip_reason: 'DEPENDENCY_FAILED' });
    expect(() => recordStepResult(plan, 'ride_quote', { status: 'SUCCEEDED', idempotency_key: 'ride-should-not-run' })).toThrow('WORKFLOW_STEP_NOT_EXECUTABLE');
  });

  it('keeps independent Food and Healthcare work moving after one failure', () => {
    const plan = recordStepResult(
      buildMultiServicePlan('wf-independent', 'actor-1', 'food_healthcare', source({ id: 'facility-001', authority: 'healthcare-service' }), '2026-08-12T00:00:00.000Z'),
      'healthcare_appointment',
      { status: 'FAILED', idempotency_key: 'health-1', error_code: 'SLOT_UNAVAILABLE' },
      '2026-08-12T00:00:01.000Z',
    );
    expect(plan.status).toBe('RUNNING');
    expect(plan.steps.find((step) => step.id === 'food_order')?.status).toBe('PENDING');
  });

  it('replays the same step idempotently and rejects a changed payload', () => {
    const initial = buildMultiServicePlan('wf-idempotency', 'actor-1', 'restaurant_ride', source(), '2026-08-12T00:00:00.000Z');
    const result = { status: 'SUCCEEDED' as const, idempotency_key: 'restaurant-1', payload_hash: 'payload-a', result: { restaurant_id: 'restaurant-001' } };
    const applied = recordStepResult(initial, 'restaurant_selection', result, '2026-08-12T00:00:01.000Z');
    expect(recordStepResult(applied, 'restaurant_selection', result, '2026-08-12T00:00:02.000Z')).toBe(applied);
    expect(() => recordStepResult(applied, 'restaurant_selection', { ...result, payload_hash: 'payload-b' })).toThrow('IDEMPOTENCY_CONFLICT');
  });

  it('keeps Healthcare compensation NONE and requires user confirmation for Food compensation', () => {
    let plan = buildMultiServicePlan('wf-compensation', 'actor-1', 'food_healthcare', source({ id: 'facility-001', authority: 'healthcare-service' }), '2026-08-12T00:00:00.000Z');
    plan = recordStepResult(plan, 'food_order', { status: 'SUCCEEDED', idempotency_key: 'food-1', result: { order_id: 'order-1' } }, '2026-08-12T00:00:01.000Z');
    plan = recordStepResult(plan, 'healthcare_appointment', { status: 'FAILED', idempotency_key: 'health-1', error_code: 'PROVIDER_ERROR' }, '2026-08-12T00:00:02.000Z');
    expect(plan.status).toBe('PARTIAL_SUCCESS');
    expect(plan.compensation).toEqual([{ id: 'compensate:food_order', target_step_id: 'food_order', policy: 'USER_CONFIRM_REQUIRED', status: 'PENDING' }]);
  });

  it('moves an explicitly safe compensation failure to RECOVERY_REQUIRED', () => {
    const plan = buildMultiServicePlan('wf-safe-compensation', 'actor-1', 'food_healthcare', source({ id: 'facility-001', authority: 'healthcare-service' }), '2026-08-12T00:00:00.000Z');
    const withAction: MultiServicePlan = {
      ...plan,
      compensation: [{ id: 'compensate:food_order', target_step_id: 'food_order', policy: 'AUTOMATIC_SAFE_COMPENSATION', status: 'PENDING' }],
    };
    const failed = recordCompensationResult(withAction, 'compensate:food_order', { status: 'FAILED', idempotency_key: 'comp-1', error_code: 'REFUND_PENDING' }, '2026-08-12T00:00:01.000Z');
    expect(failed.status).toBe('RECOVERY_REQUIRED');
  });

  it('ranks candidates by relevance, location, ETA, price, and rating with stable ties', () => {
    const ranked = rankCandidates([
      { id: 'far', relevance: 0.9, latitude: 21.1, longitude: 105.9, eta_minutes: 40, price: 200000, rating: 4.8 },
      { id: 'near', relevance: 0.8, latitude: 21.029, longitude: 105.805, eta_minutes: 15, price: 90000, rating: 4.5 },
      { id: 'missing', relevance: 0.1 },
    ], { latitude: 21.0285, longitude: 105.8048 });
    expect(ranked.map((candidate) => candidate.id)).toEqual(['near', 'far', 'missing']);
    expect(ranked[0].rank_score).toBeGreaterThan(ranked[1].rank_score);
  });

  it('reuses durable Core workflow state after the reliability service is recreated', async () => {
    const repository = new InMemoryCoreRepository();
    const restaurant = {
      getRestaurant: jest.fn().mockResolvedValue({
        id: 'restaurant-001',
        address: 'Authoritative restaurant address',
        latitude: 21.031,
        longitude: 105.811,
        coordinate_status: 'validated',
      }),
    } as unknown as RestaurantClient;
    const healthcare = { getFacility: jest.fn() } as unknown as HealthcareClient;
    const service = new MultiServiceReliabilityService(repository as unknown as CoreStore, restaurant, healthcare);
    const request = { kind: 'restaurant_ride' as const, source: source({ address: 'caller-controlled address', latitude: 0, longitude: 0 }) };
    const created = await service.createPlan('actor-1', 'workflow-1', request, 'cor-1');
    expect(restaurant.getRestaurant).toHaveBeenCalledWith('restaurant-001', 'actor-1', 'cor-1');
    expect(created.destination).toMatchObject({
      address: 'Authoritative restaurant address',
      coordinates: { latitude: 21.031, longitude: 105.811 },
      coordinate_status: 'validated',
    });
    const recreated = new MultiServiceReliabilityService(repository as unknown as CoreStore, restaurant, healthcare);
    expect(await recreated.getPlan('actor-1', created.workflow_id)).toEqual(created);
    expect((await recreated.createPlan('actor-1', 'workflow-1', request, 'cor-2')).workflow_id).toBe(created.workflow_id);
  });
});
