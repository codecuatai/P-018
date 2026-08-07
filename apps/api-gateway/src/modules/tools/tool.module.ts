import { Module } from '@nestjs/common';

import { ToolRegistry } from './tool-registry';

@Module({
  providers: [ToolRegistry],
  exports: [ToolRegistry],
})
export class ToolModule {}
