import { RiskLevel } from '../../common/interfaces/enums';
import { ProductDimensions } from '../../database/entities/product.entity';
import { ProfitabilityResult } from '../profitability/profitability.types';
import { ScoreComponentKey } from '../../config/scoring-config.types';

/** Everything the scoring engine is allowed to look at for one product. */
export interface ScoringInput {
  productId: string;
  category: string;
  marketplaceId: string;
  /** Raw critical inputs, kept alongside the derived profitability result so the
   *  data-quality check can see what was actually collected rather than what survived. */
  sellingPrice: number | null;
  productCost: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  collectedAt: Date | null;
  weightKg: number | null;
  dimensions: ProductDimensions | null;
  fragile: boolean | null;
  returnRisk: RiskLevel | null;
  regulatoryComplexity: RiskLevel | null;
  brandIpRisk: boolean | null;
  seasonalDemand: boolean | null;
  establishedBrandDominance: boolean | null;
  bundlePotentialScore: number | null;
  reviewCount: number | null;
  averageRating: number | null;
  competitorCount: number | null;
  /** True if any review-derived row exists, i.e. reviews were actually read for this product. */
  painPointsCollected: boolean;
  complaintCount: number;
  opportunityCount: number;
  profitability: ProfitabilityResult | null;
}

/** Min/max ranges used to normalize a product against comparable products. */
export interface CohortStats {
  logReviewsMin: number;
  logReviewsMax: number;
  competitorMin: number;
  competitorMax: number;
  cohortSize: number;
  cohortLabel: string;
}

/** A sub-score plus the raw inputs it came from, so any number can be audited. */
export interface SubScore {
  value: number | null;
  evidence: Record<string, unknown>;
  unavailableReason?: string;
}

export type SubScores = Record<ScoreComponentKey, SubScore>;

export interface RiskResult {
  value: number;
  reasons: string[];
  evidence: Record<string, unknown>;
}

export interface FinalScoreResult {
  /** Null when critical inputs are missing — see assessDataQuality(). */
  value: number | null;
  /** Weights actually used after dropping unavailable components and renormalizing. */
  effectiveWeights: Record<string, number>;
  dataCompleteness: number;
  contributions: Record<string, number>;
}
