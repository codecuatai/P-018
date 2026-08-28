import { Controller, HttpCode, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { UploadedAudioFile } from './voice.dto';
import { VoiceService } from './voice.service';

type AuthenticatedRequest = CorrelatedRequest & { user: AuthUser };

@Controller('api/v1/voice')
@UseGuards(AuthGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('transcribe')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
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
}
