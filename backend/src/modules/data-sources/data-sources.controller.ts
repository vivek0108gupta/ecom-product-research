import { Controller, Get, Post } from '@nestjs/common';
import { SourceRegistryService } from './source-registry.service';

@Controller('data-sources')
export class DataSourcesController {
  constructor(private readonly registry: SourceRegistryService) {}

  /**
   * The collection-readiness report. Returns state NO_REAL_DATA_SOURCE_CONFIGURED with an
   * explanation rather than an empty list, so the dashboard can say why nothing is running.
   */
  @Get()
  report() {
    return this.registry.getReport();
  }

  @Post('reload')
  reload() {
    this.registry.reload();
    return this.registry.getReport();
  }
}
