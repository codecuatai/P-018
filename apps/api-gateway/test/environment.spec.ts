import { validateEnvironment } from '../src/config/environment';

describe('environment validation', () => {
  const completeConfig = {
    APP_ENV: 'test',
    PORT: '3000',
    GATEWAY_CORS_ORIGINS: 'http://localhost:5173,http://localhost:3000',
    GATEWAY_BODY_LIMIT_BYTES: '262144',
    GATEWAY_RATE_LIMIT_WINDOW_SECONDS: '60',
    GATEWAY_AUTH_LOGIN_RATE_LIMIT: '5',
    GATEWAY_ASSISTANT_CHAT_RATE_LIMIT: '30',
    GATEWAY_ASSISTANT_ACTION_RATE_LIMIT: '20',
    GATEWAY_FUTURE_AUTH_RATE_LIMIT: '5',
    DATABASE_URL: 'postgresql://core_user:password@postgres:5432/xone_core',
    AGENT_SERVICE_URL: 'http://agent-service:8001',
    RIDE_SERVICE_URL: 'http://ride-service:8101',
    RESTAURANT_SERVICE_URL: 'http://restaurant-service:8102',
    HEALTHCARE_SERVICE_URL: 'http://healthcare-service:8103',
    HEALTHCARE_DEFAULT_PATIENT_ID: '1',
    FOOD_SERVICE_URL: 'http://food-service:8104',
    INTERNAL_SERVICE_TOKEN: 'test-token',
    JWT_SECRET: 'test-jwt-secret-12345',
    DEMO_AUTH_ENABLED: 'false',
  };

  it('accepts complete process configuration', () => {
    expect(validateEnvironment(completeConfig).PORT).toBe(3000);
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnvironment({ ...completeConfig, PORT: 'invalid' })).toThrow('PORT must be an integer');
  });

  it('fails fast for a missing required value', () => {
    const { INTERNAL_SERVICE_TOKEN: _token, ...withoutToken } = completeConfig;
    expect(() => validateEnvironment(withoutToken)).toThrow('INTERNAL_SERVICE_TOKEN is required');
  });

  it('rejects wildcard CORS origins', () => {
    expect(() => validateEnvironment({ ...completeConfig, GATEWAY_CORS_ORIGINS: '*' })).toThrow('must not contain a wildcard');
  });

  it('rejects localhost CORS origins in production', () => {
    expect(() => validateEnvironment({ ...completeConfig, APP_ENV: 'production' })).toThrow('must not contain localhost');
  });

  it('normalizes configured security limits', () => {
    const validated = validateEnvironment(completeConfig);
    expect(validated.GATEWAY_BODY_LIMIT_BYTES).toBe(262144);
    expect(validated.GATEWAY_RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });

  it('accepts production configuration without demo credentials or a patient fallback', () => {
    const productionConfig = {
      ...completeConfig,
      APP_ENV: 'production',
      GATEWAY_CORS_ORIGINS: 'https://app.example.com',
      DEMO_AUTH_ENABLED: 'false',
      HEALTHCARE_DEFAULT_PATIENT_ID: '',
    };
    expect(validateEnvironment(productionConfig).APP_ENV).toBe('production');
  });

  it('requires the demo patient fallback outside production', () => {
    expect(() => validateEnvironment({ ...completeConfig, HEALTHCARE_DEFAULT_PATIENT_ID: '' })).toThrow('HEALTHCARE_DEFAULT_PATIENT_ID is required outside production');
  });
});
