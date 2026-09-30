import { NormalizedProduct } from './normalized-product.interface';

export interface SearchOptions {
  category: string;
  searchTerm?: string;
  limit?: number;
}

export interface SourceCapabilities {
  /** Whether this source can legitimately supply each kind of data. */
  search: boolean;
  productDetails: boolean;
  pricing: boolean;
  /** False unless the source's terms and applicable law actually permit review collection. */
  reviews: boolean;
  categoryData: boolean;
}

export interface RawReview {
  rating: number | null;
  title: string | null;
  body: string | null;
  postedAt: Date | null;
  sourceUrl: string;
}

export interface CategoryData {
  /** Source-native category identifier, e.g. a Keepa/Amazon browse node id. */
  sourceCategoryId: string | null;
  category: string;
  listingCount: number | null;
  priceMin: number | null;
  priceMax: number | null;
  sourceUrl: string;
  collectedAt: Date;
}

/**
 * Every data source implements this. Nothing downstream of an adapter knows or cares
 * which marketplace the data came from — that is the whole point of the interface.
 *
 * Compliance contract for implementors:
 *  - Only collect from sources whose ToS, robots.txt and rate limits permit it.
 *  - Prefer an official API. Never bypass CAPTCHAs, logins, paywalls or anti-bot controls.
 *  - Declare honestly in `capabilities` what the source is permitted to provide;
 *    an unsupported method must throw UnsupportedOperationError, not return fabricated data.
 */
export interface ProductSourceAdapter {
  readonly sourceName: string;
  readonly capabilities: SourceCapabilities;

  searchProducts(options: SearchOptions): Promise<NormalizedProduct[]>;
  getProductDetails(identifier: string): Promise<NormalizedProduct | null>;
  getPricing(identifier: string): Promise<Pick<NormalizedProduct, 'sellingPrice' | 'mrp' | 'currency' | 'collectedAt' | 'sourceUrl'> | null>;
  getReviews(identifier: string): Promise<RawReview[]>;
  /** Categories the source can enumerate. Implement only if the source supports it. */
  getCategories(): Promise<CategoryData[]>;
}

export class UnsupportedOperationError extends Error {
  constructor(sourceName: string, operation: string, reason: string) {
    super(`[${sourceName}] ${operation} is not available: ${reason}`);
    this.name = 'UnsupportedOperationError';
  }
}
