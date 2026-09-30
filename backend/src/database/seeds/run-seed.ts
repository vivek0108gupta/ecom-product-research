import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { ConfigFilesService } from '../../config/config-files.service';
import { configuration } from '../../config/configuration';
import { AppDataSource } from '../data-source';
import { DataSourceRecord } from '../entities/data-source.entity';
import { Marketplace } from '../entities/marketplace.entity';
import { MarketplaceFee } from '../entities/marketplace-fee.entity';
import { ScrapeRun } from '../entities/scrape-run.entity';
import { ManualCsvAdapter } from '../../modules/scraping/adapters/manual-csv.adapter';
import { IngestionService } from '../../modules/scraping/ingestion.service';
import { ValidationService } from '../../modules/scraping/validation.service';
import { ProfitabilityService } from '../../modules/profitability/profitability.service';
import { ScoringService } from '../../modules/scoring/scoring.service';
import { Product } from '../entities/product.entity';
import { ProductScore } from '../entities/product-score.entity';
import { SAMPLE_CSV_COLUMNS, SAMPLE_ROWS } from './sample-products.data';

const MARKETPLACES = [
  { slug: 'amazon_in', name: 'Amazon India', websiteUrl: 'https://www.amazon.in' },
  { slug: 'flipkart', name: 'Flipkart', websiteUrl: 'https://www.flipkart.com' },
  { slug: 'meesho', name: 'Meesho', websiteUrl: 'https://www.meesho.com' },
  { slug: 'own_store', name: 'Own D2C Store', websiteUrl: null },
];

const escapeCsv = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

function buildSampleCsv(): string {
  const header = SAMPLE_CSV_COLUMNS.join(',');
  const lines = SAMPLE_ROWS.map((row) => SAMPLE_CSV_COLUMNS.map((column) => escapeCsv(row[column] ?? '')).join(','));
  return [header, ...lines].join('\n');
}

async function main(): Promise<void> {
  const config = configuration();
  const fixturePath = resolve(__dirname, '../../modules/scraping/fixtures/sample-products.demo.csv');

  writeFileSync(fixturePath, buildSampleCsv(), 'utf-8');
  console.log(`Wrote demo CSV fixture (${SAMPLE_ROWS.length} rows) to ${fixturePath}`);

  await AppDataSource.initialize();

  // --- Marketplaces ---
  const marketplaceRepo = AppDataSource.getRepository(Marketplace);
  for (const entry of MARKETPLACES) {
    const existing = await marketplaceRepo.findOne({ where: { slug: entry.slug } });
    if (!existing) {
      await marketplaceRepo.save(marketplaceRepo.create(entry));
    }
  }
  console.log(`Marketplaces ready: ${MARKETPLACES.map((m) => m.slug).join(', ')}`);

  // --- Fee assumptions (data, not code) ---
  const feeRepo = AppDataSource.getRepository(MarketplaceFee);
  const feeConfig = JSON.parse(readFileSync(config.configPaths.marketplaceFees, 'utf-8')) as {
    fees: Array<{ marketplace: string; category: string; feeType: string; value: number; source: string; effectiveDate: string }>;
  };

  for (const fee of feeConfig.fees) {
    const marketplace = await marketplaceRepo.findOne({ where: { slug: fee.marketplace } });
    if (!marketplace) {
      console.warn(`Skipping fee for unknown marketplace '${fee.marketplace}'`);
      continue;
    }
    const existing = await feeRepo.findOne({
      where: { marketplaceId: marketplace.id, category: fee.category, feeType: fee.feeType as never, effectiveDate: fee.effectiveDate },
    });
    if (!existing) {
      await feeRepo.save(
        feeRepo.create({
          marketplaceId: marketplace.id,
          category: fee.category,
          feeType: fee.feeType as never,
          feeValue: String(fee.value),
          source: fee.source,
          effectiveDate: fee.effectiveDate,
        }),
      );
    }
  }
  console.log(`Fee assumptions loaded: ${feeConfig.fees.length} rows from ${config.configPaths.marketplaceFees}`);

  // --- Ingest the demo CSV through the real adapter + validation path ---
  const configFiles = new ConfigFilesService({
    get: (key: string) => (key === 'configPaths.scoring' ? config.configPaths.scoring : config.configPaths.categories),
  } as never);
  configFiles.reload();

  const validation = new ValidationService(configFiles);
  const adapter = new ManualCsvAdapter();
  const ingestion = new IngestionService(
    AppDataSource,
    validation,
    marketplaceRepo,
    AppDataSource.getRepository(DataSourceRecord),
    AppDataSource.getRepository(ScrapeRun),
  );

  const run = await ingestion.startRun(adapter.sourceName);
  await ingestion.markRunning(run.id);
  const loadedRun = (await ingestion.getRun(run.id))!;
  loadedRun.dataSource = (await AppDataSource.getRepository(DataSourceRecord).findOneOrFail({ where: { id: run.dataSourceId } }));

  const { products, malformed } = adapter.parseCsv(readFileSync(fixturePath, 'utf-8'));
  const summary = await ingestion.ingest(loadedRun, products, malformed);
  console.log(
    `Ingestion: ${summary.created} created, ${summary.updated} updated, ${summary.skippedDuplicate} duplicates, ${summary.rejected} rejected`,
  );
  if (summary.rejections.length > 0) {
    console.log('Rejections:', JSON.stringify(summary.rejections, null, 2));
  }

  // --- Score everything ---
  const profitability = new ProfitabilityService(feeRepo);
  const scoring = new ScoringService(
    AppDataSource.getRepository(Product),
    AppDataSource.getRepository(ProductScore),
    profitability,
    configFiles,
  );
  const scored = await scoring.rescoreAll();
  console.log(`Scoring: ${scored.scored} scored COMPLETE, ${scored.incomplete} INCOMPLETE (missing critical inputs — no final score issued)`);

  await AppDataSource.destroy();
  console.log('\nSeed complete. NOTE: every seeded product is demo data (dataset_status=SAMPLE) and describes no real listing.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
