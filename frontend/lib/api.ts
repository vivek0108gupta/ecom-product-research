export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export type DatasetStatus = 'SAMPLE' | 'UNVERIFIED' | 'VERIFIED';
export type ScoreStatus = 'COMPLETE' | 'INCOMPLETE';

export interface RankedProduct {
  rank: number;
  productId: string;
  name: string;
  url: string;
  marketplace: string;
  category: string;
  brand: string | null;
  sellingPrice: number | null;
  estimatedLandedCost: number | null;
  profitPerUnit: number | null;
  profitMarginPercentage: number | null;
  demandScore: number | null;
  competitionOpportunityScore: number | null;
  differentiationScore: number | null;
  shippingSimplicityScore: number | null;
  customerPainOpportunityScore: number | null;
  bundleExpansionScore: number | null;
  riskScore: number | null;
  riskReasons: string[];
  finalScore: number | null;
  classification: 'A' | 'B' | 'C' | null;
  dataCompleteness: number | null;
  datasetStatus: DatasetStatus;
  scoreStatus: ScoreStatus | null;
  missingCriticalFields: string[];
  sourceName: string;
  sourceUrl: string;
  collectedAt: string;
  computedAt: string | null;
}

export interface Summary {
  totalProductsAnalyzed: number;
  productsScored: number;
  productsUnscored: number;
  productsAboveScore70: number;
  averageMarginPercentage: number | null;
  marginDataCoverage: number;
  highRiskProducts: number;
  classificationCounts: { A: number; B: number; C: number; unclassified: number };
  averageDataCompleteness: number | null;
  topCategories: Array<{ category: string; productCount: number; averageScore: number | null }>;
  datasetStatusCounts: Record<DatasetStatus, number>;
  /** Records that survived the verification gate. Placeholder/seed data can never count. */
  realVerifiedProducts: number;
  /** Records that claimed VERIFIED, failed the gate, and are stored as UNVERIFIED. */
  downgradedVerificationClaims: number;
  scoreStatusCounts: Record<ScoreStatus, number>;
  verifiedOpportunityCount: number;
}

export interface OpportunityExplanation {
  rank: number;
  productId: string;
  productName: string;
  category: string;
  marketplace: string;
  currentPrice: number | null;
  estimatedSupplierCost: number | null;
  estimatedLandedCost: number | null;
  profitPerUnit: number | null;
  profitMarginPercentage: number | null;
  demandScore: number | null;
  competitionOpportunityScore: number | null;
  differentiationScore: number | null;
  riskScore: number | null;
  finalScore: number | null;
  classification: string | null;
  mainCustomerPainPoint: string | null;
  differentiationOpportunity: string | null;
  why: {
    demandEvidence: string;
    pricingEvidence: string;
    competitionEvidence: string;
    economicsEvidence: string;
    customerPainEvidence: string;
    differentiationEvidence: string;
    risks: string[];
  };
  suggestedValidationStep: string;
  dataSources: string[];
  dataFreshness: { collectedAt: string; scoreComputedAt: string | null };
  dataCompleteness: number | null;
  datasetStatus: DatasetStatus;
  scoreStatus: ScoreStatus | null;
  missingCriticalFields: string[];
  disclaimer: string;
}

