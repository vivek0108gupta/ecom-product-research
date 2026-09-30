import { DatasetStatus } from '../../common/interfaces/enums';
import { ConfigFilesService } from '../../config/config-files.service';
import { NormalizedProduct } from '../../common/interfaces/normalized-product.interface';
import { ParsedRealRecord } from './real-data.parser';
import { RealDataValidator } from './real-data.validator';

const configFiles = {
  isKnownCategory: (slug: string) => ['kitchen-organization', 'home-organization'].includes(slug),
} as unknown as ConfigFilesService;

const validator = new RealDataValidator(configFiles);

const product = (overrides: Partial<NormalizedProduct> = {}): NormalizedProduct => ({
  name: 'Steel Spice Rack',
  normalizedName: 'steel spice rack',
  url: 'https://amazon.in/dp/B0ABCDEFGH',
  marketplaceSlug: 'amazon_in',
  externalId: 'B0ABCDEFGH',
  brand: 'RealBrand',
  category: 'kitchen-organization',
  subcategory: null,
  description: null,
  features: null,
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
  sellerCount: null,
  bestSellerRank: null,
  searchTerm: null,
  costs: {
    productCost: 420,
    shippingCost: 95,
    packagingCost: null,
    marketplaceFeeOverride: 180,
    paymentFee: null,
    advertisingCost: null,
    returnAllowance: null,
    otherCosts: null,
    sourceName: 'indiamart quote 2026-09-28',
    sourceUrl: null,
  },
  fragile: null,
  returnRisk: null,
  regulatoryComplexity: null,
  brandIpRisk: null,
  seasonalDemand: null,
  establishedBrandDominance: null,
  bundlePotentialScore: null,
  painPoints: [],
  sourceName: 'vivek_listing_review',
  sourceUrl: 'https://amazon.in/dp/B0ABCDEFGH',
  collectedAt: new Date('2026-09-28T05:30:00Z'),
  confidenceScore: 0.9,
  datasetStatus: DatasetStatus.UNVERIFIED,
  ...overrides,
});

const record = (overrides: Partial<NormalizedProduct> = {}, verificationRequested = false): ParsedRealRecord => ({
  record: 2,
  product: product(overrides),
  observations: [],
  verificationRequested,
});

