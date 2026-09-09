import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

interface McpSession {
  id: string;
  userId: string;
  createdAt: number;
  lastSeenAt: number;
}

@Injectable()
export class McpSessionStore {
  private readonly sessions = new Map<string, McpSession>();
  private ttlMs = 1_800_000;

  configure(ttlSeconds: number): void {
    if (Number.isInteger(ttlSeconds) && ttlSeconds > 0) this.ttlMs = ttlSeconds * 1_000;
  }

  create(userId: string): McpSession {
    this.sweep();
    const session: McpSession = { id: `mcp_${randomUUID()}`, userId, createdAt: Date.now(), lastSeenAt: Date.now() };
    this.sessions.set(session.id, session);
    return session;
  }

  touch(sessionId: string, userId: string): McpSession | undefined {
    const existing = this.sessions.get(sessionId);
    if (!existing || existing.userId !== userId || Date.now() - existing.lastSeenAt > this.ttlMs) {
      if (existing) this.sessions.delete(sessionId);
      return undefined;
    }
    existing.lastSeenAt = Date.now();
    return existing;
  }

  destroy(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private sweep(): void {
    if (this.sessions.size < 1_000) return;
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastSeenAt > this.ttlMs) this.sessions.delete(id);
    }
  }
}
