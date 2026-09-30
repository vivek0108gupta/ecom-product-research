import { ProductClassification, ScoreStatus } from '../../common/interfaces/enums';
import { SCORE_COMPONENT_KEYS, ScoringConfig } from '../../config/scoring-config.types';
import { CohortStats, FinalScoreResult, RiskResult, ScoringInput, SubScore, SubScores } from './scoring.types';

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Scale a value to 0-100 against the range seen in its cohort.
 * When every product in the cohort has the same value there is no relative information
 * available, so the product sits at the neutral midpoint (50) rather than being
 * flattered with 100 or punished with 0.
 */
export function minMaxNormalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return 50;
  }
  return clamp(((value - min) / (max - min)) * 100);
}

/**
 * DEMAND (0-100). Review count is an indirect popularity signal, never a sales number.
 * Volume is log-scaled first so one runaway listing doesn't flatten everything else,
 * then normalized against the product's category cohort, then blended with rating.
 */
export function demandScore(input: ScoringInput, cohort: CohortStats, config: ScoringConfig): SubScore {
  if (input.reviewCount === null || input.averageRating === null) {
    return {
      value: null,
      evidence: { reviewCount: input.reviewCount, averageRating: input.averageRating },
      unavailableReason: 'Requires both review count and average rating.',
    };
  }

  const { reviewVolumeWeight, ratingWeight } = config.demandScore;
  const logReviews = Math.log(input.reviewCount + 1);
  const volumeComponent = minMaxNormalize(logReviews, cohort.logReviewsMin, cohort.logReviewsMax);
  const ratingComponent = clamp((input.averageRating / 5) * 100);
  const value = round2(volumeComponent * reviewVolumeWeight + ratingComponent * ratingWeight);

  return {
    value,
    evidence: {
      reviewCount: input.reviewCount,
      averageRating: input.averageRating,
      logReviews: round2(logReviews),
      volumeComponent: round2(volumeComponent),
      ratingComponent: round2(ratingComponent),
      cohort: cohort.cohortLabel,
      cohortSize: cohort.cohortSize,
      formula: `${reviewVolumeWeight} * normalized(ln(reviews+1)) + ${ratingWeight} * (rating/5*100)`,
    },
  };
}

/**
 * COMPETITION OPPORTUNITY (0-100).
 * 100 = relatively attractive competition environment (few comparable listings).
 *   0 = extremely difficult (crowded, or dominated by established brands).
 * This direction is used consistently everywhere in the system; there is deliberately
 * no separate "competition_score" that would invert the meaning.
 */
export function competitionOpportunityScore(input: ScoringInput, cohort: CohortStats, config: ScoringConfig): SubScore {
  if (input.competitorCount === null) {
    return {
      value: null,
      evidence: { competitorCount: null },
      unavailableReason: 'Requires a counted number of comparable competing listings.',
    };
  }

  const intensity = minMaxNormalize(input.competitorCount, cohort.competitorMin, cohort.competitorMax);
  const brandPenalty = input.establishedBrandDominance ? config.competitionOpportunityScore.establishedBrandDominancePenalty : 0;
  const value = round2(clamp(100 - intensity - brandPenalty));

  return {
    value,
    evidence: {
      competitorCount: input.competitorCount,
      competitionIntensity: round2(intensity),
      establishedBrandDominance: input.establishedBrandDominance,
      brandPenalty,
      cohort: cohort.cohortLabel,
      cohortSize: cohort.cohortSize,
      formula: '100 - normalized(competitor_count) - established_brand_penalty',
      direction: '100 = attractive competition environment, 0 = extremely difficult',
    },
  };
}

/**
 * DIFFERENTIATION (0-100), from opportunities the researcher recorded against real reviews.
 * Null when no reviews were analysed at all — distinct from 0, which means
 * "reviews were read and no actionable gap was found".
 */
export function differentiationScore(input: ScoringInput, config: ScoringConfig): SubScore {
  if (!input.painPointsCollected) {
    return {
      value: null,
      evidence: { opportunityCount: 0 },
      unavailableReason: 'No review-derived observations collected for this product.',
    };
  }

  const value = round2(clamp(input.opportunityCount * config.differentiationScore.pointsPerOpportunity));
  return {
    value,
    evidence: {
      opportunityCount: input.opportunityCount,
      pointsPerOpportunity: config.differentiationScore.pointsPerOpportunity,
      formula: 'min(opportunity_count * points_per_opportunity, 100)',
    },
  };
}

/**
 * CUSTOMER PAIN POINT OPPORTUNITY (0-100).
 * More documented complaints against competing listings = more room to win by fixing them.
 */
export function customerPainOpportunityScore(input: ScoringInput, config: ScoringConfig): SubScore {
  if (!input.painPointsCollected) {
    return {
      value: null,
      evidence: { complaintCount: 0 },
      unavailableReason: 'No review-derived observations collected for this product.',
    };
  }

  const value = round2(clamp(input.complaintCount * config.customerPainOpportunityScore.pointsPerComplaint));
  return {
    value,
    evidence: {
      complaintCount: input.complaintCount,
      pointsPerComplaint: config.customerPainOpportunityScore.pointsPerComplaint,
      formula: 'min(complaint_count * points_per_complaint, 100)',
    },
  };
}

