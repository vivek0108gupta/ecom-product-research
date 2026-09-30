import { DataSource, FindOneOptions, Repository } from 'typeorm';
import { DatasetStatus } from '../../common/interfaces/enums';
import { Product } from '../../database/entities/product.entity';
import { NormalizedProduct } from '../../common/interfaces/normalized-product.interface';
import { RealDataImportService } from './real-data-import.service';

/**
 * The isolation boundary between seed/demo data and real research.
 *
 * These assert the *query contract* rather than going through a database: every lookup the
 * real pipeline makes when deduplicating must exclude SAMPLE rows, so a real record can
 * never merge into a demo product (or silently overwrite one) just because they share a
 * marketplace and a name.
 */
describe('RealDataImportService — seed isolation in deduplication', () => {
  const capturedQueries: Array<FindOneOptions<Product>> = [];

  const productRepo = {
    findOne: (options: FindOneOptions<Product>) => {
      capturedQueries.push(options);
      return Promise.resolve(null);
    },
  } as unknown as Repository<Product>;

  const service = new RealDataImportService(
    {} as DataSource,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  // findExistingRealProduct is private by design — it is an internal invariant, not API.
  const findExisting = (normalized: Partial<NormalizedProduct>) =>
    (service as unknown as {
      findExistingRealProduct: (
        repo: Repository<Product>,
        marketplaceId: string,
        normalized: NormalizedProduct,
      ) => Promise<Product | null>;
    }).findExistingRealProduct(productRepo, 'mkt-1', {
      externalId: null,
      url: 'https://amazon.in/dp/B0ABCDEFGH',
      normalizedName: 'steel spice rack',
      ...normalized,
    } as NormalizedProduct);

  beforeEach(() => {
    capturedQueries.length = 0;
  });

  it('excludes SAMPLE rows from the external-id lookup', async () => {
    await findExisting({ externalId: 'B0ABCDEFGH' });

    const byExternalId = capturedQueries[0].where as Record<string, unknown>;
    expect(byExternalId.externalId).toBe('B0ABCDEFGH');
    expect(byExternalId.datasetStatus).toBeDefined();
    expect(JSON.stringify(byExternalId.datasetStatus)).toContain(DatasetStatus.SAMPLE);
  });

  it('excludes SAMPLE rows from the URL lookup', async () => {
    await findExisting({});

    const byUrl = capturedQueries[0].where as Record<string, unknown>;
    expect(byUrl.url).toBe('https://amazon.in/dp/B0ABCDEFGH');
    expect(JSON.stringify(byUrl.datasetStatus)).toContain(DatasetStatus.SAMPLE);
  });

  it('excludes SAMPLE rows from the normalized-name lookup', async () => {
    await findExisting({});

    const byName = capturedQueries[capturedQueries.length - 1].where as Record<string, unknown>;
    expect(byName.normalizedName).toBe('steel spice rack');
    expect(JSON.stringify(byName.datasetStatus)).toContain(DatasetStatus.SAMPLE);
  });

  it('applies the SAMPLE exclusion to every lookup it makes, without exception', async () => {
    await findExisting({ externalId: 'B0ABCDEFGH' });

    expect(capturedQueries.length).toBeGreaterThan(1);
    for (const query of capturedQueries) {
      const where = query.where as Record<string, unknown>;
      expect(where.datasetStatus).toBeDefined();
    }
  });

  it('scopes every lookup to a single marketplace, so cross-marketplace listings stay separate', async () => {
    await findExisting({ externalId: 'B0ABCDEFGH' });

    for (const query of capturedQueries) {
      expect((query.where as Record<string, unknown>).marketplaceId).toBe('mkt-1');
    }
  });
});
