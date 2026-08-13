import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { AuthUser } from '../auth/auth.types';

type AdminRequest = { user?: AuthUser };

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (request.user?.role !== 'admin' || request.user.status === 'disabled') {
      throw new ForbiddenException({ code: 'ADMIN_REQUIRED', detail: 'Administrator access is required.', retryable: false });
    }
    return true;
  }
}
