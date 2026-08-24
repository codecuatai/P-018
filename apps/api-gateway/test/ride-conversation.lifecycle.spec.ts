import { RideConversationService } from '../src/modules/conversation/ride-conversation.service';

function quote(id: string, dropoff: string) {
  return {
    id,
    pickup_address: 'VinUniversity, Hà Nội',
    dropoff_address: dropoff,
    vehicle_type: 'CAR_4' as const,
    distance_km: 15,
    duration_minutes: 15,
    amount: id === 'quote_1' ? 180000 : 190000,
    currency: 'VND',
    tariff_version: 'SIM_2026_08_V1',
    quote_version: `SIM_2026_08_V1:${id}`,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    pickup_latitude: 20.9914,
    pickup_longitude: 105.945975,
    dropoff_latitude: dropoff.includes('UET') ? 21.028333 : 21.02977,
    dropoff_longitude: dropoff.includes('UET') ? 105.854041 : 105.854434,
    route_provider: 'geoapify',
    route_distance_meters: id === 'quote_1' ? 15369 : 16051,
    route_duration_seconds: id === 'quote_1' ? 893 : 932,
    route_geometry: [
      { latitude: 20.9914, longitude: 105.945975 },
      { latitude: 21.0102, longitude: 105.9001 },
      { latitude: dropoff.includes('UET') ? 21.028333 : 21.02977, longitude: dropoff.includes('UET') ? 105.854041 : 105.854434 },
    ],
    route_snapshot_hash: `route-${id}`,
  };
}