/** SHIPPING SIMPLICITY (0-100): 100 = light, compact, robust; 0 = heavy, bulky, fragile. */
export function shippingSimplicityScore(input: ScoringInput, config: ScoringConfig): SubScore {
  if (input.weightKg === null) {
    return {
      value: null,
      evidence: { weightKg: null },
      unavailableReason: 'Requires product weight.',
    };
  }

  const { weightPenaltyBandsKg, volumetricPenaltyBandsCm3, fragilePenalty } = config.shippingSimplicityScore;

  const weightPenalty = weightPenaltyBandsKg.find((band) => band.maxKg === null || input.weightKg! <= band.maxKg)?.penalty ?? 0;

  let volumeCm3: number | null = null;
  let volumePenalty = 0;
  if (input.dimensions) {
    volumeCm3 = input.dimensions.lengthCm * input.dimensions.widthCm * input.dimensions.heightCm;
    volumePenalty = volumetricPenaltyBandsCm3.find((band) => band.maxCm3 === null || volumeCm3! <= band.maxCm3)?.penalty ?? 0;
  }

  const fragilePenaltyApplied = input.fragile ? fragilePenalty : 0;
  const value = round2(clamp(100 - weightPenalty - volumePenalty - fragilePenaltyApplied));

  return {
    value,
    evidence: {
      weightKg: input.weightKg,
      weightPenalty,
      volumeCm3,
      volumePenalty,
      fragile: input.fragile,
      fragilePenalty: fragilePenaltyApplied,
      dimensionsAvailable: input.dimensions !== null,
      formula: '100 - weight_penalty - volumetric_penalty - fragile_penalty',
    },
  };
}

/**
 * BUNDLE / EXPANSION POTENTIAL (0-100).
 * A researcher-supplied value always wins. Otherwise a documented per-category baseline
 * from config is used. If neither exists the score is null — it is never invented.
 */
export function bundleExpansionScore(input: ScoringInput, config: ScoringConfig): SubScore {
  if (input.bundlePotentialScore !== null) {
    return {
      value: round2(clamp(input.bundlePotentialScore)),
      evidence: { source: 'manual_override', manualValue: input.bundlePotentialScore },
    };
  }

  const baseline = config.bundleExpansionScore.categoryBaselines[input.category];
  if (baseline === undefined) {
    return {
      value: null,
      evidence: { category: input.category },
      unavailableReason: `No manual value and no category baseline configured for '${input.category}'.`,
    };
  }

  return {
    value: round2(clamp(baseline)),
    evidence: { source: 'category_baseline', category: input.category, baseline },
  };
}

/** PROFITABILITY (0-100): margin scaled linearly between the configured floor and ceiling. */
export function profitabilityScore(input: ScoringInput, config: ScoringConfig): SubScore {
  const profit = input.profitability;
  if (!profit || !profit.isReliable) {
    return {
      value: null,
      evidence: { reason: profit ? profit.reliabilityNotes : 'No selling price or cost data.' },
      unavailableReason: 'Requires a selling price and a supplier/product cost.',
    };
  }

  const { marginFloorPct, marginCeilingPct } = config.profitabilityScore;
  const span = marginCeilingPct - marginFloorPct;
  const value = round2(clamp(((profit.profitMarginPercentage - marginFloorPct) / span) * 100));

  return {
    value,
    evidence: {
      profitMarginPercentage: profit.profitMarginPercentage,
      profitPerUnit: profit.profitPerUnit,
      sellingPrice: profit.sellingPrice,
      totalCost: profit.totalCost,
      marginFloorPct,
      marginCeilingPct,
      missingCostFields: profit.missingCostFields,
      formula: 'clamp((margin% - floor%) / (ceiling% - floor%) * 100, 0, 100)',
    },
  };
}

/**
 * Weighted final score. Components with no data are dropped and the remaining weights
 * are renormalized, so a product isn't punished for a signal nobody collected.
 * `dataCompleteness` reports how much of the intended weight was actually backed by data —
 * a 78 built from 40% of the signals is not the same as a 78 built from all of them.
 */
