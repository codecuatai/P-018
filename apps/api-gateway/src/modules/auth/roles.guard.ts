import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthRole, AuthUser } from './auth.types';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AuthRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    if (!user || user.status === 'disabled') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        detail: 'Tài khoản không có quyền truy cập hoặc đã bị vô hiệu hóa.',
        retryable: false,
      });
    }

    // System administrator has universal access across all endpoints
    if (user.role === 'admin') {
      return true;
    }

    // Match requested role (treating 'customer' and 'user' as synonyms)
    const userRole = user.role === 'customer' ? 'user' : user.role;
    const isAllowed = requiredRoles.some((role) => {
      const targetRole = role === 'customer' ? 'user' : role;
      return targetRole === userRole;
    });

    if (!isAllowed) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        detail: `Yêu cầu một trong các quyền: ${requiredRoles.join(', ')}.`,
        retryable: false,
      });
    }

    return true;
  }
}
