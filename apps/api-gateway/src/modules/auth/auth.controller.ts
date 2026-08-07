import { Body, Controller, Get, Post, Req, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsString, MinLength } from 'class-validator';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { DemoAuthGuard } from './auth.guard';
import { issueDemoToken } from './auth.token';
import { AuthUser } from './auth.types';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  @Post('login')
  login(@Body() body: LoginDto, @Req() request: CorrelatedRequest): object {
    if (this.config.get<string>('DEMO_AUTH_ENABLED') !== 'true') throw new ServiceUnavailableException({ code: 'DEMO_AUTH_DISABLED', detail: 'Demo authentication is disabled in this environment.' });
    const email = this.config.getOrThrow<string>('DEMO_AUTH_EMAIL');
    const password = this.config.getOrThrow<string>('DEMO_AUTH_PASSWORD');
    if (body.email !== email || body.password !== password) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', detail: 'Email hoặc mật khẩu không đúng.' });
    const user: AuthUser = { sub: this.config.getOrThrow<string>('DEMO_AUTH_USER_ID'), email, role: 'customer' };
    return { data: { access_token: issueDemoToken(user, this.config.getOrThrow<string>('JWT_SECRET')), token_type: 'bearer', expires_in: 3600, user }, meta: { request_id: request.correlationId } };
  }

  @Get('me')
  @UseGuards(DemoAuthGuard)
  me(@Req() request: CorrelatedRequest & { user?: AuthUser }): object {
    return { data: request.user, meta: { request_id: request.correlationId } };
  }
}
