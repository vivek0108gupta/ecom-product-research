import { CriticalField, ScoreStatus } from '../../common/interfaces/enums';
import { assessDataQuality } from './data-quality';
import { ScoringInput } from './scoring.types';

const complete = (overrides: Partial<ScoringInput> = {}): ScoringInput => ({
  productId: 'p1',
  category: 'travel-accessories',
  marketplaceId: 'mkt-1',
  sellingPrice: 1099,
  productCost: 310,
  sourceName: 'manual_csv',
  sourceUrl: 'https://example.com/demo/item',
  collectedAt: new Date('2026-09-20T10:00:00Z'),
  weightKg: 0.55,
  dimensions: null,
  fragile: null,
  returnRisk: null,
  regulatoryComplexity: null,
  brandIpRisk: null,
  seasonalDemand: null,
  establishedBrandDominance: null,
  bundlePotentialScore: null,
  reviewCount: 4300,
  averageRating: 4.3,
  competitorCount: 88,
  painPointsCollected: true,
  complaintCount: 3,
  opportunityCount: 3,
  profitability: null,
  ...overrides,
});

describe('assessDataQuality', () => {
  it('reports COMPLETE when every critical input is present', () => {
    const result = assessDataQuality(complete());

    expect(result.scoreStatus).toBe(ScoreStatus.COMPLETE);
    expect(result.missingCriticalFields).toEqual([]);
    expect(result.missingCriticalFieldLabels).toEqual([]);
  });

  it.each([
    ['selling price', { sellingPrice: null }, CriticalField.SELLING_PRICE],
    ['product cost', { productCost: null }, CriticalField.PRODUCT_COST],
    ['marketplace', { marketplaceId: '' }, CriticalField.MARKETPLACE],
    ['review count', { reviewCount: null }, CriticalField.DEMAND_SIGNAL],
    ['average rating', { averageRating: null }, CriticalField.DEMAND_SIGNAL],
    ['competitor count', { competitorCount: null }, CriticalField.COMPETITION_SIGNAL],
    ['source name', { sourceName: null }, CriticalField.SOURCE],
    ['source url', { sourceUrl: null }, CriticalField.SOURCE],
    ['collected at', { collectedAt: null }, CriticalField.COLLECTED_AT],
  ])('marks INCOMPLETE and names the field when %s is missing', (_label, override, expectedField) => {
    const result = assessDataQuality(complete(override as Partial<ScoringInput>));

    expect(result.scoreStatus).toBe(ScoreStatus.INCOMPLETE);
    expect(result.missingCriticalFields).toContain(expectedField);
  });

  it('treats an invalid collected_at as missing', () => {
    const result = assessDataQuality(complete({ collectedAt: new Date('nonsense') }));

    expect(result.missingCriticalFields).toContain(CriticalField.COLLECTED_AT);
  });

  it('lists every missing field, not just the first', () => {
    const result = assessDataQuality(
      complete({ sellingPrice: null, productCost: null, competitorCount: null, reviewCount: null }),
    );

    expect(result.missingCriticalFields).toEqual([
      CriticalField.SELLING_PRICE,
      CriticalField.PRODUCT_COST,
      CriticalField.DEMAND_SIGNAL,
      CriticalField.COMPETITION_SIGNAL,
    ]);
  });

  it('provides a human-readable label for each missing field', () => {
    const result = assessDataQuality(complete({ productCost: null }));

    expect(result.missingCriticalFieldLabels).toEqual(['Supplier/product cost per unit (INR)']);
  });

  it('counts a zero selling price as present, not missing (validation rejects it separately)', () => {
    const result = assessDataQuality(complete({ sellingPrice: 0 }));

    expect(result.missingCriticalFields).not.toContain(CriticalField.SELLING_PRICE);
  });

  it('counts a genuine zero product cost as present', () => {
    const result = assessDataQuality(complete({ productCost: 0 }));

    expect(result.scoreStatus).toBe(ScoreStatus.COMPLETE);
  });
});
