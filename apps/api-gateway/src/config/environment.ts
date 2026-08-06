export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const requiredStrings = [
    'DATABASE_URL',
    'AGENT_SERVICE_URL',
    'RIDE_SERVICE_URL',
    'RESTAURANT_SERVICE_URL',
    'HEALTHCARE_SERVICE_URL',
    'FOOD_SERVICE_URL',
    'INTERNAL_SERVICE_TOKEN',
    'JWT_SECRET',
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
  for (const name of ['UPSTREAM_TIMEOUT_MS', 'CONFIRMATION_TTL_SECONDS', 'GATEWAY_WORKFLOW_POLL_INTERVAL_MS']) {
    if (config[name] !== undefined && (!Number.isInteger(Number(config[name])) || Number(config[name]) < 1)) throw new Error(`${name} must be a positive integer.`);
  }
  return { ...config, PORT: port };
}
