import { Test, TestingModule } from '@nestjs/testing';
import { VoiceController } from '../src/modules/voice/voice.controller';
import { VoiceService } from '../src/modules/voice/voice.service';
import { ConfigService } from '@nestjs/config';

describe('VoiceController', () => {
  let controller: VoiceController;
  let service: VoiceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceController],
      providers: [
        {
          provide: VoiceService,
          useValue: {
            transcribe: jest.fn().mockResolvedValue({ text: 'test', provider: 'gemini-flash' }),
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<VoiceController>(VoiceController);
    service = module.get<VoiceService>(VoiceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('transcribe should call service and return data', async () => {
    const file = { buffer: Buffer.from('test'), size: 4, mimetype: 'audio/webm', originalname: 'test.webm' } as Express.Multer.File;
    const req = { correlationId: 'test-cor', user: { sub: 'user-123' } } as any;
    
    const result = await controller.transcribe(file, req);
    
    expect(service.transcribe).toHaveBeenCalledWith(file, 'test-cor', 'user-123');
    expect(result).toEqual({ data: { text: 'test', provider: 'gemini-flash' }, meta: { request_id: 'test-cor' } });
  });
});
