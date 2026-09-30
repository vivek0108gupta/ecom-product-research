/**
 * Types for the subset of Keepa's documented response we consume.
 * Everything is optional because Keepa omits fields that do not apply to a product —
 * absence is meaningful and must survive into `null`, not a default.
 */

export interface KeepaStats {
  /** Latest value per Price Type index. -1 = no offer, -2 = not available. */
  current?: number[];
  avg?: number[];
  avg30?: number[];
  avg90?: number[];
  avg180?: number[];
  avg365?: number[];
  /** [keepaMinutes, value] per price type, or null. */
  min?: Array<[number, number] | null>;
  max?: Array<[number, number] | null>;
  buyBoxPrice?: number;
  buyBoxShipping?: number;
  buyBoxIsFBA?: boolean;
  salesRankDrops30?: number;
  salesRankDrops90?: number;
  salesRankDrops180?: number;
  salesRankDrops365?: number;
  outOfStockPercentage30?: number;
  outOfStockPercentage90?: number;
}

export interface KeepaImage {
  l?: string;
  m?: string;
  lH?: number;
  lW?: number;
}

export interface KeepaCategoryTreeNode {
  catId: number;
  name: string;
}

export interface KeepaProduct {
  asin?: string;
  domainId?: number;
  /** Must be evaluated first: determines what data is available. */
  productType?: number;
  title?: string;
  brand?: string;
  manufacturer?: string;
  /** Flat history arrays, alternating [keepaMinutes, value, keepaMinutes, value, ...]. */
  csv?: Array<number[] | null>;
  stats?: KeepaStats;
  images?: KeepaImage[];
  imagesCSV?: string;
  categories?: number[];
  categoryTree?: KeepaCategoryTreeNode[];
  rootCategory?: number;
  /** Sales rank history keyed by categoryId. */
  salesRanks?: Record<string, number[]>;
  salesRankReference?: number;
  availabilityAmazon?: number;
  lastUpdate?: number;
  lastPriceChange?: number;
  /** Package dimensions in millimetres / grams, per the product object docs. */
  packageLength?: number;
  packageWidth?: number;
  packageHeight?: number;
  packageWeight?: number;
  itemLength?: number;
  itemWidth?: number;
  itemHeight?: number;
  itemWeight?: number;
  features?: string[];
  description?: string;
  color?: string;
  size?: string;
  variations?: Array<{ asin: string }>;
}

/** The envelope every Keepa response carries, including token-bucket state. */
export interface KeepaResponse {
  timestamp?: number;
  tokensLeft?: number;
  refillIn?: number;
  refillRate?: number;
  tokensConsumed?: number;
  tokenFlowReduction?: number;
  processingTimeInMs?: number;
  products?: KeepaProduct[];
  error?: { type?: string; message?: string };
}

export interface KeepaTokenState {
  tokensLeft: number;
  refillRate: number;
  refillInMs: number;
  observedAt: Date;
}
