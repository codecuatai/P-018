import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ManagerOrAdminGuard } from '../src/modules/admin/admin.guard';
import { RolesGuard } from '../src/modules/auth/roles.guard';

describe('RBAC Guards', () => {
  const context = (user?: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }), getHandler: () => ({}), getClass: () => ({}) }) as unknown as ExecutionContext;

  describe('ManagerOrAdminGuard', () => {
    const guard = new ManagerOrAdminGuard();

    it('allows active admin and manager accounts', () => {
      expect(guard.canActivate(context({ role: 'admin', status: 'active' }))).toBe(true);
      expect(guard.canActivate(context({ role: 'manager', status: 'active' }))).toBe(true);
    });

    it.each([
      undefined,
      { role: 'user', status: 'active' },
      { role: 'customer', status: 'active' },
      { role: 'provider', status: 'active' },
      { role: 'admin', status: 'disabled' },
      { role: 'manager', status: 'disabled' },
    ])('rejects %j', (user) => {
      expect(() => guard.canActivate(context(user))).toThrow();
    });
  });

  describe('RolesGuard', () => {
    const makeRolesGuard = (allowedRoles: string[]) => {
      const reflector = {
        getAllAndOverride: () => allowedRoles,
      } as unknown as Reflector;
      return new RolesGuard(reflector);
    };

    it('always permits active admin accounts regardless of required roles', () => {
      const providerGuard = makeRolesGuard(['provider']);
      expect(providerGuard.canActivate(context({ role: 'admin', status: 'active' }))).toBe(true);
    });

    it('allows provider role when provider is required', () => {
      const providerGuard = makeRolesGuard(['provider']);
      expect(providerGuard.canActivate(context({ role: 'provider', status: 'active' }))).toBe(true);
      expect(() => providerGuard.canActivate(context({ role: 'user', status: 'active' }))).toThrow();
      expect(() => providerGuard.canActivate(context({ role: 'manager', status: 'active' }))).toThrow();
    });

    it('allows manager and admin when manager or admin is required', () => {
      const managerGuard = makeRolesGuard(['manager', 'admin']);
      expect(managerGuard.canActivate(context({ role: 'manager', status: 'active' }))).toBe(true);
      expect(managerGuard.canActivate(context({ role: 'admin', status: 'active' }))).toBe(true);
      expect(() => managerGuard.canActivate(context({ role: 'user', status: 'active' }))).toThrow();
    });

    it('treats customer and user as synonyms', () => {
      const userGuard = makeRolesGuard(['user']);
      expect(userGuard.canActivate(context({ role: 'user', status: 'active' }))).toBe(true);
      expect(userGuard.canActivate(context({ role: 'customer', status: 'active' }))).toBe(true);
    });
  });
});
