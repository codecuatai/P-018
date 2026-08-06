import { Body, Controller, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
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
    if (body.email !== 'demo@xone.vn' || body.password !== 'Xone@123') throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', detail: 'Email hoặc mật khẩu không đúng.' });
    const user: AuthUser = { sub: 'usr_demo_001', email: body.email, role: 'customer' };
    return { data: { access_token: issueDemoToken(user, this.config.getOrThrow<string>('JWT_SECRET')), token_type: 'bearer', expires_in: 3600, user }, meta: { request_id: request.correlationId } };
  }

  @Get('me')
  @UseGuards(DemoAuthGuard)
  me(@Req() request: CorrelatedRequest & { user?: AuthUser }): object {
    return { data: request.user, meta: { request_id: request.correlationId } };
  }
}
