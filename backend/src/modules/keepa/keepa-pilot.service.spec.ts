import { SourceRegistryService } from '../data-sources/source-registry.service';
import { SourceStatus } from '../data-sources/source-registry.types';
import { RealDataImportService } from '../real-data-import/real-data-import.service';
import { KeepaClient } from './keepa.client';
import { KeepaProductSourceAdapter } from './keepa-product-source.adapter';
import {
  KeepaPilotService,
  PILOT_DEFAULT_MAX_PRODUCTS,
  PILOT_HARD_MAX_PRODUCTS,
} from './keepa-pilot.service';

/**
 * Any call to this means a Keepa request escaped a guard. It throws rather than returning
 * a stub so a leak fails loudly instead of silently succeeding against a mock.
 */
const forbiddenFetch = jest.fn(() => {
  throw new Error('NETWORK CALL ATTEMPTED — the pilot sent a request it should not have');
}) as unknown as typeof fetch;

const sourceStatus = (overrides: Partial<SourceStatus> = {}): SourceStatus =>
  ({
    key: 'keepa',
    label: 'Keepa API',
    adapter: 'KeepaProductSourceAdapter',
    kind: 'licensed_api',
    enabled: true,
    requiredEnv: ['KEEPA_API_KEY'],
    provides: [],
    capabilities: { searchProducts: true, getProductDetails: true, getPricing: true, getReviews: false, getCategories: true },
    accessRequirements: '',
    pricing: '',
    rateLimits: '',
    termsNotes: '',
    automated: true,
    usable: true,
    missingEnv: [],
    adapterImplemented: true,
    blockedReason: null,
    ...overrides,
  }) as SourceStatus;

const registryWith = (status: SourceStatus | null): SourceRegistryService =>
  ({ getSource: () => status }) as unknown as SourceRegistryService;

/** An import service that fails the test if the pilot ever tries to persist. */
const forbiddenImportService = {
  startRun: () => {
    throw new Error('PERSISTENCE ATTEMPTED — the pilot wrote without collecting');
  },
  ingestRecords: () => {
    throw new Error('PERSISTENCE ATTEMPTED — the pilot wrote without collecting');
  },
} as unknown as RealDataImportService;

const buildPilot = (options: { apiKey?: string; source?: SourceStatus | null; importService?: RealDataImportService } = {}) => {
  const client = new KeepaClient(() => options.apiKey, { fetchImpl: forbiddenFetch });
  const adapter = new KeepaProductSourceAdapter(client);
  return new KeepaPilotService(
    adapter,
    client,
    registryWith(options.source === undefined ? sourceStatus() : options.source),
    options.importService ?? forbiddenImportService,
  );
};

beforeEach(() => (forbiddenFetch as unknown as jest.Mock).mockClear());

describe('KeepaPilotService — zero requests without --confirm-cost', () => {
  it('makes no request when confirmCost is false, even when fully configured', async () => {
    const pilot = buildPilot({ apiKey: 'live-key' });

    const result = await pilot.run({
      asins: ['B0AAAAAAAA', 'B0BBBBBBBB'],
      confirmCost: false,
      category: 'home-organization',
    });

    expect(result.executed).toBe(false);
    expect(result.collection).toBeNull();
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });

  it('still returns a full cost estimate while sending nothing', async () => {
    const result = await buildPilot({ apiKey: 'live-key' }).run({
      asins: ['B0AAAAAAAA'],
      confirmCost: false,
      category: 'home-organization',
    });

    expect(result.estimate.estimatedTokens).toBeGreaterThan(0);
    expect(result.estimate.productsRequested).toBe(1);
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });

  it('never persists anything on a dry run', async () => {
    await expect(
      buildPilot({ apiKey: 'live-key' }).run({ asins: ['B0AAAAAAAA'], confirmCost: false, category: 'home-organization' }),
    ).resolves.toMatchObject({ executed: false });
  });

  it('estimates for the cap when no ASINs are supplied, so a bare run still shows cost', async () => {
    const result = await buildPilot({ apiKey: 'live-key' }).run({
      asins: [],
      confirmCost: false,
      category: 'home-organization',
    });

    expect(result.estimate.productsRequested).toBe(PILOT_DEFAULT_MAX_PRODUCTS);
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });
});

