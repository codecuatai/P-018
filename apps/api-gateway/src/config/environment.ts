export type GatewayEnvironment = 'development' | 'test' | 'production';

export type GatewayRateLimitProfile = {
  name: string;
  method: string;
  path: string | RegExp;
  maxRequests: number;
  windowMs: number;
};

export type GatewaySecurityConfig = {
  appEnv: GatewayEnvironment;
  corsOrigins: string[];
  bodyLimitBytes: number;
  rateLimitProfiles: GatewayRateLimitProfile[];
};

const DEFAULT_BODY_LIMIT_BYTES = 262_144;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_AUTH_LOGIN_RATE_LIMIT = 5;
const DEFAULT_ASSISTANT_CHAT_RATE_LIMIT = 30;
const DEFAULT_ASSISTANT_ACTION_RATE_LIMIT = 20;
const DEFAULT_FUTURE_AUTH_RATE_LIMIT = 5;
const DEFAULT_AUTH_ACCESS_TOKEN_TTL_SECONDS = 900;
const DEFAULT_AUTH_REFRESH_TOKEN_TTL_SECONDS = 2_592_000;
const DEFAULT_AUTH_RESET_TOKEN_TTL_SECONDS = 1_800;

export function parseConfiguredOrigins(value: unknown): string[] {
  if (typeof value !== 'string') throw new Error('GATEWAY_CORS_ORIGINS is required.');
  const rawOrigins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (rawOrigins.length === 0) throw new Error('GATEWAY_CORS_ORIGINS must contain at least one origin.');
  if (rawOrigins.includes('*')) throw new Error('GATEWAY_CORS_ORIGINS must not contain a wildcard origin.');

  return rawOrigins.map((origin) => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`GATEWAY_CORS_ORIGINS contains an invalid origin: ${origin}.`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.origin === 'null') {
      throw new Error(`GATEWAY_CORS_ORIGINS contains an invalid origin: ${origin}.`);
    }
    return parsed.origin;
  });
}

