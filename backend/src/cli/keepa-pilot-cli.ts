import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from '../app.module';
import { KeepaPilotService, PILOT_HARD_MAX_PRODUCTS } from '../modules/keepa/keepa-pilot.service';
import { PilotEstimate, PilotPreflight, PilotResult } from '../modules/keepa/keepa-pilot.service';

const RULE = '─'.repeat(72);

interface PilotArgs {
  confirmCost: boolean;
  maxProducts?: number;
  asins: string[];
  category: string;
  withBuyBox: boolean;
}

function parseArgs(argv: string[]): PilotArgs {
  const flag = (name: string): string | null => {
    const match = argv.find((arg) => arg.startsWith(`--${name}=`));
    return match ? match.split('=').slice(1).join('=') : null;
  };

  const asinsInline = (flag('asins') ?? '')
    .split(',')
    .map((asin) => asin.trim())
    .filter(Boolean);

  const asinFile = flag('asin-file');
  let asinsFromFile: string[] = [];
  if (asinFile) {
    const path = resolve(process.cwd(), asinFile);
    if (!existsSync(path)) {
      console.error(`--asin-file not found: ${path}`);
      process.exit(1);
    }
    asinsFromFile = readFileSync(path, 'utf-8')
      .split(/[\s,]+/)
      .map((asin) => asin.trim())
      .filter(Boolean);
  }

  const max = flag('max');
  return {
    confirmCost: argv.includes('--confirm-cost'),
    maxProducts: max !== null ? Number.parseInt(max, 10) : undefined,
    asins: [...new Set([...asinsInline, ...asinsFromFile])],
    category: flag('category') ?? 'home-organization',
    withBuyBox: !argv.includes('--no-buybox'),
  };
}

function printPreflight(preflight: PilotPreflight): void {
  console.log('\nPREFLIGHT');
  console.log(RULE);
  console.log(`  API key present        ${preflight.apiKeyPresent ? 'yes' : 'NO'}`);
  console.log(`  Keepa source enabled   ${preflight.sourceEnabled ? 'yes' : 'NO'}`);
  console.log(`  Adapter registered     ${preflight.adapterRegistered ? 'yes' : 'NO'}`);
  console.log(`  Ready                  ${preflight.ready ? 'YES' : 'NO'}`);
  for (const blocker of preflight.blockers) {
    console.log(`    ✗ ${blocker}`);
  }
}

function printEstimate(estimate: PilotEstimate, withBuyBox: boolean): void {
  const seconds = estimate.estimatedSeconds;
  const time =
    seconds === null ? 'unknown (no token state observed yet)' : seconds < 60 ? `~${seconds}s` : `~${Math.ceil(seconds / 60)} min`;

  console.log('\nCOST ESTIMATE (no request has been made)');
  console.log(RULE);
  console.log(`  Products requested         ${estimate.productsRequested}`);
  console.log(`  Pilot cap (MAX_PRODUCTS)   ${estimate.maxProducts}  (hard limit ${PILOT_HARD_MAX_PRODUCTS})`);
  console.log(`  Buy Box data               ${withBuyBox ? 'yes (+2 tokens/product)' : 'no'}`);
  console.log(`  Estimated token cost       ${estimate.estimatedTokens}`);
  console.log(`  Tokens available now       ${estimate.tokensAvailable ?? 'unknown'}`);
  console.log(`  Refill rate                ${estimate.refillRatePerMinute ?? 'unknown'} tokens/min`);
  console.log(`  Estimated execution time   ${time}`);
  for (const note of estimate.notes) {
    console.log(`    note: ${note}`);
  }
  console.log(RULE);
}

function printCollection(result: PilotResult): void {
  const collection = result.collection;
  if (!collection) {
    return;
  }

  console.log('\nCOLLECTION REPORT');
  console.log(RULE);
  console.log(`  Products requested     ${collection.productsRequested}`);
  console.log(`  Products received      ${collection.productsReceived}`);
  console.log(`  Products rejected      ${collection.productsRejected}`);
  console.log(`  Duplicates             ${collection.duplicates}`);
  console.log(`  Missing fields         ${collection.recordsMissingFields}`);
  console.log(`  Token consumption      ${collection.tokensConsumed ?? 'not reported'}`);
  console.log(`  Remaining tokens       ${collection.tokensRemaining ?? 'unknown'}`);
  console.log(`  Elapsed time           ${(collection.elapsedMs / 1000).toFixed(1)}s`);
  console.log(RULE);

  if (collection.rejections.length > 0) {
    console.log('\n  Rejections:');
    for (const rejection of collection.rejections) {
      console.log(`    [${rejection.code}] ${rejection.identifier ?? ''}: ${rejection.errors.join('; ')}`);
    }
  }

  if (collection.missingFieldDetail.length > 0) {
    console.log('\n  Imported, but missing inputs the Final Score needs:');
    for (const entry of collection.missingFieldDetail) {
      console.log(`    ${entry.identifier ?? ''}: ${entry.missing.join(', ')}`);
    }
    console.log(
      '\n  Expected: Keepa reports the Amazon selling price, never a supplier cost.\n' +
        '  Supply real supplier quotes through the manual pipeline to complete these.',
    );
  }

  console.log('\n  All collected products stored as UNVERIFIED with source_name=keepa.');
  console.log('  Collection is not verification, and no supplier cost was derived from the listing price.\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });

  try {
    const pilot = app.get(KeepaPilotService);

    const result = await pilot.run({
      asins: args.asins,
      maxProducts: args.maxProducts,
      confirmCost: args.confirmCost,
      category: args.category,
      withBuyBox: args.withBuyBox,
    });

    printPreflight(result.preflight);
    printEstimate(result.estimate, args.withBuyBox);

    if (result.executed) {
      printCollection(result);
      return;
    }

    // Nothing was sent. Explain which brake stopped the run.
    if (!args.confirmCost) {
      console.log('\n  DRY RUN — no Keepa request was made.');
      console.log('  Re-run with --confirm-cost to spend the tokens above:\n');
      console.log('    npm run research:keepa:pilot -- --confirm-cost --asins=B0XXXXXXXX,B0YYYYYYYY\n');
    } else if (!result.preflight.ready) {
      console.log('\n  BLOCKED — preflight failed, so no request was made. Fix the items above.\n');
      process.exitCode = 1;
    } else {
      console.log('\n  NO ASINS SUPPLIED — nothing to collect, so no request was made.');
      console.log('  Pass --asins=B0XXXXXXXX,... or --asin-file=./asins.txt\n');
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  Logger.error((error as Error).message, (error as Error).stack, 'keepa-pilot');
  process.exit(1);
});
