import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

import { ServiceCallError } from '../resilience/service-call-error';
import { CorrelatedRequest } from './correlation-id.middleware';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<CorrelatedRequest>();
    if (exception instanceof ServiceCallError) {
      const problem = publicServiceProblem(exception);
      response.status(problem.status).json({
        type: 'https://x-one.local/problems/' + problem.code.toLowerCase(),
        title: problem.title,
        status: problem.status,
        code: problem.code,
        detail: problem.detail,
        retryable: problem.retryable,
        request_id: request.correlationId,
      });
      return;
    }
    const httpException = exception instanceof HttpException ? exception : undefined;
    const status = httpException?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = httpException?.getResponse();
    const source = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const code = typeof source.code === 'string' ? source.code : status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
    const messageText = Array.isArray(source.message) ? source.message.filter((item): item is string => typeof item === 'string').join('; ') : typeof source.message === 'string' ? source.message : undefined;
    const detail = status >= 500 && code === 'INTERNAL_ERROR' ? 'An unexpected error occurred.' : typeof source.detail === 'string' ? source.detail : messageText ?? (typeof raw === 'string' ? raw : 'Request failed.');
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

function publicServiceProblem(error: ServiceCallError): {
  status: number;
  title: string;
  code: string;
  detail: string;
  retryable: boolean;
} {
  if (error.code === 'OUTCOME_UNKNOWN' || error.outcome === 'AMBIGUOUS') {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      title: 'Outcome Unknown',
      code: 'OUTCOME_UNKNOWN',
      detail: 'The operation result is not yet known. Retry the same action to reconcile it.',
      retryable: true,
    };
  }
  if (
    (error.category === 'BUSINESS' || error.category === 'CLIENT')
    && error.httpStatus !== null
    && ![401, 403].includes(error.httpStatus)
  ) {
    return {
      status: error.httpStatus,
      title: 'Domain Request Rejected',
      code: error.code,
      detail: error.message,
      retryable: false,
    };
  }
  if (error.code === 'DOWNSTREAM_TIMEOUT') {
    return {
      status: HttpStatus.GATEWAY_TIMEOUT,
      title: 'Gateway Timeout',
      code: 'DOWNSTREAM_TIMEOUT',
      detail: 'A required service did not respond in time.',
      retryable: true,
    };
  }
  if (error.category === 'CONTRACT') {
    return {
      status: HttpStatus.BAD_GATEWAY,
      title: 'Invalid Downstream Contract',
      code: 'DOWNSTREAM_CONTRACT_INVALID',
      detail: 'A required service returned an invalid response.',
      retryable: false,
    };
  }
  return {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    title: 'Service Unavailable',
    code: 'DOWNSTREAM_UNAVAILABLE',
    detail: 'A required service is temporarily unavailable.',
    retryable: true,
  };
}