export function computeFinalScore(
  subScores: SubScores,
  config: ScoringConfig,
  scoreStatus: ScoreStatus = ScoreStatus.COMPLETE,
): FinalScoreResult {
  const weights = config.finalScoreWeights;
  const available = SCORE_COMPONENT_KEYS.filter((key) => subScores[key].value !== null);

  // Critical inputs missing: report the contributing weights for transparency, but withhold
  // the headline number rather than publishing one that would be read as a verdict.
  if (scoreStatus === ScoreStatus.INCOMPLETE) {
    const availableWeightSum = available.reduce((sum, key) => sum + weights[key], 0);
    return {
      value: null,
      effectiveWeights: {},
      dataCompleteness: round2(availableWeightSum),
      contributions: {},
    };
  }
  const availableWeight = available.reduce((sum, key) => sum + weights[key], 0);

  if (available.length === 0 || availableWeight === 0) {
    return { value: null, effectiveWeights: {}, dataCompleteness: 0, contributions: {} };
  }

  const effectiveWeights: Record<string, number> = {};
  const contributions: Record<string, number> = {};
  let total = 0;

  for (const key of available) {
    const effectiveWeight = weights[key] / availableWeight;
    const contribution = subScores[key].value! * effectiveWeight;
    // 4dp so the recorded weights still sum to 1 and the breakdown reconciles against the score.
    effectiveWeights[key] = Math.round(effectiveWeight * 10000) / 10000;
    contributions[key] = round2(contribution);
    total += contribution;
  }

  return {
    value: round2(clamp(total)),
    effectiveWeights,
    dataCompleteness: round2(availableWeight),
    contributions,
  };
}

/**
 * RISK (0-100, higher = riskier). Deliberately NOT folded into the final score:
 * opportunity and risk are reported side by side so a high-risk, high-opportunity
 * product stays visible instead of being averaged into the middle.
 * Every penalty applied is named in `reasons`.
 */
export function computeRiskScore(input: ScoringInput, subScores: SubScores, config: ScoringConfig): RiskResult {
  const cfg = config.riskScore;
  const reasons: string[] = [];
  const evidence: Record<string, unknown> = {};
  let risk = 0;

  if (input.fragile) {
    risk += cfg.fragilePenalty;
    reasons.push('Fragile product');
    evidence.fragile = cfg.fragilePenalty;
  }

  const shipping = subScores.shippingSimplicity.value;
  if (shipping !== null && shipping < cfg.heavyOrBulkyShippingSimplicityThreshold) {
    risk += cfg.heavyOrBulkyPenalty;
    reasons.push('Heavy or bulky to ship');
    evidence.heavyOrBulky = cfg.heavyOrBulkyPenalty;
  }

  const margin = input.profitability?.isReliable ? input.profitability.profitMarginPercentage : null;
  if (margin !== null && margin < cfg.lowMarginThresholdPct) {
    risk += cfg.lowMarginPenalty;
    reasons.push(`Low margin (${margin}% < ${cfg.lowMarginThresholdPct}%)`);
    evidence.lowMargin = cfg.lowMarginPenalty;
  }

  const competition = subScores.competitionOpportunity.value;
  if (competition !== null && competition < cfg.highCompetitionOpportunityThreshold) {
    risk += cfg.highCompetitionPenalty;
    reasons.push('High competition');
    evidence.highCompetition = cfg.highCompetitionPenalty;
  }

  if (input.establishedBrandDominance) {
    risk += cfg.establishedBrandDominancePenalty;
    reasons.push('Strong established brands');
    evidence.establishedBrandDominance = cfg.establishedBrandDominancePenalty;
  }

  if (input.returnRisk) {
    const penalty = cfg.returnRiskPenalty[input.returnRisk] ?? 0;
    if (penalty > 0) {
      risk += penalty;
      reasons.push(`${input.returnRisk} return risk`);
      evidence.returnRisk = penalty;
    }
  }

  if (input.regulatoryComplexity) {
    const penalty = cfg.regulatoryComplexityPenalty[input.regulatoryComplexity] ?? 0;
    if (penalty > 0) {
      risk += penalty;
      reasons.push(`${input.regulatoryComplexity} regulatory complexity`);
      evidence.regulatoryComplexity = penalty;
    }
  }

  if (input.brandIpRisk) {
    risk += cfg.brandIpRiskPenalty;
    reasons.push('Brand/IP risk');
    evidence.brandIpRisk = cfg.brandIpRiskPenalty;
  }

  if (input.seasonalDemand) {
    risk += cfg.seasonalDemandPenalty;
    reasons.push('Seasonal demand');
    evidence.seasonalDemand = cfg.seasonalDemandPenalty;
  }

  if (!input.profitability?.isReliable) {
    reasons.push('Quality uncertainty: no verified cost data');
  }

  return { value: round2(clamp(risk)), reasons, evidence };
}

/**
 * A / B / C classification from the final score and risk score, using configured thresholds.
 * Returns null when there is no Final Score — an INCOMPLETE product is never graded,
 * because a grade reads as a verdict just as much as a score does.
 */
export function classify(
  finalScore: number | null,
  riskScore: number,
  config: ScoringConfig,
): ProductClassification | null {
  if (finalScore === null) {
    return null;
  }
  const { strongCandidate, needsValidation, weakCandidateRiskOverride } = config.classification;

  if (riskScore >= weakCandidateRiskOverride.minRiskScore) {
    return ProductClassification.C_WEAK;
  }
  if (finalScore >= strongCandidate.minFinalScore && riskScore <= strongCandidate.maxRiskScore) {
    return ProductClassification.A_STRONG;
  }
  if (finalScore >= needsValidation.minFinalScore) {
    return ProductClassification.B_NEEDS_VALIDATION;
  }
  return ProductClassification.C_WEAK;
}
