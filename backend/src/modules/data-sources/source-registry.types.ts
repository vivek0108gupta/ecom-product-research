/** Capability flags mirror the ProductSourceAdapter surface a source can actually serve. */
export interface SourceCapabilityFlags {
  searchProducts: boolean;
  getProductDetails: boolean;
  getPricing: boolean;
  getReviews: boolean;
  getCategories: boolean;
}

export type SourceKind =
  | 'manual'
  | 'official_api'
  | 'affiliate_api'
  | 'licensed_api'
  | 'open_network'
  | 'public_dataset'
  | 'third_party_collector';

/** One entry in config/data-sources.json. */
export interface SourceDefinition {
  key: string;
  label: string;
  adapter: string | null;
  kind: SourceKind;
  enabled: boolean;
  requiredEnv: string[];
  docsUrl?: string;
  provides: string[];
  capabilities: SourceCapabilityFlags;
  accessRequirements: string;
  pricing: string;
  rateLimits: string;
  termsNotes: string;
  /** True when the source can collect without a person transcribing each record. */
  automated: boolean;
}

export interface SourceStatus extends SourceDefinition {
  /** Enabled, credentials present, and an adapter implementation registered. */
  usable: boolean;
  /** Env vars this source needs that are currently unset. */
  missingEnv: string[];
  /** False when the config names an adapter that has no implementation yet. */
  adapterImplemented: boolean;
  blockedReason: string | null;
}

export interface SourceRegistryReport {
  researchedAt: string;
  /** Sources that can actually collect right now without a person typing rows. */
  automatedSourcesConfigured: number;
  /** The headline state for the dashboard when nothing automated is wired up. */
  state: 'NO_REAL_DATA_SOURCE_CONFIGURED' | 'READY';
  message: string;
  sources: SourceStatus[];
}
