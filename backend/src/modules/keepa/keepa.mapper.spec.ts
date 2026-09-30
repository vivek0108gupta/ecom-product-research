import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DataOrigin, DatasetStatus } from '../../common/interfaces/enums';
import { assessVerification } from '../scraping/verification';
import { mapKeepaProduct } from './keepa.mapper';
import { KeepaProduct, KeepaResponse } from './keepa.types';

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/keepa-product.fixture.json'), 'utf-8'),
) as KeepaResponse;

const products = fixture.products ?? [];
const complete = products[0];
const noPrice = products[1];
const invalidType = products[2];

const map = (raw: KeepaProduct) =>
  mapKeepaProduct(raw, { collectedAt: new Date('2026-09-29T12:00:00Z'), category: 'home-organization' });

const fieldValue = (raw: KeepaProduct, name: string) => map(raw).fields.find((field) => field.field === name);

describe('mapKeepaProduct — identity and provenance', () => {
  it('maps ASIN to the source product id and builds the amazon.in URL', () => {
    const { product } = map(complete);

    expect(product.externalId).toBe('B0FIXTURE1');
    expect(product.url).toBe('https://amazon.in/dp/B0FIXTURE1');
    expect(product.sourceUrl).toBe('https://www.amazon.in/dp/B0FIXTURE1');
  });

  it('records source_name as keepa and keeps the collection timestamp', () => {
    const { product } = map(complete);

    expect(product.sourceName).toBe('keepa');
    expect(product.collectedAt.toISOString()).toBe('2026-09-29T12:00:00.000Z');
  });

  it('never marks a Keepa product VERIFIED on arrival', () => {
    expect(map(complete).product.datasetStatus).toBe(DatasetStatus.UNVERIFIED);
  });

  it('refuses a VERIFIED claim because automated collection is not human verification', () => {
    const verification = assessVerification({ ...map(complete).product, datasetStatus: DatasetStatus.VERIFIED });

    expect(verification.datasetStatus).toBe(DatasetStatus.UNVERIFIED);
    expect(verification.downgraded).toBe(true);
    expect(verification.reasons.join(' ')).toContain('automated collector');
  });
});

describe('mapKeepaProduct — price mapping', () => {
  it('prefers the Buy Box price and says which basis it used', () => {
    const result = map(complete);

    expect(result.product.sellingPrice).toBe(1000);
    expect(result.notes.join(' ')).toContain('buy box');
  });

  it('converts the smallest currency unit to rupees', () => {
    // Fixture buyBoxPrice is 100000 paise.
    expect(fieldValue(complete, 'buy_box_price')!.value).toBe(1000);
    expect(fieldValue(complete, 'mrp')!.value).toBe(2000);
  });

  it('falls back through Amazon then marketplace New when there is no Buy Box', () => {
    const noBuyBox: KeepaProduct = {
      ...complete,
      stats: { ...complete.stats, buyBoxPrice: -1 },
    };
    expect(map(noBuyBox).product.sellingPrice).toBe(1000);

    const onlyNew: KeepaProduct = {
      ...complete,
      stats: { ...complete.stats, buyBoxPrice: -1, current: [-1, 99000, ...(complete.stats!.current!.slice(2))] },
    };
    expect(map(onlyNew).product.sellingPrice).toBe(990);
  });

  it('reports a product with no price anywhere as unusable rather than pricing it at zero', () => {
    const result = map(noPrice);

    expect(result.product.sellingPrice).toBeNull();
    expect(result.unusableReasons.join(' ')).toContain('no current price available');
  });

  it('never treats the -1 sentinel as a real price', () => {
    expect(fieldValue(noPrice, 'buy_box_price')!.value).toBeNull();
    expect(fieldValue(noPrice, 'amazon_price')!.value).toBeNull();
  });
});

describe('mapKeepaProduct — demand, competition and rank', () => {
  it('maps rating from the 0-50 scale and review count', () => {
    const { product } = map(complete);

    expect(product.averageRating).toBe(4);
    expect(product.reviewCount).toBe(100);
  });

  it('maps sales rank as a rank and never as a sales estimate', () => {
    const result = map(complete);

    expect(result.product.bestSellerRank).toBe(1000);
    expect(result.notes.join(' ')).toContain('NOT converted into a units-sold estimate');
    expect(result.fields.every((field) => field.origin !== DataOrigin.INFERRED)).toBe(true);
  });

  it('uses the New offer count as the competition signal and says what it means', () => {
    const result = map(complete);

    expect(result.product.competitorCount).toBe(5);
    expect(result.notes.join(' ')).toContain('competition for one listing');
  });

  it('carries price and sales-rank history through as series', () => {
    const result = map(complete);

    expect(result.priceHistory.length).toBeGreaterThan(0);
    expect(result.salesRankHistory.length).toBeGreaterThan(0);
    expect(result.priceHistory[0].price).toBeGreaterThan(0);
  });
});

describe('mapKeepaProduct — supplier cost separation', () => {
  it('never derives a supplier cost from the Amazon selling price', () => {
    const result = map(complete);

    expect(result.product.costs).toBeNull();
    expect(result.notes.join(' ')).toContain('No supplier cost is available from Keepa');
  });

  it('emits no cost field of any kind', () => {
    const costFields = map(complete).fields.filter((field) => /cost/i.test(field.field));
    expect(costFields).toEqual([]);
  });
});

describe('mapKeepaProduct — origin separation', () => {
  it('classifies values read from Keepa as OBSERVED', () => {
    for (const name of ['buy_box_price', 'rating', 'review_count', 'sales_rank', 'availability']) {
      expect(fieldValue(complete, name)!.origin).toBe(DataOrigin.OBSERVED);
    }
  });

  it('classifies values this system works out as CALCULATED', () => {
    expect(fieldValue(complete, 'observed_price')!.origin).toBe(DataOrigin.CALCULATED);
    expect(fieldValue(complete, 'discount_percentage')!.origin).toBe(DataOrigin.CALCULATED);
  });

  it('produces nothing INFERRED, because no documented model backs any inference', () => {
    expect(map(complete).fields.filter((field) => field.origin === DataOrigin.INFERRED)).toEqual([]);
  });

  it('records the derivation of every field so a number can be traced back', () => {
    for (const field of map(complete).fields) {
      expect(field.derivation.length).toBeGreaterThan(0);
    }
  });
});

describe('mapKeepaProduct — productType and attributes', () => {
  it('rejects productType 4 (INVALID) before trusting any field', () => {
    expect(map(invalidType).unusableReasons.join(' ')).toContain('INVALID');
  });

  it('converts package dimensions from millimetres and weight from grams', () => {
    const { product } = map(complete);

    expect(product.weightKg).toBe(1);
    expect(product.dimensions).toEqual({ lengthCm: 30, widthCm: 20, heightCm: 10 });
  });

  it('builds full image URLs from the documented CDN prefix', () => {
    expect(map(complete).product.imageUrls![0]).toBe('https://m.media-amazon.com/images/I/FIXTUREIMAGE1.jpg');
  });

  it('maps availability through the documented code table', () => {
    expect(fieldValue(complete, 'availability')!.value).toBe('in stock');
    expect(fieldValue(noPrice, 'availability')!.value).toBe('no Amazon offer');
  });

  it('records Keepa freshness timestamps', () => {
    expect(fieldValue(complete, 'keepa_last_update')!.value).toBe('2024-07-01T13:20:00.000Z');
  });
});