describe('Ride conversation lifecycle and revisions', () => {
  it('invalidates a prior route quote when the destination changes', async () => {
    const firstQuote = quote('quote_1', 'Hồ Hoàn Kiếm / Hồ Gươm, Hà Nội');
    const secondQuote = quote('quote_2', 'Trường Đại học Công nghệ - ĐHQGHN / UET, Hà Nội');
    let turn = 0;
    const agent = {
      interpret: jest.fn(async (
        _message: string,
        workflowId: string,
        _context: unknown,
        _callContext: unknown,
        _actorId: string,
      ) => {
        turn += 1;
        const dropoff = turn === 1 ? firstQuote.dropoff_address : secondQuote.dropoff_address;
        return {
          response: 'Đã đủ thông tin.',
          workflow_id: workflowId,
          intent: 'request_ride_quote',
          missing_fields: [],
          state_patch: {
            active_domain: 'ride' as const,
            slot_updates: [
              { slot: 'pickup_address', value: firstQuote.pickup_address, source: 'user' as const, confidence: 1 },
              { slot: 'dropoff_address', value: dropoff, source: 'user' as const, confidence: 1 },
              { slot: 'vehicle_type', value: 'CAR_4', source: 'user' as const, confidence: 1 },
            ],
            clear_fields: [],
            revision: 1,
            pending_action: 'ride.quote.create',
          },
          tool_request: {
            tool_name: 'ride.quote.create',
            risk_level: 'READ' as const,
            arguments: { pickup_address: firstQuote.pickup_address, dropoff_address: dropoff, vehicle_type: 'CAR_4' },
            workflow_id: workflowId,
          },
        };
      }),
    };
    const ride = {
      createQuote: jest.fn().mockResolvedValueOnce(firstQuote).mockResolvedValueOnce(secondQuote),
    };
    const locations = {
      realMode: true,
      geocode: jest.fn(async (address: string) => ({
        provider: 'geoapify',
        status: 'RESOLVED' as const,
        query: address,
        candidates: [{ address_text: address, latitude: address.includes('UET') ? 21.028333 : address.includes('Gươm') ? 21.02977 : 20.9914, longitude: address.includes('UET') ? 105.854041 : address.includes('Gươm') ? 105.854434 : 105.945975, confidence: 1 }],
      })),
      route: jest.fn(async (origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }) => ({
        provider: 'geoapify' as const,
        status: 'RESOLVED' as const,
        distance_km: 15,
        duration_minutes: 15,
        origin,
        destination,
        route_distance_meters: destination.latitude > 21.029 ? 15369 : 16051,
        route_duration_seconds: destination.latitude > 21.029 ? 893 : 932,
        route_geometry: [origin, { latitude: 21.0102, longitude: 105.9001 }, destination],
        route_polyline: null,
        route_snapshot_hash: 'route-test',
      })),
    };
    const service = new RideConversationService(
      agent as never,
      ride as never,
      { require: jest.fn().mockReturnValue({ toolName: 'ride.quote.create' }) } as never,
      locations as never,
    );

    const first = await service.chat('actor-1', 'Đặt xe từ VinUni đến Hồ Gươm bằng xe 4 chỗ', 'gw_ride_1', 'cor-1');
    const second = await service.chat('actor-1', 'đổi điểm đến qua trường đại học công nghệ UET giúp tôi', 'gw_ride_1', 'cor-2');

    expect(first.quote?.dropoff_address).toContain('Hồ Gươm');
    expect(second.quote).toMatchObject({ id: 'quote_2', dropoff_address: secondQuote.dropoff_address, vehicle_type: 'CAR_4' });
    expect(second.quote?.id).not.toBe(first.quote?.id);
    expect(ride.createQuote).toHaveBeenCalledTimes(2);
    expect(ride.createQuote.mock.calls[0][1]).not.toBe(ride.createQuote.mock.calls[1][1]);
    expect(agent.interpret.mock.calls[0][4]).toBe('actor-1');
  });

  it('keeps the Gateway workflow in tracking after payment while Ride searches', async () => {
    const currentQuote = quote('quote_tracking', 'Hồ Hoàn Kiếm / Hồ Gươm, Hà Nội');
    const prepared = {
      id: 'booking_tracking',
      quote_id: currentQuote.id,
      quote_version: currentQuote.quote_version,
      amount: currentQuote.amount,
      currency: currentQuote.currency,
      status: 'AWAITING_CONFIRMATION' as const,
      resource_version: 1,
      payment_reference: null,
      driver: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const searching = { ...prepared, status: 'SEARCHING_DRIVER' as const, resource_version: 2, payment_reference: 'pay_ride_tracking' };
    const agent = {
      interpret: jest.fn().mockResolvedValue({
        response: 'Đã đủ thông tin.',
        workflow_id: 'gw_ride_tracking',
        intent: 'request_ride_quote',
        missing_fields: [],
        state_patch: {
          active_domain: 'ride',
          slot_updates: [
            { slot: 'pickup_address', value: currentQuote.pickup_address, source: 'user', confidence: 1 },
            { slot: 'dropoff_address', value: currentQuote.dropoff_address, source: 'user', confidence: 1 },
          ],
          clear_fields: [],
          revision: 1,
          pending_action: 'ride.quote.create',
        },
        tool_request: { tool_name: 'ride.quote.create', risk_level: 'READ', arguments: { pickup_address: currentQuote.pickup_address, dropoff_address: currentQuote.dropoff_address, vehicle_type: 'CAR_4' }, workflow_id: 'gw_ride_tracking' },
      }),
    };
    const ride = {
      createQuote: jest.fn().mockResolvedValue(currentQuote),
      prepareBooking: jest.fn().mockResolvedValue(prepared),
      confirmBooking: jest.fn().mockResolvedValue(searching),
    };
    const locations = {
      realMode: true,
      geocode: jest.fn().mockResolvedValue({ provider: 'geoapify', status: 'RESOLVED', query: 'x', candidates: [{ address_text: currentQuote.pickup_address, latitude: currentQuote.pickup_latitude, longitude: currentQuote.pickup_longitude, confidence: 1 }] }),
      route: jest.fn().mockResolvedValue({ provider: 'geoapify', status: 'RESOLVED', distance_km: 15, duration_minutes: 15, origin: { latitude: currentQuote.pickup_latitude, longitude: currentQuote.pickup_longitude }, destination: { latitude: currentQuote.dropoff_latitude, longitude: currentQuote.dropoff_longitude }, route_distance_meters: currentQuote.route_distance_meters, route_duration_seconds: currentQuote.route_duration_seconds, route_geometry: currentQuote.route_geometry, route_polyline: null, route_snapshot_hash: currentQuote.route_snapshot_hash }),
    };
    const service = new RideConversationService(agent as never, ride as never, { require: jest.fn().mockReturnValue({ toolName: 'ride.quote.create' }) } as never, locations as never);

    await service.chat('actor-2', 'Đặt xe từ VinUni đến Hồ Gươm', 'gw_ride_tracking', 'cor-1');
    await service.confirmService('actor-2', 'gw_ride_tracking', 'cor-2');
    const result = await service.confirmPayment('actor-2', 'gw_ride_tracking', 'cor-3');

    expect(result.stage).toBe('TRACKING');
    expect(result.booking?.status).toBe('SEARCHING_DRIVER');
    expect(result.response).toContain('Đang tìm tài xế');
    expect(result.response).not.toMatch(/SEARCHING_DRIVER|authoritative|sandbox|workflow/i);
  });
});
