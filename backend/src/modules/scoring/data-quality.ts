import { CRITICAL_FIELD_DESCRIPTIONS, CriticalField, ScoreStatus } from '../../common/interfaces/enums';
import { ScoringInput } from './scoring.types';

export interface DataQualityResult {
  scoreStatus: ScoreStatus;
  missingCriticalFields: CriticalField[];
  /** Human-readable list for direct display, e.g. in the UI or an export cell. */
  missingCriticalFieldLabels: string[];
}

/**
 * Decides whether a product has enough real data to deserve a Final Score.
 *
 * A Final Score blends seven signals. If a critical input is absent, the renormalization
 * that keeps partial scores fair also makes them flattering: a product with no cost data
 * and no competition data can score well purely on the signals that happen to exist.
 * That is a false positive presented with a confident number, which is the single most
 * damaging thing this system could produce. So instead of a partial Final Score we emit
 * ScoreStatus.INCOMPLETE and name the gaps.
 *
 * Sub-scores are still computed and shown — the transparency is not withheld, only the
 * single headline number that would be read as a verdict.
 */
export function assessDataQuality(input: ScoringInput): DataQualityResult {
  const missing: CriticalField[] = [];

  if (input.sellingPrice === null) {
    missing.push(CriticalField.SELLING_PRICE);
  }

  if (input.productCost === null) {
    missing.push(CriticalField.PRODUCT_COST);
  }

  if (!input.marketplaceId) {
    missing.push(CriticalField.MARKETPLACE);
  }

  // Demand needs both halves: a review count with no rating (or vice versa) cannot
  // produce the blended demand score.
  if (input.reviewCount === null || input.averageRating === null) {
    missing.push(CriticalField.DEMAND_SIGNAL);
  }

  if (input.competitorCount === null) {
    missing.push(CriticalField.COMPETITION_SIGNAL);
  }

  if (!input.sourceName || !input.sourceUrl) {
    missing.push(CriticalField.SOURCE);
  }

  if (!input.collectedAt || Number.isNaN(new Date(input.collectedAt).getTime())) {
    missing.push(CriticalField.COLLECTED_AT);
  }

  return {
    scoreStatus: missing.length === 0 ? ScoreStatus.COMPLETE : ScoreStatus.INCOMPLETE,
    missingCriticalFields: missing,
    missingCriticalFieldLabels: missing.map((field) => CRITICAL_FIELD_DESCRIPTIONS[field]),
  };
}
