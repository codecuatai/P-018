import { BadGatewayException, Injectable, PayloadTooLargeException, UnsupportedMediaTypeException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscribeResponseDto, UploadedAudioFile } from './voice.dto';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MiB
const ACCEPTED_MIME_PREFIXES = ['audio/', 'video/webm'];

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly agentUrl: string;
  private readonly internalToken: string;

  constructor(private readonly config: ConfigService) {
    this.agentUrl = this.config.getOrThrow<string>('AGENT_SERVICE_URL').replace(/\/$/, '');
    this.internalToken = this.config.getOrThrow<string>('INTERNAL_SERVICE_TOKEN');
  }

  async transcribe(file: UploadedAudioFile, correlationId: string, actorId: string): Promise<TranscribeResponseDto> {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', detail: 'Audio file is required.' });
    }

    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException({ code: 'FILE_EMPTY', detail: 'Audio file is empty.' });
    }

    if (file.buffer.length > MAX_AUDIO_BYTES) {
      throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', detail: 'Audio file too large (max 10 MiB).' });
    }

    const mimeType = file.mimetype ?? '';
    if (!ACCEPTED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix))) {
      throw new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_MEDIA_TYPE', detail: `Unsupported audio format: ${mimeType}` });
    }

    const formData = new FormData();
    const blob = new Blob([file.buffer as any], { type: mimeType });
    formData.append('file', blob, file.originalname || 'recording.webm');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${this.agentUrl}/api/v1/voice/speech-to-text`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Internal-Service-Token': this.internalToken,
          'X-Actor-Id': actorId,
          'X-Correlation-Id': correlationId,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadGatewayException({
          code: 'TRANSCRIPTION_FAILED',
          detail: 'Dịch vụ nhận dạng giọng nói đang tạm thời không khả dụng.',
        });
      }

      const body: unknown = await response.json();
      if (!isTranscribeResponse(body)) {
        throw new BadGatewayException({
          code: 'TRANSCRIPTION_INVALID_RESPONSE',
          detail: 'Dịch vụ nhận dạng giọng nói trả về dữ liệu không hợp lệ.',
        });
      }
      return body;
    } catch (error) {
      this.logger.warn('Voice transcription request failed at the Agent boundary.');
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException({
        code: 'AGENT_SERVICE_UNAVAILABLE',
        detail: 'Dịch vụ giọng nói đang gặp sự cố. Bạn thử lại sau nhé.',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async textToSpeech(text: string, correlationId: string, actorId: string): Promise<Buffer> {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      throw new BadRequestException({ code: 'TEXT_REQUIRED', detail: 'Text is required.' });
    }
    if (trimmed.length > 5000) {
      throw new BadRequestException({ code: 'TEXT_TOO_LONG', detail: 'Text too long (max 5000 characters).' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${this.agentUrl}/api/v1/voice/text-to-speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Token': this.internalToken,
          'X-Actor-Id': actorId,
          'X-Correlation-Id': correlationId,
        },
        body: JSON.stringify({ text: trimmed }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadGatewayException({
          code: 'TTS_FAILED',
          detail: 'Dịch vụ đọc văn bản đang tạm thời không khả dụng.',
        });
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.warn('Voice text-to-speech request failed at the Agent boundary.');
      if (error instanceof BadGatewayException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadGatewayException({
        code: 'AGENT_SERVICE_UNAVAILABLE',
        detail: 'Dịch vụ đọc văn bản đang gặp sự cố. Bạn thử lại sau nhé.',
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isTranscribeResponse(value: unknown): value is TranscribeResponseDto {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.text === 'string' && typeof record.provider === 'string';
}