/** Server-side fetch with no caching — research data changes whenever an import runs. */
async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`API ${path} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const getSummary = () => get<Summary>('/analytics/summary');

export interface SourceStatus {
  key: string;
  label: string;
  kind: string;
  enabled: boolean;
  automated: boolean;
  usable: boolean;
  blockedReason: string | null;
  missingEnv: string[];
  adapterImplemented: boolean;
  provides: string[];
  accessRequirements: string;
  pricing: string;
  rateLimits: string;
  termsNotes: string;
  docsUrl?: string;
}

export interface SourceRegistryReport {
  researchedAt: string;
  automatedSourcesConfigured: number;
  state: 'NO_REAL_DATA_SOURCE_CONFIGURED' | 'READY';
  message: string;
  sources: SourceStatus[];
}

export const getDataSources = () => get<SourceRegistryReport>('/data-sources');

export const getTopOpportunities = (limit = 20) =>
  get<OpportunityExplanation[]>(`/analytics/top-opportunities?limit=${limit}`);

/** Only non-SAMPLE products whose score cleared every critical-field check. */
export const getVerifiedOpportunities = (limit = 20) =>
  get<OpportunityExplanation[]>(`/analytics/verified-opportunities?limit=${limit}`);

export const getProducts = (query: string) =>
  get<{ total: number; rows: RankedProduct[] }>(`/products${query ? `?${query}` : ''}`);

export const getCategories = () => get<Array<{ slug: string; label: string }>>('/products/categories');

export const getMarketplaces = () =>
  get<Array<{ id: string; slug: string; name: string }>>('/marketplaces');

export const getProductDetail = (id: string) => get<ProductDetail>(`/products/${id}`);

export const compareProducts = (ids: string[]) =>
  get<ProductDetail[]>(`/products/compare?ids=${ids.join(',')}`);

export interface ProductDetail {
  product: {
    id: string;
    name: string;
    url: string;
    externalId: string | null;
    brand: string | null;
    category: string;
    subcategory: string | null;
    description: string | null;
    features: string[] | null;
    colors: string[] | null;
    sizes: string[] | null;
    weightKg: number | null;
    dimensions: { lengthCm: number; widthCm: number; heightCm: number } | null;
    fragile: boolean | null;
    returnRisk: string | null;
    regulatoryComplexity: string | null;
    brandIpRisk: boolean | null;
    seasonalDemand: boolean | null;
    establishedBrandDominance: boolean | null;
    marketplace: { name: string; slug: string };
    datasetStatus: DatasetStatus;
    /** Why a VERIFIED claim was refused, when one was made and failed. */
    verificationNotes: string[] | null;
    confidenceScore: number | null;
  };
  provenance: {
    source: string | null;
    sourceUrl: string;
    collectedAt: string;
    dataSourceType: string | null;
    complianceNotes: string | null;
  };
  priceHistory: Array<{ sellingPrice: number; mrp: number | null; discountPercentage: number | null; collectedAt: string; sourceName: string }>;
  metricsHistory: Array<{ reviewCount: number | null; averageRating: number | null; competitorCount: number | null; sellerCount: number | null; searchTerm: string | null; collectedAt: string }>;
  costHistory: Array<{ productCost: number | null; shippingCost: number | null; packagingCost: number | null; advertisingCost: number | null; returnAllowance: number | null; sourceName: string; effectiveDate: string }>;
  painPoints: Array<{ type: string; theme: string; mentionCount: number | null; sourceName: string; sourceUrl: string }>;
  profitability: {
    sellingPrice: number;
    costBreakdown: Record<string, number>;
    missingCostFields: string[];
    appliedFees: Array<{ feeType: string; percentage: number | null; amountInr: number; source: string; effectiveDate: string }>;
    totalCost: number;
    estimatedLandedCost: number;
    profitPerUnit: number;
    profitMarginPercentage: number;
    roiPercentage: number | null;
    isReliable: boolean;
    reliabilityNotes: string[];
  } | null;
  score: {
    demandScore: number | null;
    profitabilityScore: number | null;
    competitionOpportunityScore: number | null;
    differentiationScore: number | null;
    shippingSimplicityScore: number | null;
    customerPainOpportunityScore: number | null;
    bundleExpansionScore: number | null;
    finalScore: number | null;
    riskScore: number | null;
    riskReasons: string[];
    classification: string | null;
    scoreStatus: ScoreStatus;
    missingCriticalFields: string[];
    dataCompleteness: number | null;
    weightsSnapshot: Record<string, number>;
    scoreBreakdown: {
      subScores: Record<string, { value: number | null; evidence: Record<string, unknown>; unavailableReason?: string }>;
      effectiveWeights: Record<string, number>;
      contributions: Record<string, number>;
    };
    computedAt: string;
  } | null;
  dataSources: Array<{
    field: string;
    sourceName: string;
    sourceUrl: string | null;
    collectedAt: string;
    confidenceScore: number | null;
    datasetStatus: DatasetStatus;
  }>;
}
