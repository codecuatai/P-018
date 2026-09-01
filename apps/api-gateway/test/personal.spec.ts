import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { AuthStore } from '../src/modules/auth/auth.repository';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordResetDelivery } from '../src/modules/auth/password-reset.delivery';
import { CoreStore, InMemoryCoreRepository } from '../src/modules/core/core.module';
import { PersonalProfileController, ProfilePatchDto, SavedAddressController } from '../src/modules/personal/personal.module';

const authConfigValues: Record<string, unknown> = {
  AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
  AUTH_REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
  AUTH_REFRESH_REUSE_GRACE_SECONDS: 10,
  AUTH_RESET_TOKEN_TTL_SECONDS: 1_800,
  AUTH_ISSUER: 'x-one',
  AUTH_AUDIENCE: 'x-one-web',
  AUTH_REFRESH_COOKIE_NAME: 'xone_refresh',
  AUTH_DEV_RESET_TOKEN_CAPTURE: true,
  JWT_SECRET: 'test-jwt-secret-12345',
};

function makeAuthServices(): { auth: AuthService; store: AuthStore } {
  const config = {
    getOrThrow: <T>(key: string): T => authConfigValues[key] as T,
    get: <T>(key: string): T | undefined => authConfigValues[key] as T | undefined,
  } as unknown as ConfigService;
  const store = new AuthStore(config);
  const core = new CoreStore(config);
  return { auth: new AuthService(config, store, core, new PasswordResetDelivery()), store };
}

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

  it('returns and persists the normalized phone value through the profile controller', async () => {
    const { auth, store } = makeAuthServices();
    const issued = await auth.register(
      { fullName: 'Nguyễn An', email: 'phone-persistence@example.test', password: 'local phone passphrase 123!@#' },
      { userAgent: 'jest-browser', ip: '127.0.0.1' },
      'cor-phone-register',
    );
    const controller = new PersonalProfileController(auth);

    const response = await controller.patch(
      { phone: '091 111-1111' },
      { user: issued.user, correlationId: 'cor-phone-update' } as never,
    ) as { data: Record<string, unknown> };

    expect(response.data.phone).toBe('0911111111');
    expect((await store.getUserById(issued.user.sub))?.phone).toBe('0911111111');
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

  it('persists fallback provider metadata and scopes saved addresses to the actor', async () => {
    const store = new InMemoryCoreRepository();
    const controller = new SavedAddressController(store as never, {} as never);
    const address = await controller.create(
      {
        label: 'Cơ quan',
        address_text: '181 Nguyễn Trãi, Thanh Xuân',
        latitude: 20.995,
        longitude: 105.812,
        provider: 'deterministic-fallback',
        source: 'geocoded',
        is_default: false,
      },
      { user: { sub: 'actor-address-a' }, correlationId: 'cor-address-fallback' } as never,
    ) as { data: Record<string, unknown> };

    const own = await controller.list({ user: { sub: 'actor-address-a' }, correlationId: 'cor-address-list-own' } as never) as { data: { items: Record<string, unknown>[] } };
    const foreign = await controller.list({ user: { sub: 'actor-address-b' }, correlationId: 'cor-address-list-foreign' } as never) as { data: { items: Record<string, unknown>[] } };

    expect(address.data).toMatchObject({ provider: 'deterministic-fallback', source: 'geocoded' });
    expect(own.data.items).toHaveLength(1);
    expect(own.data.items[0]).toMatchObject({ provider: 'deterministic-fallback', source: 'geocoded' });
    expect(foreign.data.items).toHaveLength(0);
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
