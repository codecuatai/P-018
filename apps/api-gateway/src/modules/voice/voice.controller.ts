import { Controller, HttpCode, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUser } from '../auth/auth.types';
import { VoiceService } from './voice.service';

declare global {
  namespace Express {
    namespace Multer {
      interface File {
        fieldname?: string;
        originalname: string;
        encoding?: string;
        mimetype: string;
        size: number;
        destination?: string;
        filename?: string;
        path?: string;
        buffer: Buffer;
      }
    }
  }
}

type AuthenticatedRequest = CorrelatedRequest & { user: AuthUser };

@Controller('api/v1/voice')
@UseGuards(AuthGuard)
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('transcribe')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async transcribe(
    @UploadedFile() file: Express.Multer.File,
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
