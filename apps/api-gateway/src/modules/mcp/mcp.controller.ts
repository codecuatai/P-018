import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CorrelatedRequest } from '../../common/correlation-id.middleware';
import { AuthUser } from '../auth/auth.types';
import { McpAuthGuard } from './mcp.auth';
import { McpService } from './mcp.service';
import { McpSessionStore } from './mcp.session';
import { JsonRpcRequest } from './dto';

@Controller('mcp')
export class McpController {
  constructor(
    private readonly service: McpService,
    private readonly sessions: McpSessionStore,
  ) {}

  @Post()
  @HttpCode(200)
  @UseGuards(McpAuthGuard)
  async handleStreamableHttp(
    @Body() body: JsonRpcRequest | JsonRpcRequest[] | undefined,
    @Headers('mcp-session-id') sessionHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CorrelatedRequest & { user: AuthUser },
    @Res() response: Response,
  ): Promise<void> {
    const user = request.user;
    const correlationId = request.correlationId ?? 'cor_mcp_unknown';

    // Handle batch requests (MCP clients may batch initialize + tools/list)
    if (Array.isArray(body)) {
      const results = [];
      for (const single of body) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await this.service.handleRpc(single, user, correlationId, idempotencyKey));
      }
      response.json(results.length === 1 ? results[0] : results);
      return;
    }

    if (!body || typeof body !== 'object' || body.jsonrpc !== '2.0' || !body.method) {
      throw new BadRequestException({
        code: 'MCP_INVALID_REQUEST',
        detail: 'Request không đúng định dạng JSON-RPC 2.0 (thiếu jsonrpc/method).',
        retryable: false,
      });
    }

    // Session handshake: on initialize, create and return session id
    if (body.method === 'initialize') {
      const session = this.sessions.create(user.sub);
      response.setHeader('Mcp-Session-Id', session.id);
      const result = await this.service.handleRpc(body, user, correlationId, idempotencyKey);
      response.json(result);
      return;
    }

    // For stateful requests after initialize, validate Mcp-Session-Id
    if (['tools/call', 'tools/list', 'ping'].includes(body.method)) {
      if (sessionHeader) {
        const valid = this.sessions.touch(sessionHeader, user.sub);
        if (!valid) {
          response.status(400).json({
            jsonrpc: '2.0',
            id: body.id ?? null,
            error: { code: -32000, message: 'Invalid or expired Mcp-Session-Id. Re-run initialize.' },
          });
          return;
        }
        // Echo back session for continued use
        response.setHeader('Mcp-Session-Id', sessionHeader);
      }
    }

    const result = await this.service.handleRpc(body, user, correlationId, idempotencyKey);
    response.json(result);
  }

  @Get()
  @UseGuards(McpAuthGuard)
  async openSseStream(
    @Req() request: CorrelatedRequest & { user: AuthUser },
    @Res() response: Response,
  ): Promise<void> {
    // Streamable HTTP: SSE stream for server-initiated updates.
    // Phase 1: send heartbeat event + session confirmation.
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');

    const session = this.sessions.create(request.user.sub);
    response.setHeader('Mcp-Session-Id', session.id);

    response.write(`event: ready\ndata: ${JSON.stringify({ session_id: session.id, server: 'x-one-provider-mcp' })}\n\n`);
    response.write(`event: ping\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

    // Keep alive for 30s then close (client reconnects as needed)
    const timer = setTimeout(() => {
      try {
        response.write('event: close\ndata: {}\n\n');
        response.end();
      } catch {
        // client already disconnected
      }
    }, 30_000);

    request.on('close', () => clearTimeout(timer));
  }

  @Delete()
  @UseGuards(McpAuthGuard)
  async closeSession(
    @Headers('mcp-session-id') sessionHeader: string | undefined,
    @Req() request: CorrelatedRequest & { user: AuthUser },
  ): Promise<object> {
    if (sessionHeader) this.sessions.destroy(sessionHeader);
    return { data: { closed: true }, meta: { request_id: request.correlationId } };
  }
}
