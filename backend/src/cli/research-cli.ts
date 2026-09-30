import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { AppModule } from '../app.module';
import { SourceRegistryService } from '../modules/data-sources/source-registry.service';
import { RealDataImportService } from '../modules/real-data-import/real-data-import.service';
import { RealDataParser } from '../modules/real-data-import/real-data.parser';
import { RealDataValidator } from '../modules/real-data-import/real-data.validator';
import { ScoringService } from '../modules/scoring/scoring.service';
import { ImportReport, RecordRejection } from '../modules/real-data-import/real-data.types';

type Mode = 'import' | 'validate' | 'sources';

interface CliOptions {
  mode: Mode;
  file: string;
  format: 'csv' | 'json';
  sourceName: string | null;
  rescore: boolean;
}

/**
 * CLI entry point for `npm run research:import` and `npm run research:validate`.
 *
 * Both accept a permitted CSV or JSON file and run it through the same pipeline the HTTP
 * endpoint uses — parse, validate, verification gate, persistence — so the two routes
 * cannot drift apart. `validate` stops before writing anything.
 */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // Quiet Nest's boot chatter so the report is the only thing on stdout.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  try {
    const registry = app.get(SourceRegistryService);
    printSourceState(registry);

    if (options.mode === 'sources') {
      printSourceDetail(registry);
      return;
    }

    const content = readFileSync(options.file, 'utf-8');

    if (options.mode === 'validate') {
      await runValidate(app, options, content);
    } else {
      await runImport(app, options, content);
    }
  } finally {
    await app.close();
  }
}

function parseArgs(argv: string[]): CliOptions {
  const mode: Mode = argv[0] === 'validate' ? 'validate' : argv[0] === 'sources' ? 'sources' : 'import';
  const positional = argv.slice(1).filter((arg) => !arg.startsWith('--'));
  const flag = (name: string): string | null => {
    const match = argv.find((arg) => arg.startsWith(`--${name}=`));
    return match ? match.split('=').slice(1).join('=') : null;
  };

  const file = flag('file') ?? positional[0];
  if (mode === 'sources') {
    return { mode, file: '', format: 'csv', sourceName: null, rescore: false };
  }
  if (!file) {
    console.error(
      `Usage:\n` +
        `  npm run research:validate -- --file=./my-research.csv\n` +
        `  npm run research:import   -- --file=./my-research.csv [--source="my source" --no-rescore]\n`,
    );
    process.exit(1);
  }

  const resolved = resolve(process.cwd(), file);
  const explicitFormat = flag('format');
  const format = explicitFormat === 'json' || explicitFormat === 'csv'
    ? explicitFormat
    : extname(resolved).toLowerCase() === '.json'
      ? 'json'
      : 'csv';

  return {
    mode,
    file: resolved,
    format,
    sourceName: flag('source'),
    rescore: !argv.includes('--no-rescore'),
  };
}

/** Requirement 14: never present an empty collection result without saying why. */
function printSourceState(registry: SourceRegistryService): void {
  const report = registry.getReport();

  if (report.state === 'NO_REAL_DATA_SOURCE_CONFIGURED') {
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│  NO REAL DATA SOURCE CONFIGURED                                 │');
    console.log('└─────────────────────────────────────────────────────────────────┘');
    console.log('  No permitted automated source is enabled with valid credentials.');
    console.log('  Manual CSV/JSON import is still available — that is what this command uses.');
    console.log(`  Candidate sources (config/data-sources.json, researched ${report.researchedAt}):`);
    for (const source of report.sources.filter((entry) => entry.automated)) {
      console.log(`    • ${source.label.padEnd(46)} ${source.blockedReason}`);
    }
    console.log('');
  } else {
    console.log(`Automated sources configured: ${report.message}\n`);
  }
}

/** Full per-source detail: what it provides, access, pricing, limits, terms. */
function printSourceDetail(registry: SourceRegistryService): void {
  const report = registry.getReport();
  console.log('CONFIGURED DATA SOURCES');
  console.log('─'.repeat(72));

  for (const source of report.sources) {
    console.log(`\n  ${source.label}  [${source.key}]`);
    console.log(`    status         ${source.usable ? 'USABLE' : `BLOCKED — ${source.blockedReason}`}`);
    console.log(`    kind           ${source.kind}${source.automated ? ' (automated)' : ' (manual)'}`);
    console.log(`    provides       ${source.provides.join(', ')}`);
    console.log(`    access         ${source.accessRequirements}`);
    console.log(`    pricing        ${source.pricing}`);
    console.log(`    rate limits    ${source.rateLimits}`);
    console.log(`    terms          ${source.termsNotes}`);
    if (source.docsUrl) {
      console.log(`    docs           ${source.docsUrl}`);
    }
    if (source.requiredEnv.length > 0) {
      console.log(`    required env   ${source.requiredEnv.join(', ')}`);
    }
  }
  console.log(`\n  Source facts researched ${report.researchedAt} — re-verify before relying on them.\n`);
}

