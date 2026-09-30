import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { DataOrigin, DatasetStatus } from '../common/interfaces/enums';
import { Product } from '../database/entities/product.entity';
import { ScrapeRun } from '../database/entities/scrape-run.entity';
import { SourceRegistryService } from '../modules/data-sources/source-registry.service';
import { KeepaProductSourceAdapter } from '../modules/keepa/keepa-product-source.adapter';
import { KeepaTokenBucket } from '../modules/keepa/keepa-token-bucket';
import { KEEPA_SOURCE_NAME } from '../modules/keepa/keepa.mapper';
import { KeepaResponse } from '../modules/keepa/keepa.types';
import { ProfitabilityService } from '../modules/profitability/profitability.service';
import { RealDataValidator } from '../modules/real-data-import/real-data.validator';
import { assessVerification } from '../modules/scraping/verification';

const FIXTURE_PATH = resolve(__dirname, '../modules/keepa/fixtures/keepa-product.fixture.json');

async function main(): Promise<void> {
  const mode = process.argv[2] === 'status' ? 'status' : 'test';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  try {
    if (mode === 'status') {
      await printStatus(app);
    } else {
      await runFixturePipeline(app);
    }
  } finally {
    await app.close();
  }
}

/**
 * `research:keepa:status` — configuration, credentials, adapter, database, freshness, counts.
 */
async function printStatus(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>): Promise<void> {
  const adapter = app.get(KeepaProductSourceAdapter);
  const registry = app.get(SourceRegistryService);
  const status = adapter.getStatus();
  const source = registry.getSource('keepa');

  console.log('\nKEEPA STATUS');
  console.log('─'.repeat(72));
  console.log(`  State                        ${status.state}`);
  console.log(`  API key present              ${status.apiKeyPresent ? 'yes' : 'no  (KEEPA_API_KEY is unset)'}`);
  console.log(`  Adapter implemented          yes (KeepaProductSourceAdapter)`);
  console.log(`  Registered in source config  ${source ? `yes — ${source.usable ? 'USABLE' : `blocked: ${source.blockedReason}`}` : 'no'}`);
  console.log(`  Amazon domain                ${status.domain} (amazon.in)`);

  // --- Database connectivity ---
  let dbOnline = false;
  let productCount = 0;
  let keepaProductCount = 0;
  let lastRun: ScrapeRun | null = null;
  let newestCollectedAt: Date | null = null;

  try {
    const dataSource = app.get(DataSource);
    dbOnline = dataSource.isInitialized;
    const productRepo = dataSource.getRepository(Product);
    productCount = await productRepo.count();
    keepaProductCount = await productRepo.count({ where: { sourceName: KEEPA_SOURCE_NAME } });

    const newest = await productRepo.findOne({
      where: { sourceName: KEEPA_SOURCE_NAME },
      order: { collectedAt: 'DESC' },
    });
    newestCollectedAt = newest?.collectedAt ?? null;

    lastRun = await dataSource.getRepository(ScrapeRun).findOne({
      where: { status: 'completed' as never },
      order: { finishedAt: 'DESC' },
      relations: { dataSource: true },
    });
  } catch (error) {
    console.log(`  Database                     UNREACHABLE — ${(error as Error).message}`);
  }

  if (dbOnline) {
    console.log(`  Database                     connected`);
    console.log(`  Products (all sources)       ${productCount}`);
    console.log(`  Products from Keepa          ${keepaProductCount}`);
    console.log(
      `  Last successful collection   ${
        lastRun?.finishedAt ? `${lastRun.finishedAt.toISOString()} via ${lastRun.dataSource?.name ?? 'unknown'}` : 'none recorded'
      }`,
    );
    console.log(
      `  Keepa data freshness         ${
        newestCollectedAt ? `${newestCollectedAt.toISOString()} (${ageInHours(newestCollectedAt)}h old)` : 'no Keepa data collected yet'
      }`,
    );
  }

  console.log('─'.repeat(72));
  if (!status.apiKeyPresent) {
    console.log('\n  KEEPA_NOT_CONFIGURED — no network request will be attempted.');
    console.log('  To activate, see "Activating Keepa" in the README.\n');
  } else {
    const tokens = status.tokens;
    console.log(`\n  Token bucket: ${tokens.projected ?? 'unknown'} projected, refill ${tokens.refillRatePerMinute ?? '?'}/min\n`);
  }
}

const ageInHours = (date: Date): number => Math.round(((Date.now() - date.getTime()) / 3_600_000) * 10) / 10;

/**
 * `research:keepa:test` — runs the committed fixture through map -> validate -> verification
 * gate -> profitability -> scoring inputs, with no network access and no database writes.
 *
 * Nothing is persisted on purpose: the fixture is schema-shaped placeholder data, and the
 * one rule this project holds above all others is that invented values never enter the
 * dataset. The pipeline is still exercised end to end, in memory.
 */
