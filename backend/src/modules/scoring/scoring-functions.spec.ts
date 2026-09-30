import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ProductClassification, RiskLevel, ScoreStatus } from '../../common/interfaces/enums';
import { ScoringConfig } from '../../config/scoring-config.types';
import { ProfitabilityResult } from '../profitability/profitability.types';
import {
  bundleExpansionScore,
  classify,
  competitionOpportunityScore,
  computeFinalScore,
  computeRiskScore,
  customerPainOpportunityScore,
  demandScore,
  differentiationScore,
  minMaxNormalize,
  profitabilityScore,
  shippingSimplicityScore,
} from './scoring-functions';
import { CohortStats, ScoringInput, SubScore, SubScores } from './scoring.types';

const config: ScoringConfig = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../config/scoring-weights.json'), 'utf-8'),
) as ScoringConfig;

const cohort: CohortStats = {
  logReviewsMin: Math.log(101),
  logReviewsMax: Math.log(10001),
  competitorMin: 10,
  competitorMax: 210,
  cohortSize: 10,
  cohortLabel: 'test',
};

const input = (overrides: Partial<ScoringInput> = {}): ScoringInput => ({
  productId: 'test',
  category: 'travel-accessories',
  marketplaceId: 'mkt-1',
  sellingPrice: 1000,
  productCost: 300,
  sourceName: 'manual_csv',
  sourceUrl: 'https://example.com/demo/item',
  collectedAt: new Date('2026-09-20T10:00:00Z'),
  weightKg: 0.5,
  dimensions: null,
  fragile: null,
  returnRisk: null,
  regulatoryComplexity: null,
  brandIpRisk: null,
  seasonalDemand: null,
  establishedBrandDominance: null,
  bundlePotentialScore: null,
  reviewCount: 1000,
  averageRating: 4,
  competitorCount: 50,
  painPointsCollected: true,
  complaintCount: 2,
  opportunityCount: 2,
  profitability: null,
  ...overrides,
});

const profit = (overrides: Partial<ProfitabilityResult> = {}): ProfitabilityResult => ({
  sellingPrice: 1000,
  costBreakdown: {
    productCost: 300, shippingCost: 70, packagingCost: 30, marketplaceFee: 150,
    paymentFee: 20, advertisingCost: 100, returnAllowance: 30, otherCosts: 0,
  },
  missingCostFields: [],
  appliedFees: [],
  totalCost: 700,
  estimatedLandedCost: 400,
  profitPerUnit: 300,
  profitMarginPercentage: 30,
  roiPercentage: 75,
  isReliable: true,
  reliabilityNotes: [],
  ...overrides,
});

const sub = (value: number | null): SubScore => ({ value, evidence: {} });

const subScores = (overrides: Partial<SubScores> = {}): SubScores => ({
  demand: sub(80),
  profitability: sub(60),
  competitionOpportunity: sub(70),
  differentiation: sub(50),
  shippingSimplicity: sub(90),
  customerPainOpportunity: sub(30),
  bundleExpansion: sub(65),
  ...overrides,
});

describe('minMaxNormalize', () => {
  it('scales linearly across the cohort range', () => {
    expect(minMaxNormalize(50, 0, 100)).toBe(50);
    expect(minMaxNormalize(0, 0, 100)).toBe(0);
    expect(minMaxNormalize(100, 0, 100)).toBe(100);
  });

  it('returns the neutral midpoint when the cohort carries no relative information', () => {
    expect(minMaxNormalize(7, 7, 7)).toBe(50);
    expect(minMaxNormalize(7, Number.NaN, Number.NaN)).toBe(50);
  });

  it('clamps values outside the cohort range', () => {
    expect(minMaxNormalize(150, 0, 100)).toBe(100);
    expect(minMaxNormalize(-50, 0, 100)).toBe(0);
  });
});

describe('demandScore', () => {
  it('blends log-scaled review volume with rating', () => {
    const result = demandScore(input(), cohort, config);

    expect(result.value).not.toBeNull();
    expect(result.evidence.reviewCount).toBe(1000);
    expect(result.evidence.ratingComponent).toBe(80);
  });

  it('is null when review count or rating was not collected', () => {
    expect(demandScore(input({ reviewCount: null }), cohort, config).value).toBeNull();
    expect(demandScore(input({ averageRating: null }), cohort, config).value).toBeNull();
    expect(demandScore(input({ reviewCount: null }), cohort, config).unavailableReason).toBeDefined();
  });

  it('ranks a higher-rated product above an identical lower-rated one', () => {
    const high = demandScore(input({ averageRating: 4.8 }), cohort, config).value!;
    const low = demandScore(input({ averageRating: 3.2 }), cohort, config).value!;

    expect(high).toBeGreaterThan(low);
  });
});