async function runValidate(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  options: CliOptions,
  content: string,
): Promise<void> {
  const parser = app.get(RealDataParser);
  const validator = app.get(RealDataValidator);

  const { records, malformed } = parser.parse(content, options.format);
  const rejections: RecordRejection[] = [...malformed];
  const missingFields: Array<{ record: number; identifier: string | null; warnings: string[] }> = [];
  let accepted = 0;

  for (const parsed of records) {
    const result = validator.validate(parsed);
    if (!result.accepted && result.rejection) {
      rejections.push(result.rejection);
      continue;
    }
    accepted += 1;
    if (result.warnings.length > 0) {
      missingFields.push({ record: parsed.record, identifier: parsed.product.name, warnings: result.warnings });
    }
  }

  printReport({
    title: 'VALIDATION REPORT (dry run — nothing was written)',
    file: options.file,
    format: options.format,
    discovered: records.length + malformed.length,
    accepted,
    rejected: rejections.length,
    duplicates: 0,
    sourceName: options.sourceName ?? sourceNamesIn(records),
    rejections,
    missingFields,
  });

  if (rejections.length > 0) {
    process.exitCode = 1;
  }
}

async function runImport(
  app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>,
  options: CliOptions,
  content: string,
): Promise<void> {
  const importService = app.get(RealDataImportService);
  const run = await importService.startRun();
  const report: ImportReport = await importService.import(run, content, options.format);

  printReport({
    title: 'IMPORT REPORT',
    file: options.file,
    format: report.format,
    discovered: report.submitted,
    accepted: report.imported,
    rejected: report.rejected,
    duplicates: report.duplicatesInFile,
    sourceName: options.sourceName,
    rejections: report.rejections,
    missingFields: report.recordsMissingCriticalFields.map((entry) => ({
      record: entry.record,
      identifier: entry.identifier,
      warnings: entry.missing,
    })),
    extra: [
      ['Created', String(report.created)],
      ['Updated (matched existing)', String(report.updated)],
      ['VERIFIED claims refused', String(report.verificationDowngrades.length)],
      ['Run id', report.runId],
    ],
  });

  for (const downgrade of report.verificationDowngrades) {
    console.log(`  ! record ${downgrade.record} (${downgrade.identifier}) requested VERIFIED but did not earn it:`);
    for (const reason of downgrade.reasons) {
      console.log(`      - ${reason}`);
    }
  }

  if (options.rescore && report.imported > 0) {
    const scored = await app.get(ScoringService).rescoreAll();
    console.log(`\nRescored: ${scored.scored} COMPLETE, ${scored.incomplete} INCOMPLETE (missing critical inputs)`);
  }

  if (report.rejected > 0) {
    process.exitCode = 1;
  }
}

function sourceNamesIn(records: Array<{ product: { sourceName: string } }>): string | null {
  const names = [...new Set(records.map((entry) => entry.product.sourceName).filter(Boolean))];
  return names.length > 0 ? names.join(', ') : null;
}

/** The report shape requested: discovered / accepted / rejected / duplicates / missing / source / timestamp. */
function printReport(params: {
  title: string;
  file: string;
  format: string;
  discovered: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  sourceName: string | null;
  rejections: RecordRejection[];
  missingFields: Array<{ record: number; identifier: string | null; warnings: string[] }>;
  extra?: Array<[string, string]>;
}): void {
  const rows: Array<[string, string]> = [
    ['Records discovered', String(params.discovered)],
    ['Records accepted', String(params.accepted)],
    ['Records rejected', String(params.rejected)],
    ['Duplicates', String(params.duplicates)],
    ['Records missing critical fields', String(params.missingFields.length)],
    ['Source', params.sourceName ?? 'not stated'],
    ['File', basename(params.file)],
    ['Format', params.format],
    ['Collection timestamp', new Date().toISOString()],
    ...(params.extra ?? []),
  ];

  console.log(`\n${params.title}`);
  console.log('─'.repeat(72));
  for (const [label, value] of rows) {
    console.log(`  ${label.padEnd(34)} ${value}`);
  }
  console.log('─'.repeat(72));

  if (params.rejections.length > 0) {
    console.log('\nRejected records:');
    for (const rejection of params.rejections.sort((a, b) => a.record - b.record)) {
      console.log(`  record ${rejection.record} [${rejection.code}] ${rejection.identifier ?? ''}`);
      for (const error of rejection.errors) {
        console.log(`      - ${error}`);
      }
    }
  }

  if (params.missingFields.length > 0) {
    console.log('\nAccepted, but missing inputs the Final Score needs:');
    for (const entry of params.missingFields) {
      console.log(`  record ${entry.record} (${entry.identifier ?? ''}): ${entry.warnings.join('; ')}`);
    }
  }

  if (params.discovered === 0) {
    console.log('\n  The file contained no records. Nothing to do.');
  }
  console.log('');
}

main().catch((error) => {
  Logger.error((error as Error).message, (error as Error).stack, 'research-cli');
  process.exit(1);
});
