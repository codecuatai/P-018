import { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from '../src/modules/admin/admin.guard';

describe('AdminGuard', () => {
  const guard = new AdminGuard();
  const context = (user?: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;

  it('allows an active admin account', () => {
    expect(guard.canActivate(context({ role: 'admin', status: 'active' }))).toBe(true);
  });

  it.each([
    undefined,
    { role: 'user', status: 'active' },
    { role: 'admin', status: 'disabled' },
  ])('rejects %j', (user) => {
    expect(() => guard.canActivate(context(user))).toThrow();
  });
});
