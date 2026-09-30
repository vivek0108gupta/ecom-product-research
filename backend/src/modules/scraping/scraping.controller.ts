import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Queue } from 'bullmq';
import { ManualCsvAdapter } from './adapters/manual-csv.adapter';
import { IngestionService } from './ingestion.service';
import { ImportCsvJob, INGESTION_QUEUE } from './ingestion.processor';

@Controller('scraping')
export class ScrapingController {
  constructor(
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue<ImportCsvJob>,
    private readonly ingestion: IngestionService,
    private readonly adapter: ManualCsvAdapter,
  ) {}

  /**
   * Accepts a CSV upload and queues it. Returns immediately with a runId —
   * ingestion itself happens on the worker, not in this request.
   */
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('csv') inlineCsv: string | undefined,
    @Query('rescore') rescore: string | undefined,
  ) {
    const csvContent = file ? file.buffer.toString('utf-8') : inlineCsv;
    if (!csvContent || csvContent.trim().length === 0) {
      throw new BadRequestException('Provide a CSV file upload (field "file") or a "csv" string in the body.');
    }

    const run = await this.ingestion.startRun(this.adapter.sourceName);
    await this.queue.add(
      'import-csv',
      { runId: run.id, csvContent, rescoreAfter: rescore !== 'false' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    return { runId: run.id, status: run.status, message: 'Import queued. Poll /api/scraping/runs/:runId for the outcome.' };
  }

  /** Validate a CSV without writing anything — useful before committing a research batch. */
  @Post('validate')
  @UseInterceptors(FileInterceptor('file'))
  async validateOnly(@UploadedFile() file: Express.Multer.File | undefined, @Body('csv') inlineCsv: string | undefined) {
    const csvContent = file ? file.buffer.toString('utf-8') : inlineCsv;
    if (!csvContent) {
      throw new BadRequestException('Provide a CSV file upload (field "file") or a "csv" string in the body.');
    }
    const { products, malformed } = this.adapter.parseCsv(csvContent);
    return { parsed: products.length, malformed };
  }

  @Get('runs')
  listRuns(@Query('limit') limit?: string) {
    return this.ingestion.listRuns(limit ? Number.parseInt(limit, 10) : 25);
  }

  @Get('runs/:id')
  async getRun(@Param('id') id: string) {
    const run = await this.ingestion.getRun(id);
    if (!run) {
      throw new NotFoundException(`No ingestion run with id ${id}`);
    }
    return run;
  }

  /** What each registered source is and is not permitted to do. */
  @Get('sources')
  listSources() {
    return [{ sourceName: this.adapter.sourceName, capabilities: this.adapter.capabilities }];
  }
}
