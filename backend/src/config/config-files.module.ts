import { Global, Module } from '@nestjs/common';
import { ConfigFilesService } from './config-files.service';

@Global()
@Module({
  providers: [ConfigFilesService],
  exports: [ConfigFilesService],
})
export class ConfigFilesModule {}