describe('KeepaPilotService — preflight blocks every path to the network', () => {
  it.each([
    ['no API key', { apiKey: undefined, source: sourceStatus() }],
    ['source disabled', { apiKey: 'live-key', source: sourceStatus({ enabled: false }) }],
    ['adapter unregistered', { apiKey: 'live-key', source: sourceStatus({ adapterImplemented: false }) }],
    ['source absent from config', { apiKey: 'live-key', source: null }],
  ])('refuses to run with %s, even with --confirm-cost', async (_label, options) => {
    const result = await buildPilot(options).run({
      asins: ['B0AAAAAAAA'],
      confirmCost: true,
      category: 'home-organization',
    });

    expect(result.executed).toBe(false);
    expect(result.preflight.ready).toBe(false);
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });

  it('requires all three conditions together', () => {
    expect(buildPilot({ apiKey: 'live-key' }).preflight().ready).toBe(true);
    expect(buildPilot({ apiKey: undefined }).preflight().ready).toBe(false);
  });

  it('reports every blocker rather than only the first', () => {
    const preflight = buildPilot({ apiKey: undefined, source: sourceStatus({ enabled: false, adapterImplemented: false }) }).preflight();

    expect(preflight.blockers).toHaveLength(3);
    expect(preflight.blockers.join(' ')).toContain('KEEPA_NOT_CONFIGURED');
    expect(preflight.blockers.join(' ')).toContain('not enabled');
    expect(preflight.blockers.join(' ')).toContain('not registered');
  });

  it('makes no request when confirmCost is set but no ASINs were supplied', async () => {
    const result = await buildPilot({ apiKey: 'live-key' }).run({
      asins: [],
      confirmCost: true,
      category: 'home-organization',
    });

    expect(result.executed).toBe(false);
    expect(result.estimate.notes.join(' ')).toContain('no ASINs supplied');
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });
});

describe('KeepaPilotService — MAX_PRODUCTS', () => {
  const originalMax = process.env.MAX_PRODUCTS;

  afterEach(() => {
    if (originalMax === undefined) {
      delete process.env.MAX_PRODUCTS;
    } else {
      process.env.MAX_PRODUCTS = originalMax;
    }
  });

  it('defaults to 10', () => {
    delete process.env.MAX_PRODUCTS;
    expect(buildPilot().resolveMaxProducts().maxProducts).toBe(PILOT_DEFAULT_MAX_PRODUCTS);
  });

  it('reads MAX_PRODUCTS from the environment', () => {
    process.env.MAX_PRODUCTS = '50';
    const resolved = buildPilot().resolveMaxProducts();

    expect(resolved.maxProducts).toBe(50);
    expect(resolved.notes.join(' ')).toContain('MAX_PRODUCTS=50');
  });

  it('caps at the pilot hard limit of 100', () => {
    process.env.MAX_PRODUCTS = '5000';
    const resolved = buildPilot().resolveMaxProducts();

    expect(resolved.maxProducts).toBe(PILOT_HARD_MAX_PRODUCTS);
    expect(resolved.notes.join(' ')).toContain('capped at the pilot hard limit');
  });

  it('caps an explicit flag at the hard limit too', () => {
    expect(buildPilot().resolveMaxProducts(999).maxProducts).toBe(PILOT_HARD_MAX_PRODUCTS);
  });

  it('raises a nonsensical value to 1 rather than requesting zero products', () => {
    expect(buildPilot().resolveMaxProducts(0).maxProducts).toBe(1);
    expect(buildPilot().resolveMaxProducts(-5).maxProducts).toBe(1);
  });

  it('trims a longer ASIN list down to the cap and says so', async () => {
    const asins = Array.from({ length: 25 }, (_, index) => `B0${String(index).padStart(8, '0')}`);
    const result = await buildPilot({ apiKey: 'live-key' }).run({
      asins,
      maxProducts: 10,
      confirmCost: false,
      category: 'home-organization',
    });

    expect(result.estimate.productsRequested).toBe(10);
    expect(result.estimate.notes.join(' ')).toContain('trimmed to the cap of 10');
  });
});

