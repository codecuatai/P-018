import { InMemoryCoreRepository } from '../src/modules/core/core.module';
import { SavedAddressController } from '../src/modules/personal/personal.module';

describe('saved address updates', () => {
  it('updates a manual address and clears stale location metadata', async () => {
    const store = new InMemoryCoreRepository();
    await store.createSavedAddress({
      id: 'address-home',
      actorId: 'actor-address',
      label: 'Nhà',
      addressText: '12 Đường Cũ',
      city: 'Hà Nội',
      district: 'Đống Đa',
      latitude: 21.02,
      longitude: 105.81,
      provider: 'old-provider',
      source: 'geocoded',
      isDefault: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    const controller = new SavedAddressController(store as never, {} as never);

    const response = await controller.patch(
      'address-home',
      { address_text: '181 Đường Nguyễn Trãi' },
      { user: { sub: 'actor-address' }, correlationId: 'cor-address-update' } as never,
    ) as { data: Record<string, unknown> };

    expect(response.data).toMatchObject({
      id: 'address-home',
      address_text: '181 Đường Nguyễn Trãi',
      source: 'manual',
      is_default: true,
    });
    expect(response.data).not.toHaveProperty('city');
    expect(response.data).not.toHaveProperty('district');
    expect(response.data).not.toHaveProperty('latitude');
    expect(response.data).not.toHaveProperty('longitude');
    expect(response.data).not.toHaveProperty('provider');
  });
});
