export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const requiredStrings = [
    'DATABASE_URL',
    'AGENT_SERVICE_URL',
    'RIDE_SERVICE_URL',
    'RESTAURANT_SERVICE_URL',
    'HEALTHCARE_SERVICE_URL',
    'FOOD_SERVICE_URL',
    'INTERNAL_SERVICE_TOKEN',
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
  return { ...config, PORT: port };
}
