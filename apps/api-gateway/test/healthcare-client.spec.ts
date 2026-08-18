import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HealthcareClient } from '../src/clients/service.clients';

function config(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((name: string) => values[name]),
  } as unknown as ConfigService;
}

function expectPatientLinkRequired(client: HealthcareClient): void {
  try {
    void client.defaultPatientId;
    fail('Expected the demo patient fallback to be rejected.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toMatchObject({ code: 'PATIENT_LINK_REQUIRED' });
  }
}

describe('HealthcareClient demo patient boundary', () => {
  it('uses the configured demo patient only outside production', () => {
    const client = new HealthcareClient(config({ APP_ENV: 'development', HEALTHCARE_DEFAULT_PATIENT_ID: '7' }));

    expect(client.defaultPatientId).toBe(7);
  });

  it('requires an explicit patient link in production', () => {
    const client = new HealthcareClient(config({ APP_ENV: 'production', HEALTHCARE_DEFAULT_PATIENT_ID: '7' }));

    expectPatientLinkRequired(client);
  });

  it('rejects an absent or invalid demo patient outside production', () => {
    const client = new HealthcareClient(config({ APP_ENV: 'test', HEALTHCARE_DEFAULT_PATIENT_ID: 'not-a-patient' }));

    expectPatientLinkRequired(client);
  });
});
