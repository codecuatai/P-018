export interface TranscribeResponseDto {
  text: string;
  provider: string;
}

export interface TextToSpeechRequestDto {
  text: string;
}

export interface UploadedAudioFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname?: string;
  fieldname?: string;
  encoding?: string;
}

