import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceRecord } from '../../database/entities/data-source.entity';
import { Marketplace } from '../../database/entities/marketplace.entity';
import { ScrapeRun } from '../../database/entities/scrape-run.entity';
import { ScoringModule } from '../scoring/scoring.module';
import { ManualCsvAdapter } from './adapters/manual-csv.adapter';
import { IngestionProcessor, INGESTION_QUEUE } from './ingestion.processor';
import { IngestionService } from './ingestion.service';
import { ScrapingController } from './scraping.controller';
import { ValidationService } from './validation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Marketplace, DataSourceRecord, ScrapeRun]),
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
    ScoringModule,
  ],
  controllers: [ScrapingController],
  providers: [ManualCsvAdapter, ValidationService, IngestionService, IngestionProcessor],
  exports: [ManualCsvAdapter, ValidationService, IngestionService],
})
export class ScrapingModule {}
