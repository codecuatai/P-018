import { Module } from '@nestjs/common';

import { ToolModule } from '../tools/tool.module';
import { ConversationController } from './conversation.controller';
import { RideConversationService } from './ride-conversation.service';

@Module({
  imports: [ToolModule],
  controllers: [ConversationController],
  providers: [RideConversationService],
})
export class ConversationModule {}
