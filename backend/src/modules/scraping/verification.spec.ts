import { DatasetStatus } from '../../common/interfaces/enums';
import { NormalizedProduct } from '../../common/interfaces/normalized-product.interface';
import { assessVerification } from './verification';

/**
 * A record that would legitimately earn VERIFIED: real marketplace URL, attributable
 * source, genuine product attributes, an observed price, an attributable supplier quote,
 * and both demand and competition evidence.
 */
const verifiable = (overrides: Partial<NormalizedProduct> = {}): NormalizedProduct => ({
  name: 'Stainless Steel Spice Rack 12 Jar',
  normalizedName: 'stainless steel spice rack 12 jar',
  url: 'https://www.amazon.in/dp/B0ABCDEFGH',
  marketplaceSlug: 'amazon_in',
  externalId: 'B0ABCDEFGH',
  brand: 'RealBrand',
  category: 'kitchen-organization',
  subcategory: null,
  description: 'Wall-mounted 12-jar spice rack',
  features: ['12 jars', 'wall mount'],
  variants: null,
  sizes: null,
  colors: null,
  imageUrls: null,
  weightKg: 1.8,
  dimensions: { lengthCm: 30, widthCm: 20, heightCm: 25 },
  sellingPrice: 1249,
  mrp: 2199,
  discountPercentage: 43.2,
  currency: 'INR',
  reviewCount: 860,
  averageRating: 4.1,
  competitorCount: 34,
  sellerCount: 5,
  bestSellerRank: null,
  searchTerm: 'spice rack',
  costs: {
    productCost: 420,
    shippingCost: 95,
    packagingCost: 30,
    marketplaceFeeOverride: null,
    paymentFee: null,
    advertisingCost: 110,
    returnAllowance: 55,
    otherCosts: null,
    sourceName: 'indiamart supplier quote 2026-09-28',
    sourceUrl: null,
  },
  fragile: false,
  returnRisk: null,
  regulatoryComplexity: null,
  brandIpRisk: null,
  seasonalDemand: null,
  establishedBrandDominance: null,
  bundlePotentialScore: null,
  painPoints: [],
  sourceName: 'amazon_listing_review_by_vivek',
  sourceUrl: 'https://www.amazon.in/dp/B0ABCDEFGH',
  collectedAt: new Date('2026-09-28T11:00:00Z'),
  confidenceScore: 0.9,
  datasetStatus: DatasetStatus.VERIFIED,
  ...overrides,
});

describe('assessVerification — placeholder domains can never be VERIFIED', () => {
  it('refuses VERIFIED for an example.com product URL', () => {
    const result = assessVerification(verifiable({ url: 'https://example.com/demo/item' }));

    expect(result.datasetStatus).toBe(DatasetStatus.UNVERIFIED);
    expect(result.downgraded).toBe(true);
    expect(result.reasons.join(' ')).toContain('product url is not a real traceable URL');
  });

  it('refuses VERIFIED for an example-research.com source URL', () => {
    const result = assessVerification(
      verifiable({ sourceUrl: 'https://www.example-research.com/listing/spice-rack-12' }),
    );

    expect(result.datasetStatus).toBe(DatasetStatus.UNVERIFIED);
    expect(result.reasons.join(' ')).toContain('source_url is not a real traceable URL');
  });

  it('refuses VERIFIED when both URLs are placeholders, listing both reasons', () => {
    const result = assessVerification(
      verifiable({
        url: 'https://example-research.com/listing/x',
        sourceUrl: 'https://example.com/demo/x',
      }),
    );

    expect(result.datasetStatus).toBe(DatasetStatus.UNVERIFIED);
    expect(result.reasons).toHaveLength(2);
  });

  it.each([
    'https://example.com/p/1',
    'https://example-research.com/p/1',
    'https://demo-store.in/p/1',
    'https://store.test/p/1',
    'http://localhost:3000/p/1',
  ])('never returns VERIFIED for %s', (url) => {
    expect(assessVerification(verifiable({ url, sourceUrl: url })).datasetStatus).not.toBe(DatasetStatus.VERIFIED);
  });
});

