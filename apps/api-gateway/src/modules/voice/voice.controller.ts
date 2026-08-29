import { Body, Controller, HttpCode, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { TextToSpeechRequestDto, UploadedAudioFile } from './voice.dto';
import { MAX_AUDIO_BYTES, VoiceService } from './voice.service';

type AuthenticatedRequest = CorrelatedRequest & { user: AuthUser };

@Controller('api/v1/voice')
@UseGuards(AuthGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('transcribe')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  async transcribe(
    @UploadedFile() file: UploadedAudioFile,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.voiceService.transcribe(
      file,
      request.correlationId ?? 'cor_unknown',
      request.user.sub,
    );
    return { data: result, meta: { request_id: request.correlationId } };
  }

  @Post('text-to-speech')
  @HttpCode(200)
  async textToSpeech(
    @Body() body: TextToSpeechRequestDto,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const audioBuffer = await this.voiceService.textToSpeech(
      body.text,
      request.correlationId ?? 'cor_unknown',
      request.user.sub,
    );
    response.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audioBuffer.length),
      'Content-Disposition': 'inline; filename=tts.mp3',
    });
    response.send(audioBuffer);
  }
}