function positiveInteger(
  config: Record<string, unknown>,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const value = config[name] ?? fallback;
  if (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return Number(value);
}

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  if (!['development', 'test', 'production'].includes(String(config.APP_ENV))) throw new Error('APP_ENV must be development, test, or production.');
  const requiredStrings = [
    'DATABASE_URL',
    'AGENT_SERVICE_URL',
    'RIDE_SERVICE_URL',
    'RESTAURANT_SERVICE_URL',
    'HEALTHCARE_SERVICE_URL',
    'FOOD_SERVICE_URL',
    'INTERNAL_SERVICE_TOKEN',
    'JWT_SECRET',
    'DEMO_AUTH_ENABLED',
    'GATEWAY_CORS_ORIGINS',
  ];
  for (const name of requiredStrings) {
    if (typeof config[name] !== 'string' || config[name].trim() === '') {
      throw new Error(`${name} is required.`);
    }
  }

  if (typeof config.PORT !== 'string' && typeof config.PORT !== 'number') {
    throw new Error('PORT is required.');
  }
  const port = Number(config.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  for (const name of requiredStrings.slice(0, 6)) {
    try {
      new URL(String(config[name]));
    } catch {
      throw new Error(`${name} must be a valid URL.`);
    }
  }
  if (String(config.JWT_SECRET).length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters.');
  }
  const corsOrigins = parseConfiguredOrigins(config.GATEWAY_CORS_ORIGINS);
  if (String(config.APP_ENV) === 'production' && corsOrigins.some((origin) => {
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  })) {
    throw new Error('GATEWAY_CORS_ORIGINS must not contain localhost origins in production.');
  }
  const demoAuthEnabled = String(config.DEMO_AUTH_ENABLED).toLowerCase();
  if (!['true', 'false'].includes(demoAuthEnabled)) throw new Error('DEMO_AUTH_ENABLED must be true or false.');
  if (String(config.APP_ENV) === 'production' && demoAuthEnabled === 'true') throw new Error('Demo auth must be disabled in production.');
  if (demoAuthEnabled === 'true') {
    for (const name of ['DEMO_AUTH_EMAIL', 'DEMO_AUTH_PASSWORD', 'DEMO_AUTH_USER_ID']) {
      if (typeof config[name] !== 'string' || String(config[name]).trim() === '') throw new Error(`${name} is required when demo auth is enabled.`);
    }
  }
  for (const name of ['UPSTREAM_TIMEOUT_MS', 'CONFIRMATION_TTL_SECONDS', 'GATEWAY_WORKFLOW_POLL_INTERVAL_MS']) {
    if (config[name] !== undefined && (!Number.isInteger(Number(config[name])) || Number(config[name]) < 1)) throw new Error(`${name} must be a positive integer.`);
  }
  const localDeterministicLocationFallback = String(config.LOCAL_DETERMINISTIC_LOCATION_FALLBACK ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(localDeterministicLocationFallback)) throw new Error('LOCAL_DETERMINISTIC_LOCATION_FALLBACK must be true or false.');
  if (String(config.APP_ENV) === 'production' && localDeterministicLocationFallback === 'true') {
    throw new Error('LOCAL_DETERMINISTIC_LOCATION_FALLBACK must be disabled in production.');
  }
  const geoapifyRealMode = String(config.GEOAPIFY_REAL_MODE ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(geoapifyRealMode)) throw new Error('GEOAPIFY_REAL_MODE must be true or false.');
  if (geoapifyRealMode === 'true') {
    const serverKey = normalizeConfiguredSecret(config.GEOAPIFY_SERVER_API_KEY);
    if (!serverKey || serverKey.includes('__PASTE_') || serverKey.toLowerCase().includes('replace_me')) throw new Error('GEOAPIFY_SERVER_API_KEY is required when GEOAPIFY_REAL_MODE is enabled.');
    const baseUrl = String(config.GEOAPIFY_API_BASE_URL ?? 'https://api.geoapify.com/v1').trim();
    try {
      const parsed = new URL(baseUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid');
    } catch {
      throw new Error('GEOAPIFY_API_BASE_URL must be a valid HTTP(S) URL.');
    }
  }
  for (const name of ['AUTH_ISSUER', 'AUTH_AUDIENCE', 'AUTH_REFRESH_COOKIE_NAME']) {
    if (typeof config[name] !== 'string' || String(config[name]).trim() === '') throw new Error(`${name} is required.`);
  }
  for (const name of ['LOCATION_PROVIDER_URL', 'GEOCODING_PROVIDER_URL', 'ROUTING_PROVIDER_URL']) {
    if (config[name] !== undefined && String(config[name]).trim() !== '') {
      try {
        const url = new URL(String(config[name]).trim());
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid');
      } catch {
        throw new Error(`${name} must be a valid HTTP(S) URL when configured.`);
      }
    }
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(config.AUTH_REFRESH_COOKIE_NAME))) {
    throw new Error('AUTH_REFRESH_COOKIE_NAME must use only letters, numbers, underscores, or hyphens.');
  }
  const authDevResetTokenCapture = String(config.AUTH_DEV_RESET_TOKEN_CAPTURE ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(authDevResetTokenCapture)) throw new Error('AUTH_DEV_RESET_TOKEN_CAPTURE must be true or false.');
  if (String(config.APP_ENV) === 'production' && authDevResetTokenCapture === 'true') {
    throw new Error('AUTH_DEV_RESET_TOKEN_CAPTURE must be disabled in production.');
  }
  const configuredPatientId = config.HEALTHCARE_DEFAULT_PATIENT_ID;
  if (String(config.APP_ENV) !== 'production' && (configuredPatientId === undefined || String(configuredPatientId).trim() === '')) {
    throw new Error('HEALTHCARE_DEFAULT_PATIENT_ID is required outside production.');
  }
  if (configuredPatientId !== undefined && String(configuredPatientId).trim() !== '' && (!Number.isInteger(Number(configuredPatientId)) || Number(configuredPatientId) < 1)) {
    throw new Error('HEALTHCARE_DEFAULT_PATIENT_ID must be a positive integer.');
  }
  const bodyLimitBytes = positiveInteger(config, 'GATEWAY_BODY_LIMIT_BYTES', DEFAULT_BODY_LIMIT_BYTES, 10 * 1024 * 1024);
  const rateLimitWindowSeconds = positiveInteger(config, 'GATEWAY_RATE_LIMIT_WINDOW_SECONDS', DEFAULT_RATE_LIMIT_WINDOW_SECONDS, 3_600);
  const authLoginRateLimit = positiveInteger(config, 'GATEWAY_AUTH_LOGIN_RATE_LIMIT', DEFAULT_AUTH_LOGIN_RATE_LIMIT, 10_000);
  const assistantChatRateLimit = positiveInteger(config, 'GATEWAY_ASSISTANT_CHAT_RATE_LIMIT', DEFAULT_ASSISTANT_CHAT_RATE_LIMIT, 10_000);
  const assistantActionRateLimit = positiveInteger(config, 'GATEWAY_ASSISTANT_ACTION_RATE_LIMIT', DEFAULT_ASSISTANT_ACTION_RATE_LIMIT, 10_000);
  const futureAuthRateLimit = positiveInteger(config, 'GATEWAY_FUTURE_AUTH_RATE_LIMIT', DEFAULT_FUTURE_AUTH_RATE_LIMIT, 10_000);
  const accessTokenTtlSeconds = positiveInteger(config, 'AUTH_ACCESS_TOKEN_TTL_SECONDS', DEFAULT_AUTH_ACCESS_TOKEN_TTL_SECONDS, 3_600);
  const refreshTokenTtlSeconds = positiveInteger(config, 'AUTH_REFRESH_TOKEN_TTL_SECONDS', DEFAULT_AUTH_REFRESH_TOKEN_TTL_SECONDS, 7_776_000);
  const resetTokenTtlSeconds = positiveInteger(config, 'AUTH_RESET_TOKEN_TTL_SECONDS', DEFAULT_AUTH_RESET_TOKEN_TTL_SECONDS, 86_400);
  return {
    ...config,
    PORT: port,
    GATEWAY_CORS_ORIGINS: corsOrigins.join(','),
    GATEWAY_BODY_LIMIT_BYTES: bodyLimitBytes,
    GATEWAY_RATE_LIMIT_WINDOW_SECONDS: rateLimitWindowSeconds,
    GATEWAY_AUTH_LOGIN_RATE_LIMIT: authLoginRateLimit,
    GATEWAY_ASSISTANT_CHAT_RATE_LIMIT: assistantChatRateLimit,
    GATEWAY_ASSISTANT_ACTION_RATE_LIMIT: assistantActionRateLimit,
    GATEWAY_FUTURE_AUTH_RATE_LIMIT: futureAuthRateLimit,
    AUTH_ACCESS_TOKEN_TTL_SECONDS: accessTokenTtlSeconds,
    AUTH_REFRESH_TOKEN_TTL_SECONDS: refreshTokenTtlSeconds,
    AUTH_RESET_TOKEN_TTL_SECONDS: resetTokenTtlSeconds,
    AUTH_ISSUER: String(config.AUTH_ISSUER).trim(),
    AUTH_AUDIENCE: String(config.AUTH_AUDIENCE).trim(),
    AUTH_REFRESH_COOKIE_NAME: String(config.AUTH_REFRESH_COOKIE_NAME).trim(),
    AUTH_DEV_RESET_TOKEN_CAPTURE: authDevResetTokenCapture === 'true',
    LOCAL_DETERMINISTIC_LOCATION_FALLBACK: localDeterministicLocationFallback === 'true',
    GEOAPIFY_REAL_MODE: geoapifyRealMode === 'true',
    ...(config.GEOAPIFY_SERVER_API_KEY !== undefined ? { GEOAPIFY_SERVER_API_KEY: normalizeConfiguredSecret(config.GEOAPIFY_SERVER_API_KEY) } : {}),
  };
}

function normalizeConfiguredSecret(value: unknown): string {
  const trimmed = String(value ?? '').trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) return trimmed.slice(1, -1).trim();
  return trimmed;
}

