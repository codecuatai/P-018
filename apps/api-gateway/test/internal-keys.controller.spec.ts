import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AdminService } from '../src/modules/admin/admin.service';
import { InternalKeysController } from '../src/modules/admin/internal-keys.controller';

describe('InternalKeysController', () => {
  let controller: InternalKeysController;
  let mockAdminService: { getActiveDecryptedKeys: jest.Mock };

  beforeEach(async () => {
    mockAdminService = {
      getActiveDecryptedKeys: jest.fn().mockResolvedValue(['AIzaSy-key-1', 'AIzaSy-key-2']),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalKeysController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'INTERNAL_SERVICE_TOKEN') return 'valid-internal-token-123';
              throw new Error(`Missing config: ${key}`);
            },
          },
        },
      ],
    }).compile();

    controller = module.get<InternalKeysController>(InternalKeysController);
  });

  it('should reject requests with missing token', async () => {
    await expect(controller.getActiveKeys(undefined, 'gemini')).rejects.toThrow(UnauthorizedException);
  });

  it('should reject requests with invalid token', async () => {
    await expect(controller.getActiveKeys('wrong-token', 'gemini')).rejects.toThrow(UnauthorizedException);
  });

  it('should return active decrypted keys for valid token', async () => {
    const result = await controller.getActiveKeys('valid-internal-token-123', 'gemini', { correlationId: 'corr_test' } as any);
    expect(result).toEqual({
      data: {
        provider: 'gemini',
        keys: ['AIzaSy-key-1', 'AIzaSy-key-2'],
      },
      meta: {
        request_id: 'corr_test',
      },
    });
    expect(mockAdminService.getActiveDecryptedKeys).toHaveBeenCalledWith('gemini');
  });
});
