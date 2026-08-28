import { BadGatewayException, Injectable, PayloadTooLargeException, UnsupportedMediaTypeException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscribeResponseDto, UploadedAudioFile } from './voice.dto';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MiB
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
    
    if (file.size === 0) {
      throw new BadRequestException({ code: 'FILE_EMPTY', detail: 'Audio file is empty.' });
    }
    
    if (file.size > MAX_AUDIO_BYTES) {
      throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', detail: 'Audio file too large (max 10 MiB).' });
    }
    
    if (!ACCEPTED_MIME_PREFIXES.some(prefix => file.mimetype.startsWith(prefix))) {
      throw new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_MEDIA_TYPE', detail: `Unsupported audio format: ${file.mimetype}` });
    }

    const formData = new FormData();
    const blob = new Blob([file.buffer as any], { type: file.mimetype });
    formData.append('file', blob, file.originalname || 'recording.webm');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${this.agentUrl}/api/v1/voice/speech-to-text`, {
        method: 'POST',
        headers: {
          'X-Internal-Service-Token': this.internalToken,
          'X-Actor-Id': actorId,
          'X-Correlation-Id': correlationId,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new BadGatewayException({
          code: 'TRANSCRIPTION_FAILED',
          detail: errBody.detail || `Agent service returned ${response.status}`,
        });
      }

      return (await response.json()) as TranscribeResponseDto;
    } catch (error) {
      this.logger.error(`Transcription request failed: ${error}`);
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
}
