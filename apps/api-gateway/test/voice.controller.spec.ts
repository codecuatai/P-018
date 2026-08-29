import { Test, TestingModule } from '@nestjs/testing';
import { VoiceController } from '../src/modules/voice/voice.controller';
import { VoiceService } from '../src/modules/voice/voice.service';
import { UploadedAudioFile } from '../src/modules/voice/voice.dto';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../src/modules/auth/auth.guard';
import type { Response } from 'express';

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
            textToSpeech: jest.fn().mockResolvedValue(Buffer.from('audio')),
          },
        },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn() },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<VoiceController>(VoiceController);
    service = module.get<VoiceService>(VoiceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('transcribe should call service and return data', async () => {
    const file: UploadedAudioFile = { buffer: Buffer.from('test'), size: 4, mimetype: 'audio/webm', originalname: 'test.webm' };
    const req = { correlationId: 'test-cor', user: { sub: 'user-123' } } as any;

    const result = await controller.transcribe(file, req);

    expect(service.transcribe).toHaveBeenCalledWith(file, 'test-cor', 'user-123');
    expect(result).toEqual({ data: { text: 'test', provider: 'gemini-flash' }, meta: { request_id: 'test-cor' } });
  });

  it('textToSpeech should stream the Agent audio response', async () => {
    const req = { correlationId: 'test-cor', user: { sub: 'user-123' } } as any;
    const response = { set: jest.fn(), send: jest.fn() } as unknown as Response;

    await controller.textToSpeech({ text: '  Xin chào  ' }, req, response);

    expect(service.textToSpeech).toHaveBeenCalledWith('  Xin chào  ', 'test-cor', 'user-123');
    expect(response.set).toHaveBeenCalledWith({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(Buffer.from('audio').length),
      'Content-Disposition': 'inline; filename=tts.mp3',
    });
    expect(response.send).toHaveBeenCalledWith(Buffer.from('audio'));
  });
});
