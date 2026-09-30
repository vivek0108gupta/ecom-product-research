import { ConfigService } from '@nestjs/config';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { SourceDefinition } from './source-registry.types';
import { NO_SOURCE_MESSAGE, SourceRegistryService } from './source-registry.service';

const source = (overrides: Partial<SourceDefinition> = {}): SourceDefinition => ({
  key: 'keepa',
  label: 'Keepa API',
  adapter: 'KeepaAdapter',
  kind: 'licensed_api',
  enabled: true,
  requiredEnv: ['KEEPA_API_KEY'],
  provides: ['product', 'pricing'],
  capabilities: { searchProducts: true, getProductDetails: true, getPricing: true, getReviews: false, getCategories: true },
  accessRequirements: 'Paid subscription',
  pricing: 'From EUR 49/month',
  rateLimits: 'Token bucket',
  termsNotes: 'Check redistribution limits',
  automated: true,
  ...overrides,
});

/** Writes a throwaway config file and returns a service pointed at it. */
const serviceFor = (sources: SourceDefinition[], researchedAt = '2026-09-29'): SourceRegistryService => {
  const dir = mkdtempSync(join(tmpdir(), 'source-registry-'));
  const path = join(dir, 'data-sources.json');
  writeFileSync(path, JSON.stringify({ _researchedAt: researchedAt, sources }), 'utf-8');

  const service = new SourceRegistryService({
    get: () => path,
  } as unknown as ConfigService);
  service.reload();
  return service;
};

describe('SourceRegistryService — no configured source', () => {
  it('reports NO_REAL_DATA_SOURCE_CONFIGURED rather than an empty list', () => {
    const report = serviceFor([source({ enabled: false })]).getReport();

    expect(report.state).toBe('NO_REAL_DATA_SOURCE_CONFIGURED');
    expect(report.automatedSourcesConfigured).toBe(0);
    expect(report.message).toContain(NO_SOURCE_MESSAGE);
  });

  it('still lists every candidate source with the reason it is blocked', () => {
    const report = serviceFor([source({ enabled: false })]).getReport();

    expect(report.sources).toHaveLength(1);
    expect(report.sources[0].blockedReason).toBe('disabled in config/data-sources.json');
    expect(report.sources[0].usable).toBe(false);
  });

  it('points the reader at the manual import path instead of failing silently', () => {
    expect(serviceFor([]).getReport().message).toContain('manual CSV/JSON import');
  });

  it('does not count a manual source as an automated one', () => {
    const manual = source({ key: 'manual_csv', adapter: 'ManualCsvAdapter', requiredEnv: [], automated: false });
    const report = serviceFor([manual]).getReport();

    expect(report.sources[0].usable).toBe(true);
    expect(report.automatedSourcesConfigured).toBe(0);
    expect(report.state).toBe('NO_REAL_DATA_SOURCE_CONFIGURED');
  });
});

describe('SourceRegistryService — blocking reasons', () => {
  const originalEnv = process.env.KEEPA_API_KEY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.KEEPA_API_KEY;
    } else {
      process.env.KEEPA_API_KEY = originalEnv;
    }
  });

  it('blocks an enabled source whose adapter is not implemented yet', () => {
    process.env.KEEPA_API_KEY = 'present';
    const status = serviceFor([source()]).getSource('keepa')!;

    expect(status.usable).toBe(false);
    expect(status.adapterImplemented).toBe(false);
    expect(status.blockedReason).toContain('not implemented in this codebase yet');
  });

  it('blocks a source with missing credentials and names them', () => {
    delete process.env.KEEPA_API_KEY;
    const status = serviceFor([source({ adapter: 'ManualCsvAdapter' })]).getSource('keepa')!;

    expect(status.usable).toBe(false);
    expect(status.missingEnv).toEqual(['KEEPA_API_KEY']);
    expect(status.blockedReason).toContain('missing credentials: KEEPA_API_KEY');
  });

  it('treats a blank credential as missing, not present', () => {
    process.env.KEEPA_API_KEY = '   ';
    const status = serviceFor([source({ adapter: 'ManualCsvAdapter' })]).getSource('keepa')!;

    expect(status.missingEnv).toEqual(['KEEPA_API_KEY']);
  });

  it('blocks a source that declares no adapter at all', () => {
    const status = serviceFor([source({ key: 'third_party', adapter: null, requiredEnv: [] })]).getSource('third_party')!;

    expect(status.blockedReason).toBe('no adapter is defined for this source');
  });

  it('reports READY once an implemented, credentialled automated source is enabled', () => {
    process.env.KEEPA_API_KEY = 'present';
    // ManualCsvAdapter stands in for an implemented adapter, flagged automated here.
    const report = serviceFor([source({ adapter: 'ManualCsvAdapter' })]).getReport();

    expect(report.state).toBe('READY');
    expect(report.automatedSourcesConfigured).toBe(1);
    expect(report.message).toContain('Keepa API');
  });
});

describe('SourceRegistryService — source facts', () => {
  it('surfaces access, pricing, limits and terms for each candidate', () => {
    const status = serviceFor([source()]).getSource('keepa')!;

    expect(status.accessRequirements).toBe('Paid subscription');
    expect(status.pricing).toBe('From EUR 49/month');
    expect(status.rateLimits).toBe('Token bucket');
    expect(status.termsNotes).toBe('Check redistribution limits');
  });

  it('carries the research date so stale facts are visible', () => {
    expect(serviceFor([source()], '2026-09-29').getReport().researchedAt).toBe('2026-09-29');
  });

  it('returns null for an unknown source key', () => {
    expect(serviceFor([source()]).getSource('nope')).toBeNull();
  });
});

describe('the shipped config/data-sources.json', () => {
  const real = (): SourceRegistryService => {
    const path = resolve(__dirname, '../../../../config/data-sources.json');
    const service = new SourceRegistryService({ get: () => path } as unknown as ConfigService);
    service.reload();
    return service;
  };

  it('ships with no automated source enabled, so nothing collects without a deliberate decision', () => {
    expect(real().getReport().state).toBe('NO_REAL_DATA_SOURCE_CONFIGURED');
  });

  it('leaves the third-party collector route unimplemented and flagged', () => {
    const status = real().getSource('third_party_collector')!;

    expect(status.adapter).toBeNull();
    expect(status.enabled).toBe(false);
    expect(status.termsNotes).toContain('DELIBERATELY LEFT UNIMPLEMENTED');
  });

  it('keeps the manual path usable so real data can always be supplied by hand', () => {
    expect(real().getSource('manual_csv')!.usable).toBe(true);
  });
});
