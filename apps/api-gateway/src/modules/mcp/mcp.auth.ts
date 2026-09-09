import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthService } from '../auth/auth.service';
import { isDemoAuthEnabled } from '../auth/auth.guard';
import { verifySignedDemoToken } from '../auth/auth.token';
import { AuthUser } from '../auth/auth.types';
import { McpApiKeyStore } from './mcp.api-key.store';

type RequestWithUser = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
};

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly apiKeyStore: McpApiKeyStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = firstHeader(request.headers.authorization);

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        detail: 'Yêu cầu Bearer token hoặc MCP API Key để kết nối MCP Server.',
        retryable: false,
      });
    }

    const token = authHeader.slice(7).trim();

    // 1. Check MCP API Key format: xone_mcp_...
    if (token.startsWith('xone_mcp_')) {
      const providerUser = await this.apiKeyStore.findUserByKey(token);
      if (!providerUser) {
        throw new UnauthorizedException({
          code: 'INVALID_MCP_API_KEY',
          detail: 'MCP API Key không hợp lệ hoặc đã bị thu hồi.',
          retryable: false,
        });
      }
      this.assertProviderRole(providerUser);
      request.user = providerUser;
      return true;
    }

    // 2. Fallback to standard JWT Access Token
    const realUser = await this.auth.authenticateAccessToken(token);
    if (realUser) {
      this.assertProviderRole(realUser);
      request.user = realUser;
      return true;
    }

    // 3. Dev/Test Demo Auth Fallback
    if (isDemoAuthEnabled(this.config)) {
      const demoUser = verifySignedDemoToken(token, this.config.getOrThrow<string>('JWT_SECRET'));
      if (demoUser) {
        const user: AuthUser = {
          ...demoUser,
          role: 'provider',
          provider_type: demoUser.provider_type || 'ride_driver',
          tenant_id: demoUser.tenant_id || 'partner-xone-01',
          authentication_kind: 'demo',
        };
        request.user = user;
        return true;
      }
    }

    throw new UnauthorizedException({
      code: 'AUTHENTICATION_FAILED',
      detail: 'Phiên xác thực không hợp lệ hoặc đã hết hạn.',
      retryable: false,
    });
  }

  private assertProviderRole(user: AuthUser): void {
    if (user.role !== 'provider') {
      throw new ForbiddenException({
        code: 'PROVIDER_ACCESS_REQUIRED',
        detail: 'Chỉ tài khoản đối tác (role: provider) mới có quyền truy cập MCP Server này.',
        retryable: false,
      });
    }
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