describe('competitionOpportunityScore', () => {
  it('scores an uncrowded niche higher than a crowded one', () => {
    const quiet = competitionOpportunityScore(input({ competitorCount: 10 }), cohort, config).value!;
    const crowded = competitionOpportunityScore(input({ competitorCount: 210 }), cohort, config).value!;

    expect(quiet).toBe(100);
    expect(crowded).toBe(0);
    expect(quiet).toBeGreaterThan(crowded);
  });

  it('penalizes categories dominated by established brands', () => {
    const plain = competitionOpportunityScore(input({ competitorCount: 50 }), cohort, config).value!;
    const dominated = competitionOpportunityScore(
      input({ competitorCount: 50, establishedBrandDominance: true }),
      cohort,
      config,
    ).value!;

    expect(plain - dominated).toBe(config.competitionOpportunityScore.establishedBrandDominancePenalty);
  });

  it('is null when competing listings were never counted', () => {
    expect(competitionOpportunityScore(input({ competitorCount: null }), cohort, config).value).toBeNull();
  });

  it('documents that 100 means an attractive environment', () => {
    const result = competitionOpportunityScore(input(), cohort, config);
    expect(result.evidence.direction).toContain('100 = attractive');
  });
});

describe('differentiation and pain point scores', () => {
  it('scales with the number of recorded opportunities and caps at 100', () => {
    expect(differentiationScore(input({ opportunityCount: 2 }), config).value).toBe(40);
    expect(differentiationScore(input({ opportunityCount: 99 }), config).value).toBe(100);
  });

  it('distinguishes "reviews not analysed" (null) from "analysed, nothing found" (0)', () => {
    expect(differentiationScore(input({ painPointsCollected: false }), config).value).toBeNull();
    expect(differentiationScore(input({ painPointsCollected: true, opportunityCount: 0 }), config).value).toBe(0);

    expect(customerPainOpportunityScore(input({ painPointsCollected: false }), config).value).toBeNull();
    expect(customerPainOpportunityScore(input({ painPointsCollected: true, complaintCount: 0 }), config).value).toBe(0);
  });

  it('treats more documented complaints as more opportunity to improve on', () => {
    expect(customerPainOpportunityScore(input({ complaintCount: 4 }), config).value).toBe(60);
  });
});

describe('shippingSimplicityScore', () => {
  it('rewards light compact goods', () => {
    const result = shippingSimplicityScore(input({ weightKg: 0.3, dimensions: { lengthCm: 10, widthCm: 10, heightCm: 5 } }), config);
    expect(result.value).toBe(100);
  });

  it('penalizes heavy, bulky and fragile goods', () => {
    const heavy = shippingSimplicityScore(input({ weightKg: 8 }), config).value!;
    const fragile = shippingSimplicityScore(input({ weightKg: 0.3, fragile: true }), config).value!;

    expect(heavy).toBe(30);
    expect(fragile).toBe(100 - config.shippingSimplicityScore.fragilePenalty);
  });

  it('is null without a weight', () => {
    expect(shippingSimplicityScore(input({ weightKg: null }), config).value).toBeNull();
  });
});

describe('bundleExpansionScore', () => {
  it('prefers a researcher-supplied value over the category baseline', () => {
    const result = bundleExpansionScore(input({ bundlePotentialScore: 42 }), config);

    expect(result.value).toBe(42);
    expect(result.evidence.source).toBe('manual_override');
  });

  it('falls back to the configured category baseline', () => {
    const result = bundleExpansionScore(input({ category: 'kitchen-organization' }), config);

    expect(result.value).toBe(config.bundleExpansionScore.categoryBaselines['kitchen-organization']);
    expect(result.evidence.source).toBe('category_baseline');
  });

  it('is null for an unconfigured category rather than inventing a number', () => {
    expect(bundleExpansionScore(input({ category: 'not-a-real-category' }), config).value).toBeNull();
  });
});

describe('profitabilityScore', () => {
  it('maps margin onto 0-100 between the configured floor and ceiling', () => {
    expect(profitabilityScore(input({ profitability: profit({ profitMarginPercentage: 0 }) }), config).value).toBe(0);
    expect(profitabilityScore(input({ profitability: profit({ profitMarginPercentage: 25 }) }), config).value).toBe(50);
    expect(profitabilityScore(input({ profitability: profit({ profitMarginPercentage: 50 }) }), config).value).toBe(100);
    expect(profitabilityScore(input({ profitability: profit({ profitMarginPercentage: 80 }) }), config).value).toBe(100);
    expect(profitabilityScore(input({ profitability: profit({ profitMarginPercentage: -20 }) }), config).value).toBe(0);
  });

  it('is null when the profitability result is not reliable', () => {
    expect(profitabilityScore(input({ profitability: profit({ isReliable: false }) }), config).value).toBeNull();
    expect(profitabilityScore(input({ profitability: null }), config).value).toBeNull();
  });
});