describe('KeepaPilotService — executes when confirmed', () => {
  const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

  /** A minimal Keepa payload shaped like the documented product object. */
  const keepaBody = {
    tokensLeft: 1170,
    refillRate: 20,
    tokensConsumed: 6,
    products: [
      {
        asin: 'B0AAAAAAAA',
        productType: 0,
        title: 'Collected product A',
        brand: 'BrandA',
        stats: { buyBoxPrice: 100000, current: [100000, 99000, -1, 1000, 200000, -1, -1, -1, -1, -1, -1, 5, 0] },
        availabilityAmazon: 0,
        csv: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, [7100000, 40], [7100000, 100]],
      },
      { asin: 'B0BBBBBBBB', productType: 4, title: 'Invalid product' },
    ],
  };

  const buildExecutingPilot = () => {
    const fetchImpl = jest.fn(async () => okResponse(keepaBody)) as unknown as typeof fetch;
    const client = new KeepaClient(() => 'live-key', { fetchImpl, sleep: async () => undefined });

    const ingestRecords = jest.fn(async (_run: unknown, records: unknown[], preRejected: unknown[]) => ({
      runId: 'run-1',
      format: 'json' as const,
      submitted: (records as unknown[]).length + (preRejected as unknown[]).length,
      imported: (records as unknown[]).length,
      created: (records as unknown[]).length,
      updated: 0,
      rejected: (preRejected as unknown[]).length,
      duplicatesInFile: 0,
      duplicatesMergedIntoExisting: 0,
      recordsMissingCriticalFields: [{ record: 1, identifier: 'Collected product A', missing: ['supplier_cost'] }],
      rejections: preRejected as never[],
      warnings: [],
      verificationDowngrades: [],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    }));

    const importService = { startRun: jest.fn(async () => ({ id: 'run-1' })), ingestRecords } as unknown as RealDataImportService;

    const pilot = new KeepaPilotService(
      new KeepaProductSourceAdapter(client),
      client,
      registryWith(sourceStatus()),
      importService,
    );
    return { pilot, fetchImpl, ingestRecords };
  };

  it('makes the request and reports the collection when --confirm-cost is given', async () => {
    const { pilot, fetchImpl } = buildExecutingPilot();

    const result = await pilot.run({
      asins: ['B0AAAAAAAA', 'B0BBBBBBBB'],
      confirmCost: true,
      category: 'home-organization',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.executed).toBe(true);
    expect(result.collection!.productsRequested).toBe(2);
    expect(result.collection!.productsReceived).toBe(2);
    expect(result.collection!.tokensConsumed).toBe(6);
    expect(result.collection!.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects an unusable product instead of importing it', async () => {
    const { pilot, ingestRecords } = buildExecutingPilot();

    await pilot.run({ asins: ['B0AAAAAAAA', 'B0BBBBBBBB'], confirmCost: true, category: 'home-organization' });

    const [, records, preRejected] = ingestRecords.mock.calls[0];
    expect((records as unknown[]).length).toBe(1);
    expect((preRejected as Array<{ identifier: string }>)[0].identifier).toBe('B0BBBBBBBB');
  });

  it('never requests VERIFIED for a collected product', async () => {
    const { pilot, ingestRecords } = buildExecutingPilot();

    await pilot.run({ asins: ['B0AAAAAAAA'], confirmCost: true, category: 'home-organization' });

    const records = ingestRecords.mock.calls[0][1] as Array<{ verificationRequested: boolean; product: { datasetStatus: string } }>;
    expect(records[0].verificationRequested).toBe(false);
    expect(records[0].product.datasetStatus).toBe('UNVERIFIED');
  });

  it('stores source_name=keepa and the collection timestamp on every record', async () => {
    const { pilot, ingestRecords } = buildExecutingPilot();

    await pilot.run({ asins: ['B0AAAAAAAA'], confirmCost: true, category: 'home-organization' });

    const records = ingestRecords.mock.calls[0][1] as Array<{ product: { sourceName: string; collectedAt: Date; externalId: string } }>;
    expect(records[0].product.sourceName).toBe('keepa');
    expect(records[0].product.externalId).toBe('B0AAAAAAAA');
    expect(records[0].product.collectedAt).toBeInstanceOf(Date);
  });

  it('derives no supplier cost from the Amazon price', async () => {
    const { pilot, ingestRecords } = buildExecutingPilot();

    await pilot.run({ asins: ['B0AAAAAAAA'], confirmCost: true, category: 'home-organization' });

    const records = ingestRecords.mock.calls[0][1] as Array<{ product: { costs: unknown; sellingPrice: number } }>;
    expect(records[0].product.sellingPrice).toBe(1000);
    expect(records[0].product.costs).toBeNull();
  });

  it('writes only OBSERVED values into the provenance ledger', async () => {
    const { pilot, ingestRecords } = buildExecutingPilot();

    await pilot.run({ asins: ['B0AAAAAAAA'], confirmCost: true, category: 'home-organization' });

    const records = ingestRecords.mock.calls[0][1] as Array<{ observations: Array<{ fieldName: string }> }>;
    const fields = records[0].observations.map((entry) => entry.fieldName);

    expect(fields).toContain('buy_box_price');
    // observed_price and discount_percentage are CALCULATED, so they must not appear.
    expect(fields).not.toContain('observed_price');
    expect(fields).not.toContain('discount_percentage');
  });

  it('surfaces the missing supplier cost in the report', async () => {
    const { pilot } = buildExecutingPilot();

    const result = await pilot.run({ asins: ['B0AAAAAAAA'], confirmCost: true, category: 'home-organization' });

    expect(result.collection!.recordsMissingFields).toBe(1);
    expect(result.collection!.missingFieldDetail[0].missing).toContain('supplier_cost');
  });
});

describe('KeepaPilotService — cost estimation', () => {
  it('uses the documented token costs', () => {
    const pilot = buildPilot();

    expect(pilot.estimate(10, 10, false).estimatedTokens).toBe(10);
    expect(pilot.estimate(10, 10, true).estimatedTokens).toBe(30);
  });

  it('warns when a run needs more tokens than a bucket can hold', () => {
    const client = new KeepaClient(() => 'k', { fetchImpl: forbiddenFetch });
    client.tokens.update({ tokensLeft: 100, refillRate: 20, refillInMs: 0, observedAt: new Date() });

    const pilot = new KeepaPilotService(
      new KeepaProductSourceAdapter(client),
      client,
      registryWith(sourceStatus()),
      forbiddenImportService,
    );

    // 100 products with Buy Box = 300 tokens; a 20/min bucket holds at most 1200, so not exceeded.
    expect(pilot.estimate(100, 100, true).exceedsBucketCapacity).toBe(false);
    // 500 with Buy Box = 1500 tokens, which is beyond a full bucket.
    expect(pilot.estimate(500, 500, true).exceedsBucketCapacity).toBe(true);
    expect(pilot.estimate(500, 500, true).notes.join(' ')).toContain('wait for refills mid-run');
  });

  it('reports unknown availability before any response has been seen', () => {
    const estimate = buildPilot({ apiKey: 'k' }).estimate(10, 10, true);

    expect(estimate.tokensAvailable).toBeNull();
    expect(estimate.notes.join(' ')).toContain('cold bucket');
  });
});
