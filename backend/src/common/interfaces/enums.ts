export enum DataSourceType {
  MANUAL = 'manual',
  API = 'api',
  PERMITTED_FEED = 'permitted_feed',
}

/**
 * How much trust a product's data has earned.
 *
 * SAMPLE      - demo/seed data. Describes no real listing. Must never be presented as a
 *               validated, profitable, best or recommended product anywhere in the system.
 * UNVERIFIED - real researched data that has not been independently double-checked.
 * VERIFIED    - real data confirmed against the live listing and a supplier quote.
 *
 * Default for an import is UNVERIFIED: claiming VERIFIED requires an explicit statement
 * from the researcher, never an inference by this system.
 */
export enum DatasetStatus {
  SAMPLE = 'SAMPLE',
  UNVERIFIED = 'UNVERIFIED',
  VERIFIED = 'VERIFIED',
}

/**
 * COMPLETE   - every critical input was present; a Final Score was produced.
 * INCOMPLETE - at least one critical input is missing. No Final Score is produced, and
 *              the missing fields are named on the score record.
 */
export enum ScoreStatus {
  COMPLETE = 'COMPLETE',
  INCOMPLETE = 'INCOMPLETE',
}

/**
 * Inputs without which a Final Score is not meaningful. Each maps to a concrete,
 * checkable value — see data-quality.ts.
 */
export enum CriticalField {
  SELLING_PRICE = 'selling_price',
  PRODUCT_COST = 'product_cost',
  MARKETPLACE = 'marketplace',
  DEMAND_SIGNAL = 'demand_signal',
  COMPETITION_SIGNAL = 'competition_signal',
  SOURCE = 'source',
  COLLECTED_AT = 'collected_at',
}

export const CRITICAL_FIELD_DESCRIPTIONS: Record<CriticalField, string> = {
  [CriticalField.SELLING_PRICE]: 'Current selling price (INR)',
  [CriticalField.PRODUCT_COST]: 'Supplier/product cost per unit (INR)',
  [CriticalField.MARKETPLACE]: 'Marketplace the listing belongs to',
  [CriticalField.DEMAND_SIGNAL]: 'Demand signal (review count and average rating)',
  [CriticalField.COMPETITION_SIGNAL]: 'Competition signal (count of comparable listings)',
  [CriticalField.SOURCE]: 'Named source and source URL for the record',
  [CriticalField.COLLECTED_AT]: 'Timestamp the data was collected',
};

/**
 * Where a stored value came from. These must never be mixed: a calculated figure presented
 * as an observation is the same failure mode as fabricated data.
 *
 * OBSERVED   - read directly from a source. The source said this.
 * CALCULATED - derived deterministically from observed values by a documented formula
 *              (margin, discount %, scores). Reproducible from the inputs.
 * INFERRED   - produced by a model or heuristic that goes beyond the data (e.g. estimating
 *              units sold from a sales rank). Requires a documented, cited model, and is
 *              not used anywhere in this system today.
 */
export enum DataOrigin {
  OBSERVED = 'OBSERVED',
  CALCULATED = 'CALCULATED',
  INFERRED = 'INFERRED',
}

export enum PainPointType {
  COMPLAINT = 'complaint',
  POSITIVE = 'positive',
  OPPORTUNITY = 'opportunity',
}

export enum RiskLevel {
  NONE = 'none',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum ProductClassification {
  A_STRONG = 'A',
  B_NEEDS_VALIDATION = 'B',
  C_WEAK = 'C',
}

export enum RunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum FeeType {
  REFERRAL_PERCENTAGE = 'referral_percentage',
  COMMISSION_PERCENTAGE = 'commission_percentage',
  CLOSING_FEE_FIXED_INR = 'closing_fee_fixed_inr',
  COLLECTION_FEE_PERCENTAGE = 'collection_fee_percentage',
  PAYMENT_GATEWAY_PERCENTAGE = 'payment_gateway_percentage',
  FIXED_INR = 'fixed_inr',
  OTHER_PERCENTAGE = 'other_percentage',
}

export const PERCENTAGE_FEE_TYPES: ReadonlySet<string> = new Set([
  FeeType.REFERRAL_PERCENTAGE,
  FeeType.COMMISSION_PERCENTAGE,
  FeeType.COLLECTION_FEE_PERCENTAGE,
  FeeType.PAYMENT_GATEWAY_PERCENTAGE,
  FeeType.OTHER_PERCENTAGE,
]);
