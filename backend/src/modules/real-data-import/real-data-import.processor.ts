import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ScoringService } from '../scoring/scoring.service';
import { RealDataImportService } from './real-data-import.service';
import { ImportReport } from './real-data.types';

export const REAL_DATA_IMPORT_QUEUE = 'real-data-import';

export interface RealDataImportJob {
  runId: string;
  content: string;
  format: 'csv' | 'json';
  rescoreAfter: boolean;
}

/** Real-data ingestion runs on the queue, never inside the HTTP request that triggered it. */
@Processor(REAL_DATA_IMPORT_QUEUE)
export class RealDataImportProcessor extends WorkerHost {
  private readonly logger = new Logger(RealDataImportProcessor.name);

  constructor(
    private readonly importService: RealDataImportService,
    private readonly scoring: ScoringService,
  ) {
    super();
  }

  async process(job: Job<RealDataImportJob>): Promise<ImportReport> {
    const { runId, content, format, rescoreAfter } = job.data;
    const run = await this.importService.getRun(runId);
    if (!run) {
      throw new Error(`Import run ${runId} not found`);
    }

    try {
      const report = await this.importService.import(run, content, format);
      if (rescoreAfter) {
        await this.scoring.rescoreAll();
      }
      return report;
    } catch (error) {
      this.logger.error(`Real import run ${runId} failed: ${(error as Error).message}`);
      await this.importService.failRun(run, error as Error);
      throw error;
    }
  }
}
