import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

import { CorrelatedRequest } from './correlation-id.middleware';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<CorrelatedRequest>();
    const httpException = exception instanceof HttpException ? exception : undefined;
    const status = httpException?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = httpException?.getResponse();
    const source = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const code = typeof source.code === 'string' ? source.code : status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
    const detail = status >= 500 && code === 'INTERNAL_ERROR' ? 'An unexpected error occurred.' : typeof source.detail === 'string' ? source.detail : typeof source.message === 'string' ? source.message : typeof raw === 'string' ? raw : 'Request failed.';
    response.status(status).json({
      type: `https://x-one.local/problems/${status}`,
      title: httpException?.name ?? 'Internal Server Error',
      status,
      code,
      detail,
      retryable: typeof source.retryable === 'boolean' ? source.retryable : status >= 500,
      request_id: request.correlationId,
    });
  }
}
