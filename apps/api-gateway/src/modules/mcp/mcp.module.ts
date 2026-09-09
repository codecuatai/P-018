import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { CoreModule } from '../core/core.module';
import { PersonalModule } from '../personal/personal.module';
import { ProviderOfferingsStore } from '../services/provider-offerings.store';
import { ServiceHubService } from '../services/services.module';
import { McpApiKeyStore } from './mcp.api-key.store';
import { McpAuthGuard } from './mcp.auth';
import { McpController } from './mcp.controller';
import { McpKeysController, McpKeysService } from './mcp.keys';
import { McpToolRegistry } from './mcp.registry';
import { McpService } from './mcp.service';
import { McpSessionStore } from './mcp.session';

function mcpSessionFactory(config: ConfigService): McpSessionStore {
  const store = new McpSessionStore();
  const ttl = Number(config.get<string>('MCP_SESSION_TTL_SECONDS') ?? '1800');
  if (Number.isInteger(ttl) && ttl > 0) store.configure(ttl);
  return store;
}

@Module({
  imports: [AuthModule, CoreModule, PersonalModule],
  controllers: [McpController, McpKeysController],
  providers: [
    McpService,
    McpToolRegistry,
    McpAuthGuard,
    McpApiKeyStore,
    McpKeysService,
    ProviderOfferingsStore,
    ServiceHubService,
    {
      provide: McpSessionStore,
      inject: [ConfigService],
      useFactory: mcpSessionFactory,
    },
  ],
})
export class McpModule {}