describe('RealDataValidator — acceptance', () => {
  it('accepts a complete real record', () => {
    const result = validator.validate(record());

    expect(result.accepted).toBe(true);
    expect(result.rejection).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('accepts a record that is missing optional fields, warning about the consequences', () => {
    const result = validator.validate(record({ costs: null, reviewCount: null, competitorCount: null }));

    expect(result.accepted).toBe(true);
    expect(result.warnings.some((w) => w.includes('supplier_cost'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('demand signal'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('competition_signal'))).toBe(true);
  });

  it('warns that a VERIFIED request must still earn it', () => {
    const result = validator.validate(record({}, true));

    expect(result.accepted).toBe(true);
    expect(result.warnings.some((w) => w.includes('verification gate'))).toBe(true);
  });
});

describe('RealDataValidator — seed isolation', () => {
  it('rejects a record sourced from seed_demo_data', () => {
    const result = validator.validate(record({ sourceName: 'seed_demo_data' }));

    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe('SEED_DATA_SOURCE');
    expect(result.rejection?.errors[0]).toContain('seed/demo data');
  });

  it('rejects a record submitted with SAMPLE status', () => {
    const result = validator.validate(record({ datasetStatus: DatasetStatus.SAMPLE }));

    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe('SAMPLE_STATUS_NOT_ALLOWED');
  });

  it('rejects a non-attributable source name', () => {
    expect(validator.validate(record({ sourceName: 'manual_csv' })).rejection?.code).toBe('SEED_DATA_SOURCE');
    expect(validator.validate(record({ sourceName: 'demo assumption' })).rejection?.code).toBe('SEED_DATA_SOURCE');
  });
});

describe('RealDataValidator — placeholder URLs', () => {
  it.each([
    'https://example.com/listing/1',
    'https://example-research.com/listing/spice-rack-12',
    'https://demo-store.in/p/1',
    'https://store.test/p/1',
    'http://localhost:3000/p/1',
  ])('rejects the placeholder product_url %s', (url) => {
    const result = validator.validate(record({ url }));

    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe('PLACEHOLDER_URL');
    expect(result.rejection?.errors.join(' ')).toContain('product_url is a placeholder/example URL');
  });

  it('rejects a placeholder source_url even when the product URL is real', () => {
    const result = validator.validate(record({ sourceUrl: 'https://example-research.com/notes' }));

    expect(result.rejection?.code).toBe('PLACEHOLDER_URL');
    expect(result.rejection?.errors.join(' ')).toContain('source_url is a placeholder/example URL');
  });

  it('reports both URLs when both are placeholders', () => {
    const result = validator.validate(
      record({ url: 'https://example.com/a', sourceUrl: 'https://example-research.com/b' }),
    );

    expect(result.rejection?.errors).toHaveLength(2);
  });
});

describe('RealDataValidator — required fields', () => {
  it.each([
    ['product_name', { name: '' }],
    ['marketplace', { marketplaceSlug: '' }],
    ['product_url', { url: '' }],
    ['source_url', { sourceUrl: '' }],
    ['source_name', { sourceName: '' }],
  ])('rejects a record missing %s', (field, override) => {
    const result = validator.validate(record(override as Partial<NormalizedProduct>));

    expect(result.accepted).toBe(false);
    expect(result.rejection?.code).toBe('MISSING_REQUIRED_FIELD');
    expect(result.rejection?.errors.join(' ')).toContain(field);
  });

  it('rejects a record with no observed_price', () => {
    const result = validator.validate(record({ sellingPrice: Number.NaN }));

    expect(result.rejection?.code).toBe('MISSING_REQUIRED_FIELD');
    expect(result.rejection?.errors.join(' ')).toContain('observed_price');
  });

  it('rejects a record with an unusable observed_at', () => {
    const result = validator.validate(record({ collectedAt: new Date('nonsense') }));

    expect(result.rejection?.code).toBe('MISSING_REQUIRED_FIELD');
    expect(result.rejection?.errors.join(' ')).toContain('observed_at');
  });

  it('lists every missing required field at once', () => {
    const result = validator.validate(record({ name: '', url: '', sourceName: '' }));

    expect(result.rejection?.errors).toHaveLength(3);
  });
});

describe('RealDataValidator — value sanity', () => {
  it.each([
    ['a non-positive price', { sellingPrice: 0 }, 'observed_price must be greater than zero'],
    ['a non-INR currency', { currency: 'USD' }, 'currency must be INR'],
    ['an out-of-range rating', { averageRating: 9 }, 'rating must be between 0 and 5'],
    ['a negative review count', { reviewCount: -5 }, 'review_count cannot be negative'],
    ['a non-positive weight', { weightKg: 0 }, 'product_weight must be greater than zero'],
    ['an out-of-range confidence', { confidenceScore: 3 }, 'confidence_score must be between 0 and 1'],
  ])('rejects %s', (_label, override, expectedError) => {
    const result = validator.validate(record(override as Partial<NormalizedProduct>));

    expect(result.rejection?.code).toBe('INVALID_VALUE');
    expect(result.rejection?.errors.join(' ')).toContain(expectedError);
  });

  it('rejects a future observation date', () => {
    const result = validator.validate(record({ collectedAt: new Date(Date.now() + 7 * 86_400_000) }));

    expect(result.rejection?.errors.join(' ')).toContain('observed_at is in the future');
  });
});

describe('RealDataValidator — category', () => {
  it('rejects a record with no category, since scoring needs a peer cohort', () => {
    expect(validator.validate(record({ category: '' })).rejection?.code).toBe('UNKNOWN_CATEGORY');
  });

  it('rejects an unconfigured category rather than inventing one', () => {
    const result = validator.validate(record({ category: 'not-a-category' }));

    expect(result.rejection?.code).toBe('UNKNOWN_CATEGORY');
    expect(result.rejection?.errors[0]).toContain('config/categories.json');
  });
});
