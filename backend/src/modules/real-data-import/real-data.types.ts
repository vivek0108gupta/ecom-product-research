/**
 * The real-data import contract.
 *
 * Deliberately separate from the demo/seed CSV shape: this pipeline exists to accept
 * permitted, traceable research about real listings, and it refuses anything that looks
 * like sample data. Field names here are the canonical ones used in the provenance ledger.
 */

/** Fields without which a real record cannot be accepted at all. */
export const REQUIRED_FIELDS = [
  'product_name',
  'marketplace',
  'product_url',
  'observed_price',
  'observed_at',
  'source_url',
  'source_name',
] as const;

/** Accepted when present; never invented when absent. */
export const OPTIONAL_FIELDS = [
  'product_id',
  'category',
  'brand',
  'description',
  'rating',
  'review_count',
  'supplier_cost',
  'shipping_cost',
  'packaging_cost',
  'marketplace_fee',
  'payment_fee',
  'advertising_cost',
  'return_allowance',
  'other_costs',
  'cost_source_name',
  'cost_source_url',
  'product_weight',
  'product_dimensions',
  'demand_signal',
  'competition_signal',
  'seller_count',
  'best_seller_rank',
  'search_term',
  'mrp',
  'currency',
  'confidence_score',
  'fragile',
  'return_risk',
  'regulatory_complexity',
  'brand_ip_risk',
  'seasonal_demand',
  'established_brand_dominance',
  'complaints',
  'positives',
  'opportunities',
  'verification_requested',
] as const;

export type RequiredField = (typeof REQUIRED_FIELDS)[number];
export type OptionalField = (typeof OPTIONAL_FIELDS)[number];
export type ImportField = RequiredField | OptionalField;

/**
 * One field as supplied, with the provenance written to the ledger.
 * `fieldName` is a plain string rather than the CSV schema union because the ledger also
 * records source-native fields (Keepa's buy_box_price, sales_rank_drops_30d, …).
 */
export interface FieldObservation {
  fieldName: string;
  rawValue: string;
  numericValue: number | null;
}

export type RejectionCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'PLACEHOLDER_URL'
  | 'SEED_DATA_SOURCE'
  | 'SAMPLE_STATUS_NOT_ALLOWED'
  | 'INVALID_VALUE'
  | 'UNKNOWN_MARKETPLACE'
  | 'UNKNOWN_CATEGORY'
  | 'DUPLICATE_IN_FILE'
  | 'MALFORMED_RECORD';

export interface RecordRejection {
  /** 1-based position in the submitted file (CSV line number, or JSON array index + 1). */
  record: number;
  identifier: string | null;
  code: RejectionCode;
  errors: string[];
}

export interface RecordWarning {
  record: number;
  identifier: string | null;
  warnings: string[];
}

/** A record that was accepted but is missing one or more inputs the Final Score needs. */
export interface MissingCriticalFieldReport {
  record: number;
  identifier: string | null;
  missing: string[];
}

/**
 * The import report (requirement: records imported / rejected / validation errors /
 * duplicates / missing critical fields). Returned by the API and persisted on the run.
 */
export interface ImportReport {
  runId: string;
  format: 'csv' | 'json';
  submitted: number;
  imported: number;
  created: number;
  updated: number;
  rejected: number;
  duplicatesInFile: number;
  duplicatesMergedIntoExisting: number;
  /** Accepted records that still lack a critical input, so no Final Score will be issued. */
  recordsMissingCriticalFields: MissingCriticalFieldReport[];
  rejections: RecordRejection[];
  warnings: RecordWarning[];
  /** Records that asked for VERIFIED and did not earn it. */
  verificationDowngrades: Array<{ record: number; identifier: string | null; reasons: string[] }>;
  startedAt: string;
  finishedAt: string;
}