describe('assessVerification — seed and demo data', () => {
  it('leaves SAMPLE data as SAMPLE and never promotes it', () => {
    const result = assessVerification(verifiable({ datasetStatus: DatasetStatus.SAMPLE }));

    expect(result.datasetStatus).toBe(DatasetStatus.SAMPLE);
    expect(result.downgraded).toBe(false);
  });

  it('refuses VERIFIED when the source is seed_demo_data', () => {
    const result = assessVerification(verifiable({ sourceName: 'seed_demo_data' }));

    expect(result.datasetStatus).toBe(DatasetStatus.UNVERIFIED);
    expect(result.reasons.join(' ')).toContain('does not attribute the record to a real, traceable origin');
  });

  it('refuses VERIFIED when the source is only the adapter name', () => {
    expect(assessVerification(verifiable({ sourceName: 'manual_csv' })).datasetStatus).toBe(DatasetStatus.UNVERIFIED);
  });

  it('refuses VERIFIED for the seeded demo row shape in its entirety', () => {
    const seededDemoRow = verifiable({
      url: 'https://example.com/demo/packing-cubes',
      sourceUrl: 'https://example.com/demo/packing-cubes',
      sourceName: 'seed_demo_data',
      datasetStatus: DatasetStatus.VERIFIED,
    });

    expect(assessVerification(seededDemoRow).datasetStatus).toBe(DatasetStatus.UNVERIFIED);
  });
});

describe('assessVerification — required evidence', () => {
  it('accepts a fully evidenced record', () => {
    const result = assessVerification(verifiable());

    expect(result.datasetStatus).toBe(DatasetStatus.VERIFIED);
    expect(result.downgraded).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('refuses VERIFIED without any concrete product information', () => {
    const result = assessVerification(
      verifiable({ brand: null, description: null, weightKg: null, dimensions: null, features: null }),
    );

    expect(result.reasons.join(' ')).toContain('no actual product information');
  });

  it('refuses VERIFIED without an observed price', () => {
    expect(assessVerification(verifiable({ sellingPrice: 0 })).reasons.join(' ')).toContain('no actual observed selling price');
  });

  it('refuses VERIFIED when a cost is claimed without an attributable supplier', () => {
    const result = assessVerification(
      verifiable({ costs: { ...verifiable().costs!, sourceName: 'demo assumption' } }),
    );

    expect(result.reasons.join(' ')).toContain('not a real attributable supplier/quote');
  });

  it('refuses VERIFIED when the cost source URL is a placeholder', () => {
    const result = assessVerification(
      verifiable({ costs: { ...verifiable().costs!, sourceUrl: 'https://example.com/quote' } }),
    );

    expect(result.reasons.join(' ')).toContain('cost_source_url is a placeholder URL');
  });

  it('allows VERIFIED with no cost claimed at all, since there is nothing to evidence', () => {
    expect(assessVerification(verifiable({ costs: null })).datasetStatus).toBe(DatasetStatus.VERIFIED);
  });

  it('refuses VERIFIED without demand evidence', () => {
    expect(assessVerification(verifiable({ reviewCount: null })).reasons.join(' ')).toContain('demand metrics');
    expect(assessVerification(verifiable({ averageRating: null })).reasons.join(' ')).toContain('demand metrics');
  });

  it('refuses VERIFIED without competition evidence', () => {
    expect(assessVerification(verifiable({ competitorCount: null })).reasons.join(' ')).toContain('competition metric');
  });

  it('refuses VERIFIED without a usable collected_at', () => {
    expect(assessVerification(verifiable({ collectedAt: new Date('nonsense') })).reasons.join(' ')).toContain('collected_at');
  });
});

describe('assessVerification — UNVERIFIED records', () => {
  it('passes UNVERIFIED through untouched and records no downgrade', () => {
    const result = assessVerification(
      verifiable({ datasetStatus: DatasetStatus.UNVERIFIED, url: 'https://example.com/demo/x' }),
    );

    expect(result.datasetStatus).toBe(DatasetStatus.UNVERIFIED);
    expect(result.downgraded).toBe(false);
    expect(result.reasons).toEqual([]);
  });
});
