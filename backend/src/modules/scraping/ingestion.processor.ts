import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ScoringService } from '../scoring/scoring.service';
import { ManualCsvAdapter } from './adapters/manual-csv.adapter';
import { IngestionService, IngestionSummary } from './ingestion.service';

export const INGESTION_QUEUE = 'ingestion';

export interface ImportCsvJob {
  runId: string;
  csvContent: string;
  rescoreAfter: boolean;
}

/**
 * Data collection runs on the queue, never inside the HTTP request that triggered it.
 * BullMQ handles the retry/backoff policy configured where the queue is registered.
 */
@Processor(INGESTION_QUEUE)
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly adapter: ManualCsvAdapter,
    private readonly ingestion: IngestionService,
    private readonly scoring: ScoringService,
  ) {
    super();
  }

  async process(job: Job<ImportCsvJob>): Promise<IngestionSummary> {
    const { runId, csvContent, rescoreAfter } = job.data;
    const run = await this.ingestion.markRunning(runId);

    try {
      const { products, malformed } = this.adapter.parseCsv(csvContent);
      const summary = await this.ingestion.ingest(run, products, malformed);

      if (rescoreAfter) {
        await this.scoring.rescoreAll();
      }
      return summary;
    } catch (error) {
      this.logger.error(`Ingestion run ${runId} failed: ${(error as Error).message}`);
      await this.ingestion.failRun(run, error as Error);
      throw error;
    }
  }
}
