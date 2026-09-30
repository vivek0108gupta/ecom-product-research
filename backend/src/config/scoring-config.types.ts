export interface WeightBandKg {
  maxKg: number | null;
  penalty: number;
}

export interface WeightBandCm3 {
  maxCm3: number | null;
  penalty: number;
}

export interface FinalScoreWeights {
  demand: number;
  profitability: number;
  competitionOpportunity: number;
  differentiation: number;
  shippingSimplicity: number;
  customerPainOpportunity: number;
  bundleExpansion: number;
}

export type ScoreComponentKey = keyof FinalScoreWeights;

/**
 * The seven scoring components are structural — config supplies their weights, not their
 * existence. Iterating this list (rather than Object.keys on the config) keeps stray or
 * commented-out keys in the JSON from being treated as components.
 */
export const SCORE_COMPONENT_KEYS: readonly ScoreComponentKey[] = [
  'demand',
  'profitability',
  'competitionOpportunity',
  'differentiation',
  'shippingSimplicity',
  'customerPainOpportunity',
  'bundleExpansion',
] as const;

export interface ScoringConfig {
  finalScoreWeights: FinalScoreWeights;
  demandScore: { reviewVolumeWeight: number; ratingWeight: number };
  competitionOpportunityScore: { establishedBrandDominancePenalty: number };
  differentiationScore: { pointsPerOpportunity: number };
  customerPainOpportunityScore: { pointsPerComplaint: number };
  shippingSimplicityScore: {
    fragilePenalty: number;
    weightPenaltyBandsKg: WeightBandKg[];
    volumetricPenaltyBandsCm3: WeightBandCm3[];
  };
  bundleExpansionScore: { categoryBaselines: Record<string, number> };
  profitabilityScore: { marginFloorPct: number; marginCeilingPct: number };
  riskScore: {
    fragilePenalty: number;
    heavyOrBulkyPenalty: number;
    heavyOrBulkyShippingSimplicityThreshold: number;
    lowMarginPenalty: number;
    lowMarginThresholdPct: number;
    highCompetitionPenalty: number;
    highCompetitionOpportunityThreshold: number;
    establishedBrandDominancePenalty: number;
    returnRiskPenalty: Record<string, number>;
    regulatoryComplexityPenalty: Record<string, number>;
    brandIpRiskPenalty: number;
    seasonalDemandPenalty: number;
  };
  classification: {
    strongCandidate: { minFinalScore: number; maxRiskScore: number };
    needsValidation: { minFinalScore: number };
    weakCandidateRiskOverride: { minRiskScore: number };
  };
}

export interface CategoryDefinition {
  slug: string;
  label: string;
}