describe('computeFinalScore', () => {
  it('applies the configured weights when every signal is present', () => {
    const result = computeFinalScore(subScores(), config);
    const expected =
      80 * 0.25 + 60 * 0.2 + 70 * 0.15 + 50 * 0.15 + 90 * 0.1 + 30 * 0.05 + 65 * 0.1;

    expect(result.value).toBeCloseTo(expected, 2);
    expect(result.dataCompleteness).toBe(1);
  });

  it('renormalizes the remaining weights when a signal is missing', () => {
    const result = computeFinalScore(subScores({ bundleExpansion: sub(null) }), config);

    expect(result.dataCompleteness).toBe(0.9);
    expect(Object.values(result.effectiveWeights).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 2);
    expect(result.effectiveWeights.bundleExpansion).toBeUndefined();
  });

  it('does not treat a missing signal as a zero score', () => {
    const withNull = computeFinalScore(subScores({ customerPainOpportunity: sub(null) }), config).value!;
    const withZero = computeFinalScore(subScores({ customerPainOpportunity: sub(0) }), config).value!;

    expect(withNull).toBeGreaterThan(withZero);
  });

  it('returns null when nothing at all was collected', () => {
    const empty = subScores({
      demand: sub(null), profitability: sub(null), competitionOpportunity: sub(null), differentiation: sub(null),
      shippingSimplicity: sub(null), customerPainOpportunity: sub(null), bundleExpansion: sub(null),
    });
    const result = computeFinalScore(empty, config);

    expect(result.value).toBeNull();
    expect(result.dataCompleteness).toBe(0);
  });

  it('withholds the Final Score entirely when critical inputs are missing', () => {
    const result = computeFinalScore(subScores(), config, ScoreStatus.INCOMPLETE);

    expect(result.value).toBeNull();
    expect(result.contributions).toEqual({});
    expect(result.effectiveWeights).toEqual({});
  });

  it('still reports how much signal was available on an INCOMPLETE product', () => {
    const result = computeFinalScore(subScores({ bundleExpansion: sub(null) }), config, ScoreStatus.INCOMPLETE);

    expect(result.dataCompleteness).toBe(0.9);
  });

  it('defaults to COMPLETE so an un-gated call still scores', () => {
    expect(computeFinalScore(subScores(), config).value).not.toBeNull();
  });

  it('ignores stray non-component keys in the weights config', () => {
    const polluted = { ...config, finalScoreWeights: { ...config.finalScoreWeights, _comment: 'not a weight' } } as unknown as ScoringConfig;

    expect(computeFinalScore(subScores(), polluted).value).toBeCloseTo(computeFinalScore(subScores(), config).value!, 2);
  });
});

describe('computeRiskScore', () => {
  it('is zero with no risk factors on file', () => {
    const result = computeRiskScore(input({ profitability: profit() }), subScores(), config);

    expect(result.value).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it('names every penalty it applies', () => {
    const result = computeRiskScore(
      input({
        fragile: true,
        brandIpRisk: true,
        seasonalDemand: true,
        returnRisk: RiskLevel.HIGH,
        establishedBrandDominance: true,
        profitability: profit({ profitMarginPercentage: 5 }),
      }),
      subScores({ competitionOpportunity: sub(20), shippingSimplicity: sub(30) }),
      config,
    );

    expect(result.value).toBe(100);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'Fragile product',
        'Heavy or bulky to ship',
        'High competition',
        'Strong established brands',
        'Brand/IP risk',
        'Seasonal demand',
        'high return risk',
      ]),
    );
  });

  it('flags missing cost data as quality uncertainty', () => {
    const result = computeRiskScore(input({ profitability: null }), subScores(), config);

    expect(result.reasons).toContain('Quality uncertainty: no verified cost data');
  });

  it('never exceeds 100', () => {
    const result = computeRiskScore(
      input({
        fragile: true, brandIpRisk: true, seasonalDemand: true,
        returnRisk: RiskLevel.HIGH, regulatoryComplexity: RiskLevel.HIGH,
        establishedBrandDominance: true, profitability: profit({ profitMarginPercentage: 1 }),
      }),
      subScores({ competitionOpportunity: sub(0), shippingSimplicity: sub(0) }),
      config,
    );

    expect(result.value).toBe(100);
  });
});

describe('classify', () => {
  it('marks a high-scoring, manageable-risk product as A', () => {
    expect(classify(75, 30, config)).toBe(ProductClassification.A_STRONG);
  });

  it('demotes a high score carrying too much risk', () => {
    expect(classify(75, 50, config)).toBe(ProductClassification.B_NEEDS_VALIDATION);
  });

  it('marks a mid score as B and a low score as C', () => {
    expect(classify(55, 20, config)).toBe(ProductClassification.B_NEEDS_VALIDATION);
    expect(classify(40, 20, config)).toBe(ProductClassification.C_WEAK);
  });

  it('forces C when risk crosses the override threshold, however good the score', () => {
    expect(classify(95, 75, config)).toBe(ProductClassification.C_WEAK);
  });

  it('returns null when there is no final score to classify', () => {
    expect(classify(null, 10, config)).toBeNull();
  });

  it('never grades an INCOMPLETE product, since a grade reads as a verdict too', () => {
    const incomplete = computeFinalScore(subScores(), config, ScoreStatus.INCOMPLETE);

    expect(classify(incomplete.value, 5, config)).toBeNull();
  });
});
