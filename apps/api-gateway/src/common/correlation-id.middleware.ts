import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export interface CorrelatedRequest extends Request {
  correlationId?: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(request: CorrelatedRequest, response: Response, next: NextFunction): void {
    const incoming = request.header('x-correlation-id');
    request.correlationId = incoming && incoming.length <= 128 ? incoming : `cor_${randomUUID()}`;
    response.setHeader('X-Correlation-Id', request.correlationId);
    next();
  }
}
