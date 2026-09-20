import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { OperationsController } from '../src/modules/services/operations.controller';
import { InMemoryProviderOfferingsRepository, ProviderOfferingsStore } from '../src/modules/services/provider-offerings.store';

describe('OperationsController (provider control plane)', () => {
  let controller: OperationsController;
  let repository: InMemoryProviderOfferingsRepository;

  const manager = { sub: 'manager-1', role: 'manager', email: 'manager@xone.local' } as any;
  const admin = { sub: 'admin-1', role: 'admin', email: 'admin@xone.local' } as any;
  const provider = { sub: 'provider-1', role: 'provider', email: 'provider@xone.local' } as any;
  const request = (user: any) => ({ user, correlationId: 'corr-operations' }) as any;

  beforeEach(() => {
    repository = new InMemoryProviderOfferingsRepository();
    const store = {
      listAssignments: (options?: any) => repository.listAssignments(options),
      createAssignment: (value: any) => repository.createAssignment(value),
      updateAssignment: (id: string, patch: any) => repository.updateAssignment(id, patch),
      listDocuments: (providerId?: string) => repository.listDocuments(providerId),
      updateDocument: (id: string, patch: any) => repository.updateDocument(id, patch),
    } as unknown as ProviderOfferingsStore;
    controller = new OperationsController(store);
  });

  it('creates an offered assignment and replays the active resource assignment', async () => {
    const first = await controller.createAssignment({ provider_id: provider.sub, domain: 'ride', resource_id: 'ride-1' }, 'idem-1', request(manager)) as any;
    const replay = await controller.createAssignment({ provider_id: provider.sub, domain: 'ride', resource_id: 'ride-1' }, 'idem-2', request(manager)) as any;

    expect(first.data.status).toBe('OFFERED');
    expect(replay.data.id).toBe(first.data.id);
    expect(replay.meta.replayed).toBe(true);
  });

  it('requires an idempotency key for assignment creation', async () => {
    await expect(controller.createAssignment({ provider_id: provider.sub, domain: 'food', resource_id: 'order-1' }, undefined, request(manager))).rejects.toThrow(BadRequestException);
  });

  it('counts overdue active assignments', async () => {
    await controller.createAssignment({ provider_id: provider.sub, domain: 'delivery', resource_id: 'delivery-1', due_at: '2020-01-01T00:00:00.000Z' }, 'idem-3', request(manager));
    const result = await controller.listAssignments(undefined, undefined, undefined, request(manager)) as any;
    expect(result.data.count).toBe(1);
    expect(result.data.overdue).toBe(1);
  });

  it('allows only admin to review provider documents', async () => {
    const document = await repository.createDocument({
      id: 'doc-1', providerId: provider.sub, documentType: 'license', status: 'PENDING', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    await expect(controller.reviewDocument(document.id, { status: 'APPROVED' }, request(manager))).rejects.toThrow(ForbiddenException);
    const reviewed = await controller.reviewDocument(document.id, { status: 'APPROVED', review_note: 'Verified' }, request(admin)) as any;
    expect(reviewed.data.status).toBe('APPROVED');
    expect(reviewed.data.reviewNote).toBe('Verified');
  });
});
