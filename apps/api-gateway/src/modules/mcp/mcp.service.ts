import { HttpException, Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { fail, JsonRpcRequest, JsonRpcResponse, ok } from './dto';
import { McpToolRegistry } from './mcp.registry';

const PROTOCOL_VERSION = '2024-11-05';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(private readonly registry: McpToolRegistry) {}

  async handleRpc(
    request: JsonRpcRequest,
    user: AuthUser,
    correlationId: string,
    idempotencyKey?: string,
  ): Promise<JsonRpcResponse> {
    const id = request.id ?? null;

    if (!request || request.jsonrpc !== '2.0' || !request.method) {
      return fail(id, -32600, 'Invalid Request: jsonrpc "2.0" and method required.');
    }

    try {
      switch (request.method) {
        case 'initialize': {
          return ok(id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: 'x-one-provider-mcp',
              version: '1.0.0',
            },
            instructions:
              'X-One Provider MCP Server: Quản lý món ăn, chuyến xe, bàn tiệc, lịch khám qua ngôn ngữ tự nhiên. Gắn kết trực tiếp 4 microservices X-One.',
          });
        }
        case 'ping': {
          return ok(id, {});
        }
        case 'notifications/initialized': {
          return ok(id, {});
        }
        case 'tools/list': {
          const tools = this.registry.listTools();
          return ok(id, { tools });
        }
        case 'tools/call': {
          const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
          const toolName = params?.name;
          if (!toolName) return fail(id, -32602, 'Invalid params: "name" required for tools/call.');
          const args = params?.arguments ?? {};

          try {
            const rawResult = await this.registry.callTool(toolName, args, user, correlationId, idempotencyKey);
            const textContent = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2);
            return ok(id, {
              content: [{ type: 'text', text: textContent }],
              isError: false,
            });
          } catch (err: unknown) {
            const detail = err instanceof HttpException ? (err.getResponse() as Record<string, unknown>)?.detail ?? err.message : String(err);
            return ok(id, {
              content: [{ type: 'text', text: `[LỖI THỰC THI TOOL] ${detail}` }],
              isError: true,
            });
          }
        }
        default:
          return fail(id, -32601, `Method not found: ${request.method}`);
      }
    } catch (err: unknown) {
      this.logger.error(`MCP RPC error: ${String(err)}`);
      return fail(id, -32603, `Internal error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
