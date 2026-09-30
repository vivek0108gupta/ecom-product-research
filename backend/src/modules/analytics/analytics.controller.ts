import { Controller, Get, Query } from '@nestjs/common';
import { QueryProductsDto } from '../products/dto/query-products.dto';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary() {
    return this.analytics.summary();
  }

  @Get('top-opportunities')
  topOpportunities(@Query('limit') limit: string | undefined, @Query() filters: QueryProductsDto) {
    return this.analytics.topOpportunities(limit ? Number.parseInt(limit, 10) : 20, filters);
  }

  /** Only products with real (non-SAMPLE) data and a COMPLETE score. */
  @Get('verified-opportunities')
  verifiedOpportunities(@Query('limit') limit: string | undefined, @Query() filters: QueryProductsDto) {
    return this.analytics.verifiedOpportunities(limit ? Number.parseInt(limit, 10) : 20, filters);
  }
}
