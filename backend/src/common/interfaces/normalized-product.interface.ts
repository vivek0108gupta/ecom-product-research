import { DatasetStatus, PainPointType, RiskLevel } from './enums';
import { ProductDimensions } from '../../database/entities/product.entity';

/**
 * The single shape every data source must produce. Business logic (normalization,
 * scoring, profitability) only ever sees this — never a marketplace-specific payload.
 *
 * Any field the source could not observe must be `null`. Do not substitute defaults:
 * "unknown weight" and "zero weight" mean very different things downstream.
 */
export interface NormalizedProduct {
  // --- Identity ---
  name: string;
  /** Lowercased, punctuation-stripped form of `name`, used as the third dedup key. */
  normalizedName: string;
  url: string;
  marketplaceSlug: string;
  externalId: string | null;
  brand: string | null;
  category: string;
  subcategory: string | null;

  // --- Descriptive ---
  description: string | null;
  features: string[] | null;
  variants: string[] | null;
  sizes: string[] | null;
  colors: string[] | null;
  imageUrls: string[] | null;
  weightKg: number | null;
  dimensions: ProductDimensions | null;

  // --- Pricing (INR) ---
  sellingPrice: number;
  mrp: number | null;
  discountPercentage: number | null;
  currency: string;

  // --- Demand / competition signals ---
  reviewCount: number | null;
  averageRating: number | null;
  competitorCount: number | null;
  sellerCount: number | null;
  bestSellerRank: number | null;
  searchTerm: string | null;

  // --- Cost inputs (INR per unit) ---
  costs: NormalizedCostInputs | null;

  // --- Qualitative risk flags, null when not assessed ---
  fragile: boolean | null;
  returnRisk: RiskLevel | null;
  regulatoryComplexity: RiskLevel | null;
  brandIpRisk: boolean | null;
  seasonalDemand: boolean | null;
  establishedBrandDominance: boolean | null;
  bundlePotentialScore: number | null;

  // --- Review-derived observations, each traceable to the listing it was read from ---
  painPoints: NormalizedPainPoint[];

  // --- Provenance. Every externally sourced record carries all four. ---
  sourceName: string;
  sourceUrl: string;
  collectedAt: Date;
  confidenceScore: number | null;

  /**
   * SAMPLE for demo rows, VERIFIED only when the researcher explicitly says so,
   * UNVERIFIED otherwise. Never inferred from the data itself.
   */
  datasetStatus: DatasetStatus;
}

export interface NormalizedCostInputs {
  productCost: number | null;
  shippingCost: number | null;
  packagingCost: number | null;
  marketplaceFeeOverride: number | null;
  paymentFee: number | null;
  advertisingCost: number | null;
  returnAllowance: number | null;
  otherCosts: number | null;
  sourceName: string;
  sourceUrl: string | null;
}

export interface NormalizedPainPoint {
  type: PainPointType;
  theme: string;
  detail: string | null;
  mentionCount: number | null;
  sourceName: string;
  sourceUrl: string;
  confidenceScore: number | null;
}
