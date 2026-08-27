import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InMemoryCoreRepository } from '../src/modules/core/core.module';
import { ProfilePatchDto, SavedAddressController } from '../src/modules/personal/personal.module';

describe('profile phone validation', () => {
  it('accepts Vietnamese mobile numbers and normalizes presentation separators', async () => {
    const errors = await validate(plainToInstance(ProfilePatchDto, { phone: '091 111-1111' }));

    expect(errors).toHaveLength(0);
    expect(plainToInstance(ProfilePatchDto, { phone: '091 111-1111' }).phone).toBe('0911111111');
  });

  it('rejects invalid phone numbers but allows clearing the optional field', async () => {
    await expect(validate(plainToInstance(ProfilePatchDto, { phone: '0123456789' }))).resolves.not.toHaveLength(0);
    await expect(validate(plainToInstance(ProfilePatchDto, { phone: '' }))).resolves.toHaveLength(0);
  });
});

describe('saved address updates', () => {
  it('accepts provider coordinates with more precision than the storage scale', async () => {
    const store = new InMemoryCoreRepository();
    const controller = new SavedAddressController(store as never, {} as never);

    const response = await controller.create(
      { label: 'Nhà', address_text: 'Địa chỉ Geoapify', latitude: 21.028511234, longitude: 105.804817987, is_default: true },
      { user: { sub: 'actor-address' }, correlationId: 'cor-address-create' } as never,
    ) as { data: Record<string, unknown> };

    expect(response.data).toMatchObject({ latitude: 21.028511, longitude: 105.804818, is_default: true });
  });

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
