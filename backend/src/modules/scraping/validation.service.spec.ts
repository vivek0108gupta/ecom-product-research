import { DatasetStatus, PainPointType } from '../../common/interfaces/enums';
import { ConfigFilesService } from '../../config/config-files.service';
import { NormalizedProduct } from '../../common/interfaces/normalized-product.interface';
import { ValidationService } from './validation.service';

const configFiles = {
  isKnownCategory: (slug: string) => ['travel-accessories', 'car-accessories'].includes(slug),
} as unknown as ConfigFilesService;

const service = new ValidationService(configFiles);

const product = (overrides: Partial<NormalizedProduct> = {}): NormalizedProduct => ({
  name: 'Packing Cubes Set of 6',
  url: 'https://example.com/demo/packing-cubes',
  marketplaceSlug: 'amazon_in',
  externalId: 'DEMO1',
  brand: 'DemoTravel',
  category: 'travel-accessories',
  subcategory: null,
  description: null,
  features: null,
  variants: null,
  sizes: null,
  colors: null,
  imageUrls: null,
  weightKg: 0.55,
  dimensions: null,
  sellingPrice: 1099,
  mrp: 2499,
  discountPercentage: 56,
  currency: 'INR',
  reviewCount: 4300,
  averageRating: 4.3,
  competitorCount: 88,
  sellerCount: 9,
  bestSellerRank: null,
  searchTerm: 'packing cubes',
  costs: {
    productCost: 310, shippingCost: 60, packagingCost: 22, marketplaceFeeOverride: null,
    paymentFee: null, advertisingCost: 120, returnAllowance: 50, otherCosts: null,
    sourceName: 'supplier quote', sourceUrl: null,
  },
  fragile: false,
  returnRisk: null,
  regulatoryComplexity: null,
  brandIpRisk: null,
  seasonalDemand: null,
  establishedBrandDominance: null,
  bundlePotentialScore: null,
  painPoints: [],
  normalizedName: 'packing cubes set of 6',
  sourceName: 'manual_csv',
  sourceUrl: 'https://example.com/demo/packing-cubes',
  collectedAt: new Date('2026-09-20T10:00:00Z'),
  confidenceScore: 0.8,
  datasetStatus: DatasetStatus.SAMPLE,
  ...overrides,
});

describe('ValidationService', () => {
  it('accepts a complete, well-formed record', () => {
    const result = service.validate(product());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a non-numeric or non-positive price', () => {
    expect(service.validate(product({ sellingPrice: Number.NaN })).errors).toContain('selling_price must be numeric');
    expect(service.validate(product({ sellingPrice: 0 })).errors).toContain('selling_price must be greater than zero');
    expect(service.validate(product({ sellingPrice: -5 })).errors).toContain('selling_price must be greater than zero');
  });

  it('rejects a currency other than INR', () => {
    const result = service.validate(product({ currency: 'USD' }));

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('currency must be INR'))).toBe(true);
  });

  it('rejects malformed product and source URLs', () => {
    expect(service.validate(product({ url: 'not-a-url' })).valid).toBe(false);
    expect(service.validate(product({ sourceUrl: 'ftp://example.com/x' })).valid).toBe(false);
  });

  it('rejects a category that is not configured', () => {
    const result = service.validate(product({ category: 'invented-category' }));

    expect(result.errors.some((error) => error.includes('not in config/categories.json'))).toBe(true);
  });

  it('requires a valid collection timestamp and rejects future dates', () => {
    expect(service.validate(product({ collectedAt: new Date('invalid') })).valid).toBe(false);
    expect(service.validate(product({ collectedAt: new Date(Date.now() + 7 * 86_400_000) })).valid).toBe(false);
  });

  it('rejects out-of-range ratings, negative review counts and bad confidence scores', () => {
    expect(service.validate(product({ averageRating: 6 })).valid).toBe(false);
    expect(service.validate(product({ reviewCount: -1 })).valid).toBe(false);
    expect(service.validate(product({ confidenceScore: 1.5 })).valid).toBe(false);
  });

  it('requires every review observation to carry a traceable source URL', () => {
    const result = service.validate(
      product({
        painPoints: [{ type: PainPointType.COMPLAINT, theme: 'zipper breaks', detail: null, mentionCount: 12, sourceName: 'manual_csv', sourceUrl: '', confidenceScore: null }],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('traceable'))).toBe(true);
  });

  it('warns without rejecting when optional signals are missing', () => {
    const result = service.validate(product({ costs: null, reviewCount: null, averageRating: null }));

    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('cost'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('demand score'))).toBe(true);
  });

  it('rejects a record with no named source', () => {
    const result = service.validate(product({ sourceName: '' }));

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('source_name is required'))).toBe(true);
  });

  it('rejects an unrecognised dataset status', () => {
    const result = service.validate(product({ datasetStatus: 'TOTALLY_REAL' as DatasetStatus }));

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('dataset_status'))).toBe(true);
  });

  it('warns when a row claims VERIFIED on low confidence', () => {
    const result = service.validate(product({ datasetStatus: DatasetStatus.VERIFIED, confidenceScore: 0.3 }));

    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('VERIFIED'))).toBe(true);
  });

  it('warns when no competing-listing count was recorded', () => {
    const result = service.validate(product({ competitorCount: null }));

    expect(result.warnings.some((warning) => warning.includes('competing-listing'))).toBe(true);
  });

  it('warns when the selling price is above MRP instead of silently accepting it', () => {
    const result = service.validate(product({ sellingPrice: 3000, mrp: 2499 }));

    expect(result.valid).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('exceeds MRP'))).toBe(true);
  });
});
