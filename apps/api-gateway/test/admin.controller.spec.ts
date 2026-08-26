import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminController } from '../src/modules/admin/admin.controller';
import { AdminService } from '../src/modules/admin/admin.service';
import { AuthService } from '../src/modules/auth/auth.service';

describe('AdminController', () => {
  let controller: AdminController;
  let mockAdminService: Partial<AdminService>;

  beforeEach(async () => {
    mockAdminService = {
      summary: jest.fn().mockResolvedValue({ users_total: 10 }),
      systemHealth: jest.fn().mockResolvedValue({ items: [] }),
      listApiKeys: jest.fn().mockResolvedValue({ items: [] }),
      createApiKey: jest.fn().mockResolvedValue({ id: 'key_1', provider: 'gemini', last4: '...1234' }),
      rotateApiKey: jest.fn().mockResolvedValue({ id: 'key_1', last4: '...5678' }),
      revokeApiKey: jest.fn().mockResolvedValue({ id: 'key_1', status: 'disabled' }),
      testApiKey: jest.fn().mockResolvedValue({ success: true, message: 'OK', latency_ms: 10 }),
      systemLogs: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      userServiceSummary: jest.fn().mockResolvedValue({ user_id: 'u1', ride_count: 5 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: AuthService, useValue: { verifyAccessToken: jest.fn().mockResolvedValue({ sub: 'admin_1', role: 'admin' }) } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-secret') } },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  const mockRequest = {
    user: { sub: 'admin_1', role: 'admin' },
    correlationId: 'corr_test_1',
    headers: { 'x-correlation-id': 'corr_test_1' },
  } as any;

  describe('API Key rotation', () => {
    it('should throw BadRequestException when Idempotency-Key header is missing', async () => {
      await expect(
        controller.rotateApiKey('key_1', { key: 'new-secret-1234' }, undefined, mockRequest),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when key does not exist', async () => {
      mockAdminService.rotateApiKey = jest.fn().mockResolvedValue(undefined);
      await expect(
        controller.rotateApiKey('non_existent', { key: 'new-secret-1234' }, 'idem_key_1', mockRequest),
      ).rejects.toThrow(NotFoundException);
    });

    it('should rotate key when Idempotency-Key is provided', async () => {
      const res = await controller.rotateApiKey('key_1', { key: 'new-secret-1234' }, 'idem_key_1', mockRequest);
      expect((res as any).data.last4).toBe('...5678');
      expect((res as any).meta.request_id).toBe('corr_test_1');
    });
  });

  describe('Logs Endpoints', () => {
    it('should handle /admin/logs and /admin/system-logs equally', async () => {
      const logsRes = await controller.logs({ page: 1, page_size: 20 }, mockRequest);
      const sysLogsRes = await controller.systemLogs({ page: 1, page_size: 20 }, mockRequest);
      expect(mockAdminService.systemLogs).toHaveBeenCalledTimes(2);
      expect((logsRes as any).data.items).toEqual([]);
      expect((sysLogsRes as any).data.items).toEqual([]);
    });
  });
});