export function getGatewaySecurityConfig(config: Record<string, unknown> = process.env): GatewaySecurityConfig {
  const validated = validateEnvironment(config);
  const appEnv = String(validated.APP_ENV) as GatewayEnvironment;
  const windowMs = Number(validated.GATEWAY_RATE_LIMIT_WINDOW_SECONDS) * 1_000;
  return {
    appEnv,
    corsOrigins: parseConfiguredOrigins(validated.GATEWAY_CORS_ORIGINS),
    bodyLimitBytes: Number(validated.GATEWAY_BODY_LIMIT_BYTES),
    rateLimitProfiles: [
      { name: 'auth.login', method: 'POST', path: '/api/v1/auth/login', maxRequests: Number(validated.GATEWAY_AUTH_LOGIN_RATE_LIMIT), windowMs },
      { name: 'assistant.chat', method: 'POST', path: '/api/v1/assistant/chat', maxRequests: Number(validated.GATEWAY_ASSISTANT_CHAT_RATE_LIMIT), windowMs },
      { name: 'assistant.actions', method: 'POST', path: '/api/v1/assistant/actions', maxRequests: Number(validated.GATEWAY_ASSISTANT_ACTION_RATE_LIMIT), windowMs },
      { name: 'auth.register', method: 'POST', path: '/api/v1/auth/register', maxRequests: Number(validated.GATEWAY_FUTURE_AUTH_RATE_LIMIT), windowMs },
      { name: 'auth.forgot-password', method: 'POST', path: '/api/v1/auth/forgot-password', maxRequests: Number(validated.GATEWAY_FUTURE_AUTH_RATE_LIMIT), windowMs },
      { name: 'auth.reset-password', method: 'POST', path: '/api/v1/auth/reset-password', maxRequests: Number(validated.GATEWAY_FUTURE_AUTH_RATE_LIMIT), windowMs },
      { name: 'auth.refresh', method: 'POST', path: '/api/v1/auth/refresh', maxRequests: Number(validated.GATEWAY_FUTURE_AUTH_RATE_LIMIT), windowMs },
    ],
  };
}
