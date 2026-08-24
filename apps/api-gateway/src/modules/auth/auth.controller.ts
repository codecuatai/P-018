import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard, isDemoAuthEnabled } from './auth.guard';
import { assertTrustedAuthOrigin, clearRefreshCookie, refreshTokenFromRequest, setRefreshCookie } from './auth.cookie';
import { AuthService } from './auth.service';
import { issueDemoToken } from './auth.token';
import { AuthUser, IssuedAuthSession } from './auth.types';

class RegisterDto {
  @IsString()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MaxLength(200)
  full_name!: string;

  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])/, { message: 'Mật khẩu phải bao gồm chữ, số và ký tự đặc biệt' })
  password!: string;
}

class GoogleAuthDto {
  @IsString()
  code!: string;

  @IsString()
  @IsOptional()
  redirect_uri?: string;
}

class LoginDto {
  @IsString()
  @MaxLength(320)
  email!: string;

  @IsString()
  password!: string;
}

class ChangePasswordDto {
  @IsString()
  current_password!: string;

  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])/, { message: 'Mật khẩu phải bao gồm chữ, số và ký tự đặc biệt' })
  new_password!: string;
}

class ForgotPasswordDto {
  @IsString()
  @MaxLength(320)
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  @MaxLength(512)
  token!: string;

  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])/, { message: 'Mật khẩu phải bao gồm chữ, số và ký tự đặc biệt' })
  new_password!: string;
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly config: ConfigService) {}

  @Get('google/url')
  googleAuthUrl(@Req() request: CorrelatedRequest): object {
    const url = this.auth.getGoogleAuthUrl();
    return { data: { url }, meta: { request_id: request.correlationId } };
  }

  @Post('google')
  async googleAuth(@Body() body: GoogleAuthDto, @Req() request: CorrelatedRequest, @Res({ passthrough: true }) response: Response): Promise<object> {
    const issued = await this.auth.loginWithGoogle({ code: body.code, redirectUri: body.redirect_uri }, requestMetadata(request), request.correlationId ?? 'cor_unknown');
    setRefreshCookie(response, issued.refreshToken, this.auth.settings, this.config.getOrThrow<string>('APP_ENV'));
    return authResponse(issued, request.correlationId);
  }

  @Post('register')
  async register(@Body() body: RegisterDto, @Req() request: CorrelatedRequest, @Res({ passthrough: true }) response: Response): Promise<object> {
    const issued = await this.auth.register({ email: body.email, fullName: body.full_name, password: body.password }, requestMetadata(request), request.correlationId ?? 'cor_unknown');
    setRefreshCookie(response, issued.refreshToken, this.auth.settings, this.config.getOrThrow<string>('APP_ENV'));
    return authResponse(issued, request.correlationId);
  }

  @Post('login')
  async login(@Body() body: LoginDto, @Req() request: CorrelatedRequest, @Res({ passthrough: true }) response: Response): Promise<object> {
    const demo = this.tryDemoLogin(body);
    if (demo) {
      return { data: { access_token: demo.token, token_type: 'bearer', expires_in: 3_600, user: demo.user }, meta: { request_id: request.correlationId } };
    }
    const issued = await this.auth.login({ email: body.email, password: body.password }, requestMetadata(request), request.correlationId ?? 'cor_unknown');
    setRefreshCookie(response, issued.refreshToken, this.auth.settings, this.config.getOrThrow<string>('APP_ENV'));
    return authResponse(issued, request.correlationId);
  }

  @Post('refresh')
  async refresh(@Req() request: CorrelatedRequest, @Res({ passthrough: true }) response: Response): Promise<object> {
    assertTrustedAuthOrigin(request, this.config);
    const refreshToken = refreshTokenFromRequest(request, this.auth.settings.refreshCookieName);
    if (!refreshToken) throw new UnauthorizedException({ code: 'REFRESH_TOKEN_INVALID', detail: 'Phiên đăng nhập không còn hợp lệ.', retryable: false });
    const issued = await this.auth.refresh(refreshToken, requestMetadata(request), request.correlationId ?? 'cor_unknown');
    setRefreshCookie(response, issued.refreshToken, this.auth.settings, this.config.getOrThrow<string>('APP_ENV'));
    return authResponse(issued, request.correlationId);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: CorrelatedRequest & { user: AuthUser }): object {
    return { data: request.user, meta: { request_id: request.correlationId } };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() request: CorrelatedRequest, @Res({ passthrough: true }) response: Response): Promise<object> {
    assertTrustedAuthOrigin(request, this.config);
    await this.auth.logout(refreshTokenFromRequest(request, this.auth.settings.refreshCookieName), request.correlationId ?? 'cor_unknown');
    clearRefreshCookie(response, this.auth.settings, this.config.getOrThrow<string>('APP_ENV'));
    return { data: { logged_out: true }, meta: { request_id: request.correlationId } };
  }

  @Post('logout-all')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async logoutAll(@Req() request: CorrelatedRequest & { user: AuthUser }, @Res({ passthrough: true }) response: Response): Promise<object> {
    assertTrustedAuthOrigin(request, this.config);
    await this.auth.logoutAll(request.user, request.correlationId ?? 'cor_unknown');
    clearRefreshCookie(response, this.auth.settings, this.config.getOrThrow<string>('APP_ENV'));
    return { data: { logged_out: true }, meta: { request_id: request.correlationId } };
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  async sessions(@Req() request: CorrelatedRequest & { user: AuthUser }): Promise<object> {
    return {
      data: { items: await this.auth.listSessions(request.user, refreshTokenFromRequest(request, this.auth.settings.refreshCookieName)) },
      meta: { request_id: request.correlationId },
    };
  }

  @Delete('sessions/:sessionId')
  @UseGuards(AuthGuard)
  async revokeSession(@Param('sessionId') sessionId: string, @Req() request: CorrelatedRequest & { user: AuthUser }, @Res({ passthrough: true }) response: Response): Promise<object> {
    assertTrustedAuthOrigin(request, this.config);
    const current = refreshTokenFromRequest(request, this.auth.settings.refreshCookieName);
    const revokingCurrentSession = current
      ? (await this.auth.listSessions(request.user, current)).some((session) => session.id === sessionId && session.current)
      : false;
    await this.auth.revokeSession(request.user, sessionId, request.correlationId ?? 'cor_unknown');
    if (revokingCurrentSession) clearRefreshCookie(response, this.auth.settings, this.config.getOrThrow<string>('APP_ENV'));
    return { data: { revoked: true }, meta: { request_id: request.correlationId } };
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  async changePassword(@Body() body: ChangePasswordDto, @Req() request: CorrelatedRequest & { user: AuthUser }, @Res({ passthrough: true }) response: Response): Promise<object> {
    assertTrustedAuthOrigin(request, this.config);
    await this.auth.changePassword(request.user, { currentPassword: body.current_password, newPassword: body.new_password }, request.correlationId ?? 'cor_unknown');
    clearRefreshCookie(response, this.auth.settings, this.config.getOrThrow<string>('APP_ENV'));
    return { data: { password_changed: true, reauthentication_required: true }, meta: { request_id: request.correlationId } };
  }

  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() body: ForgotPasswordDto, @Req() request: CorrelatedRequest): Promise<object> {
    const result = await this.auth.requestPasswordReset(body.email, request.correlationId ?? 'cor_unknown');
    return {
      data: {
        accepted: true,
        delivery_configured: result.deliveryAvailable,
        ...(result.devResetToken ? { dev_reset_token: result.devResetToken } : {}),
      },
      meta: { request_id: request.correlationId },
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: ResetPasswordDto, @Req() request: CorrelatedRequest): Promise<object> {
    await this.auth.resetPassword(body.token, body.new_password, request.correlationId ?? 'cor_unknown');
    return { data: { password_reset: true }, meta: { request_id: request.correlationId } };
  }

  private tryDemoLogin(body: LoginDto): { token: string; user: AuthUser } | undefined {
    if (!isDemoAuthEnabled(this.config)) return undefined;
    const email = this.config.getOrThrow<string>('DEMO_AUTH_EMAIL');
    const password = this.config.getOrThrow<string>('DEMO_AUTH_PASSWORD');
    if (body.email !== email || body.password !== password) return undefined;
    const user: AuthUser = { sub: this.config.getOrThrow<string>('DEMO_AUTH_USER_ID'), email, role: 'customer', authentication_kind: 'demo' };
    return { token: issueDemoToken(user, this.config.getOrThrow<string>('JWT_SECRET')), user };
  }
}

function requestMetadata(request: CorrelatedRequest): { userAgent?: string; ip?: string } {
  const userAgent = request.header('user-agent');
  return { ...(userAgent ? { userAgent } : {}), ...(request.ip ? { ip: request.ip } : {}) };
}

function authResponse(issued: IssuedAuthSession, correlationId: string | undefined): object {
  return {
    data: {
      access_token: issued.accessToken,
      token_type: 'bearer',
      expires_in: issued.expiresIn,
      user: issued.user,
    },
    meta: { request_id: correlationId },
  };
}
