import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceRecord } from '../../database/entities/data-source.entity';
import { Marketplace } from '../../database/entities/marketplace.entity';
import { ScrapeRun } from '../../database/entities/scrape-run.entity';
import { ScoringModule } from '../scoring/scoring.module';
import { RealDataImportController } from './real-data-import.controller';
import { RealDataImportProcessor, REAL_DATA_IMPORT_QUEUE } from './real-data-import.processor';
import { RealDataImportService } from './real-data-import.service';
import { RealDataParser } from './real-data.parser';
import { RealDataValidator } from './real-data.validator';

@Module({
  imports: [
    TypeOrmModule.forFeature([Marketplace, DataSourceRecord, ScrapeRun]),
    BullModule.registerQueue({ name: REAL_DATA_IMPORT_QUEUE }),
    ScoringModule,
  ],
  controllers: [RealDataImportController],
  providers: [RealDataParser, RealDataValidator, RealDataImportService, RealDataImportProcessor],
  exports: [RealDataImportService, RealDataParser, RealDataValidator],
})
export class RealDataImportModule {}
