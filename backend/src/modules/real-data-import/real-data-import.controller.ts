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
import { RealDataImportJob, REAL_DATA_IMPORT_QUEUE } from './real-data-import.processor';
import { RealDataImportService } from './real-data-import.service';
import { RealDataParser } from './real-data.parser';
import { RealDataValidator } from './real-data.validator';
import { OPTIONAL_FIELDS, REQUIRED_FIELDS } from './real-data.types';

@Controller('real-data')
export class RealDataImportController {
  constructor(
    @InjectQueue(REAL_DATA_IMPORT_QUEUE) private readonly queue: Queue<RealDataImportJob>,
    private readonly importService: RealDataImportService,
    private readonly parser: RealDataParser,
    private readonly validator: RealDataValidator,
  ) {}

  /** The contract a submission must satisfy, so a client can check before sending. */
  @Get('schema')
  schema() {
    return {
      requiredFields: REQUIRED_FIELDS,
      optionalFields: OPTIONAL_FIELDS,
      acceptedFormats: ['csv', 'json'],
      rules: [
        'Placeholder and example URLs (example.com, example-research.com, *.test, demo paths) are rejected.',
        'Records sourced from seed_demo_data are rejected.',
        'dataset_status SAMPLE cannot be submitted here; it is reserved for seed data.',
        'Import never confers VERIFIED. Records land as UNVERIFIED unless they pass the verification gate.',
        'Only data you are permitted to collect and store may be submitted. No access controls may be circumvented to obtain it.',
      ],
    };
  }

  /**
   * Queues a real-data submission. Accepts a multipart file, or a raw body with
   * ?format=csv|json. Returns immediately with a runId; poll for the report.
   */
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
    @Query('format') formatParam: string | undefined,
    @Query('rescore') rescore: string | undefined,
  ) {
    const { content, format } = this.resolvePayload(file, body, formatParam);

    const run = await this.importService.startRun();
    await this.queue.add(
      'import-real-data',
      { runId: run.id, content, format, rescoreAfter: rescore !== 'false' },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 100 },
    );

    return {
      runId: run.id,
      status: run.status,
      format,
      message: 'Import queued. Poll /api/real-data/runs/:runId for the import report.',
    };
  }

  /** Dry run: parse and validate without writing anything, returning the same report shape. */
  @Post('validate')
  @UseInterceptors(FileInterceptor('file'))
  validateOnly(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
    @Query('format') formatParam: string | undefined,
  ) {
    const { content, format } = this.resolvePayload(file, body, formatParam);
    const { records, malformed } = this.parser.parse(content, format);

    const rejections = [...malformed];
    const warnings = [];
    let wouldImport = 0;

    for (const parsed of records) {
      const result = this.validator.validate(parsed);
      if (!result.accepted && result.rejection) {
        rejections.push(result.rejection);
        continue;
      }
      if (result.warnings.length > 0) {
        warnings.push({ record: parsed.record, identifier: parsed.product.name, warnings: result.warnings });
      }
      wouldImport += 1;
    }

    return {
      dryRun: true,
      format,
      submitted: records.length + malformed.length,
      wouldImport,
      wouldReject: rejections.length,
      rejections,
      warnings,
    };
  }

  @Get('runs/:id')
  async getRun(@Param('id') id: string) {
    const run = await this.importService.getRun(id);
    if (!run) {
      throw new NotFoundException(`No import run with id ${id}`);
    }
    return run;
  }

  private resolvePayload(
    file: Express.Multer.File | undefined,
    body: unknown,
    formatParam: string | undefined,
  ): { content: string; format: 'csv' | 'json' } {
    if (file) {
      const inferred = file.originalname?.toLowerCase().endsWith('.json') ? 'json' : 'csv';
      return { content: file.buffer.toString('utf-8'), format: this.normalizeFormat(formatParam) ?? inferred };
    }

    const record = (body ?? {}) as Record<string, unknown>;

    if (typeof record.csv === 'string' && record.csv.trim() !== '') {
      return { content: record.csv, format: 'csv' };
    }
    if (typeof record.json === 'string' && record.json.trim() !== '') {
      return { content: record.json, format: 'json' };
    }
    // A JSON body posted directly, e.g. { records: [...] } or a bare array.
    if (Array.isArray(body) || Array.isArray(record.records) || Array.isArray(record.products)) {
      return { content: JSON.stringify(body), format: 'json' };
    }

    throw new BadRequestException(
      'Provide a file upload (field "file"), a "csv"/"json" string in the body, or a JSON array of records.',
    );
  }

  private normalizeFormat(value: string | undefined): 'csv' | 'json' | null {
    if (value === 'csv' || value === 'json') {
      return value;
    }
    return null;
  }
}
