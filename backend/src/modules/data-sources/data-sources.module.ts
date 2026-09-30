import { Global, Module } from '@nestjs/common';
import { DataSourcesController } from './data-sources.controller';
import { SourceRegistryService } from './source-registry.service';

@Global()
@Module({
  controllers: [DataSourcesController],
  providers: [SourceRegistryService],
  exports: [SourceRegistryService],
})
export class DataSourcesModule {}
