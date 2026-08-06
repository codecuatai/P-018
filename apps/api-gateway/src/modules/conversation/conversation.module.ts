import { Body, Controller, Get, HttpCode, HttpStatus, Module, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AgentClient } from '../../clients/service.clients';

const scryptAsync = promisify(scrypt);

// ─── In-memory user store (replace with DB when available) ────────────────────
interface StoredUser {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string; // format: salt:hash
  role: 'customer' | 'provider' | 'operator' | 'admin';
  profileJson?: string;
}

const users: StoredUser[] = [
  // seed default demo accounts (passwords hashed below via seedHash())
];

async function seedHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 32)) as Buffer;
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  const derived = (await scryptAsync(password, salt, 32)) as Buffer;
  return timingSafeEqual(Buffer.from(hash, 'hex'), derived);
}

// Seed demo users on startup (lazy)
let seeded = false;
async function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  users.push(
    { id: 'usr-admin-001', fullName: 'Admin Assistant-018', email: 'admin@assistant-018.ai', passwordHash: await seedHash('admin123'), role: 'admin' },
    { id: 'usr-op-001', fullName: 'Operator Demo', email: 'operator@assistant-018.ai', passwordHash: await seedHash('operator123'), role: 'operator' },
    { id: 'usr-cust-001', fullName: 'User Demo', email: 'user@assistant-018.ai', passwordHash: await seedHash('user123'), role: 'customer' },
    { id: 'usr-provider-001', fullName: 'Provider Demo', email: 'partner@assistant-018.ai', passwordHash: await seedHash('partner123'), role: 'provider' },
  );
}

// ─── Minimal JWT (HS256) without external dependency ─────────────────────────
function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'x-one-dev-secret-change-in-production';
}

function b64url(buf: Buffer | string): string {
  const str = typeof buf === 'string' ? buf : buf.toString('base64');
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function signJwt(payload: object, expiresInSeconds = 86400): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64'));
  const body = b64url(Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString('base64'));
  const sig = b64url(createHmac('sha256', getJwtSecret()).update(`${header}.${body}`).digest('base64'));
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const [header, body, sig] = token.split('.');
    const expected = b64url(createHmac('sha256', getJwtSecret()).update(`${header}.${body}`).digest('base64'));
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Auth Guard ───────────────────────────────────────────────────────────────
export class JwtGuard {
  canActivate(context: import('@nestjs/common').ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<CorrelatedRequest & { user?: Record<string, unknown> }>();
    const auth = req.headers['authorization'] as string | undefined;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Missing token');
    const payload = verifyJwt(auth.slice(7));
    if (!payload) throw new UnauthorizedException('Invalid or expired token');
    req.user = payload;
    return true;
  }
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────
class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

class RegisterDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(['customer', 'provider'])
  role!: 'customer' | 'provider';
}

// ─── Auth Controller ──────────────────────────────────────────────────────────
@Controller('api/v1/auth')
class AuthController {
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto, @Req() req: CorrelatedRequest) {
    await ensureSeeded();
    const user = users.find(u => u.email.toLowerCase() === body.email.trim().toLowerCase());
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }
    const token = signJwt({ sub: user.id, email: user.email, role: user.role, fullName: user.fullName });
    return {
      data: { token, user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } },
      meta: { request_id: req.correlationId },
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto, @Req() req: CorrelatedRequest) {
    await ensureSeeded();
    if (!['customer', 'provider'].includes(body.role)) {
      throw new UnauthorizedException('Chỉ có thể đăng ký tài khoản Khách hàng hoặc Đối tác.');
    }
    const exists = users.find(u => u.email.toLowerCase() === body.email.trim().toLowerCase());
    if (exists) {
      return { error: { status: 409, title: 'Email đã tồn tại', detail: 'Email này đã được đăng ký.' } };
    }
    const newUser: StoredUser = {
      id: `usr-${Date.now()}`,
      fullName: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
      passwordHash: await seedHash(body.password),
      role: body.role,
    };
    users.push(newUser);
    const token = signJwt({ sub: newUser.id, email: newUser.email, role: newUser.role, fullName: newUser.fullName });
    return {
      data: { token, user: { id: newUser.id, fullName: newUser.fullName, email: newUser.email, role: newUser.role } },
      meta: { request_id: req.correlationId },
    };
  }

  @Get('me')
  @UseGuards(JwtGuard)
  async me(@Req() req: CorrelatedRequest & { user: Record<string, unknown> }) {
    await ensureSeeded();
    const user = users.find(u => u.id === req.user['sub']);
    if (!user) throw new UnauthorizedException('User not found');
    return {
      data: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
      meta: { request_id: req.correlationId },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: CorrelatedRequest) {
    // Stateless JWT: client discards token
    return { data: { success: true }, meta: { request_id: req.correlationId } };
  }
}

