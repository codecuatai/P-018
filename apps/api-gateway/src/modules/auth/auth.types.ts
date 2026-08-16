export type AuthRole = 'customer' | 'admin';
export type AuthUserStatus = 'active' | 'disabled';

/** Safe authenticated identity passed to Gateway controllers and typed clients. */
export interface AuthUser {
  id?: string;
  sub: string;
  email: string;
  role: AuthRole | string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  language?: string;
  timezone?: string;
  onboarding_completed_at?: string;
  status?: AuthUserStatus | string;
  session_id?: string;
  authentication_kind?: 'real' | 'demo';
}

export interface AuthAccount {
  id: string;
  email: string;
  emailNormalized: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  language?: string;
  timezone?: string;
  onboardingCompletedAt?: string;
  role: AuthRole;
  status: AuthUserStatus;
  passwordHash: string;
  passwordChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  familyId: string;
  refreshTokenHash: string;
  expiresAt: string;
  revokedAt?: string;
  revokedReason?: string;
  consumedAt?: string;
  replacedBySessionId?: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent?: string;
  ipHash?: string;
}

export interface AuthSessionSummary {
  id: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current: boolean;
  user_agent?: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: AuthRole;
  status: AuthUserStatus;
  onboarding_completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AccessTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  sid: string;
  role: AuthRole;
  iat: number;
  exp: number;
  jti: string;
  typ: 'access';
}

export interface IssuedAuthSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  session: AuthSession;
  user: AuthUser;
}