async function runFixturePipeline(app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>): Promise<void> {
  const adapter = app.get(KeepaProductSourceAdapter);
  const validator = app.get(RealDataValidator);
  const profitability = app.get(ProfitabilityService);

  console.log('\nKEEPA FIXTURE PIPELINE (offline — no API request, no database write)');
  console.log('─'.repeat(72));

  const status = adapter.getStatus();
  console.log(`  Adapter state: ${status.state}${status.apiKeyPresent ? '' : ' (this is the expected dry-run state)'}`);

  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as KeepaResponse & { _README: string[] };
  console.log(`  Fixture: ${FIXTURE_PATH.split('/').slice(-1)[0]} — ${fixture.products?.length ?? 0} product objects`);
  console.log(`  ${fixture._README[0]}`);
  console.log('─'.repeat(72));

  const collectedAt = new Date();
  const mapped = adapter.mapProducts(fixture.products ?? [], { collectedAt, category: 'home-organization' });

  for (const result of mapped) {
    const asin = result.product.externalId ?? '(no ASIN)';
    console.log(`\n  ASIN ${asin}`);

    if (result.unusableReasons.length > 0) {
      console.log(`    REJECTED: ${result.unusableReasons.join('; ')}`);
      continue;
    }

    // --- Origin separation (requirement 8) ---
    const byOrigin = (origin: DataOrigin) => result.fields.filter((field) => field.origin === origin && field.value !== null);
    console.log(`    OBSERVED   (${byOrigin(DataOrigin.OBSERVED).length} fields from Keepa)`);
    for (const field of byOrigin(DataOrigin.OBSERVED)) {
      console.log(`      ${field.field.padEnd(30)} ${String(field.value).slice(0, 40).padEnd(42)} ← ${field.derivation}`);
    }
    console.log(`    CALCULATED (${byOrigin(DataOrigin.CALCULATED).length} derived by formula)`);
    for (const field of byOrigin(DataOrigin.CALCULATED)) {
      console.log(`      ${field.field.padEnd(30)} ${String(field.value).slice(0, 40).padEnd(42)} ← ${field.derivation}`);
    }
    console.log(`    INFERRED   (0 — this system infers nothing)`);

    console.log(`    History: ${result.priceHistory.length} price points, ${result.salesRankHistory.length} sales-rank points`);

    // --- Validation ---
    const validation = validator.validate({ record: 1, product: result.product, observations: [], verificationRequested: false });
    console.log(`    Validation: ${validation.accepted ? 'ACCEPTED' : `REJECTED [${validation.rejection?.code}]`}`);
    for (const warning of validation.warnings) {
      console.log(`      warn: ${warning}`);
    }
    if (validation.rejection) {
      for (const error of validation.rejection.errors) {
        console.log(`      error: ${error}`);
      }
    }

    // --- Verification gate ---
    const verification = assessVerification({ ...result.product, datasetStatus: DatasetStatus.VERIFIED });
    console.log(`    If VERIFIED were requested: ${verification.datasetStatus}${verification.downgraded ? ' (refused)' : ''}`);
    for (const reason of verification.reasons.slice(0, 2)) {
      console.log(`      - ${reason}`);
    }

    // --- Profitability ---
    const profit = await profitability
      .calculateForProduct({
        marketplaceId: '00000000-0000-0000-0000-000000000000',
        category: 'home-organization',
        sellingPrice: result.product.sellingPrice,
        cost: null,
      })
      .catch(() => null);
    console.log(
      `    Profitability: ${
        profit?.isReliable ? `₹${profit.profitPerUnit} (${profit.profitMarginPercentage}%)` : 'WITHHELD — no supplier cost'
      }`,
    );

    console.log(`    Dataset status: ${result.product.datasetStatus} (never VERIFIED on download alone)`);
    for (const note of result.notes) {
      console.log(`    note: ${note}`);
    }
  }

  // --- Token budgeting for a real run ---
  console.log(`\n${'─'.repeat(72)}`);
  console.log('  TOKEN BUDGET (documented Keepa costs, no request made)');
  for (const count of [100, 500]) {
    const plain = KeepaTokenBucket.estimateProductCost(count);
    const withBuyBox = KeepaTokenBucket.estimateProductCost(count, { withBuyBox: true });
    console.log(`    ${String(count).padStart(4)} ASINs: ${plain} tokens plain, ${withBuyBox} with Buy Box`);
    console.log(`              at 20 tokens/min (Starter): ~${Math.ceil(withBuyBox / 20)} minutes`);
  }
  console.log(`${'─'.repeat(72)}\n`);
  console.log('  Nothing was written to the database. Fixture data never enters the dataset.\n');
}

main().catch((error) => {
  Logger.error((error as Error).message, (error as Error).stack, 'keepa-cli');
  process.exit(1);
});