// ─── Profile Controller ───────────────────────────────────────────────────────
@Controller('api/v1/profile')
class ProfileController {
  @Get()
  @UseGuards(JwtGuard)
  async getProfile(@Req() req: CorrelatedRequest & { user: Record<string, unknown> }) {
    await ensureSeeded();
    const user = users.find(u => u.id === req.user['sub']);
    if (!user) throw new UnauthorizedException('User not found');
    const profile = user.profileJson ? JSON.parse(user.profileJson) : null;
    return { data: profile, meta: { request_id: req.correlationId } };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  async updateProfile(@Body() body: Record<string, unknown>, @Req() req: CorrelatedRequest & { user: Record<string, unknown> }) {
    await ensureSeeded();
    const user = users.find(u => u.id === req.user['sub']);
    if (!user) throw new UnauthorizedException('User not found');
    user.profileJson = JSON.stringify(body);
    return { data: { success: true }, meta: { request_id: req.correlationId } };
  }
}

// ─── Chat Controller (proxy to Agent Service) ─────────────────────────────────
@Controller('api/v1/chat')
class ChatController {
  constructor(private readonly agentClient: AgentClient) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  async chat(@Body() body: { message: string }, @Req() req: CorrelatedRequest) {
    const res = await fetch(`${this.agentClient.baseUrl}/api/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': String(req.correlationId ?? ''),
        'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ''}`,
      } as Record<string, string>,
      body: JSON.stringify({ message: body.message }),
    });
    if (!res.ok) {
      throw new Error(`Agent service error: ${res.status}`);
    }
    const data = await res.json() as { response: string };
    return { data: { response: data.response }, meta: { request_id: req.correlationId } };
  }
}

// ─── Bookings Controller ──────────────────────────────────────────────────────
interface Booking {
  bookingId: string;
  type: string;
  origin: string;
  destination: string;
  date: string;
  time: string;
  price: number;
  seats: string | number;
  provider: string;
  status: 'confirmed' | 'completed' | 'cancelled';
  paymentStatus: 'paid' | 'refunded';
  bookedAt: string;
  rating?: number;
  customerName?: string;
  customerPhone?: string;
}

const bookings: Booking[] = [
  {
    bookingId: 'BKG-98421',
    type: 'flight',
    origin: 'Hà Nội (HAN)',
    destination: 'Đà Nẵng (DAD)',
    date: '2026-08-15',
    time: '08:15',
    price: 1450000,
    seats: '12C',
    provider: 'Vietnam Airlines',
    status: 'confirmed',
    paymentStatus: 'paid',
    bookedAt: '2026-08-05T10:30:00Z',
    customerName: 'Nguyễn Minh Anh',
    customerPhone: '0901234567',
  },
  {
    bookingId: 'BKG-12053',
    type: 'car',
    origin: 'Sân bay Đà Nẵng',
    destination: 'Khách sạn Minh An Riverside',
    date: '2026-08-08',
    time: '14:30',
    price: 180000,
    seats: '4 chỗ',
    provider: 'NaviCar',
    status: 'completed',
    paymentStatus: 'paid',
    bookedAt: '2026-08-04T12:00:00Z',
    customerName: 'Nguyễn Minh Anh',
    customerPhone: '0901234567',
  }
];

@Controller('api/v1/bookings')
class BookingsController {
  @Get()
  @UseGuards(JwtGuard)
  getBookings(@Req() req: CorrelatedRequest) {
    return { data: bookings, meta: { request_id: req.correlationId } };
  }

  @Post()
  @UseGuards(JwtGuard)
  createBooking(@Body() body: Omit<Booking, 'bookingId' | 'status' | 'paymentStatus' | 'bookedAt'>, @Req() req: CorrelatedRequest) {
    const newBooking: Booking = {
      ...body,
      bookingId: `BKG-${Math.floor(10000 + Math.random() * 90000)}`,
      status: 'confirmed',
      paymentStatus: 'paid',
      bookedAt: new Date().toISOString(),
    };
    bookings.unshift(newBooking);
    return { data: newBooking, meta: { request_id: req.correlationId } };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  cancelBooking(@Req() req: CorrelatedRequest & { params: { id: string } }) {
    const booking = bookings.find(b => b.bookingId === req.params.id);
    if (!booking) throw new UnauthorizedException('Booking not found');
    booking.status = 'cancelled';
    booking.paymentStatus = 'refunded';
    return { data: { success: true }, meta: { request_id: req.correlationId } };
  }

  @Post(':id/rate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  rateBooking(@Body() body: { rating: number }, @Req() req: CorrelatedRequest & { params: { id: string } }) {
    const booking = bookings.find(b => b.bookingId === req.params.id);
    if (!booking) throw new UnauthorizedException('Booking not found');
    booking.rating = body.rating;
    return { data: { success: true }, meta: { request_id: req.correlationId } };
  }
}

// ─── Module ───────────────────────────────────────────────────────────────────
@Module({
  controllers: [AuthController, ProfileController, ChatController, BookingsController],
  providers: [AgentClient],
})
export class ConversationModule {}

