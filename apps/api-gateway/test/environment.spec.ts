import { validateEnvironment } from '../src/config/environment';

describe('environment validation', () => {
  const completeConfig = {
    APP_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgresql://core_user:password@postgres:5432/xone_core',
    AGENT_SERVICE_URL: 'http://agent-service:8001',
    RIDE_SERVICE_URL: 'http://ride-service:8101',
    RESTAURANT_SERVICE_URL: 'http://restaurant-service:8102',
    HEALTHCARE_SERVICE_URL: 'http://healthcare-service:8103',
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
});
