import { Injectable, Logger } from '@nestjs/common';
import { NormalizedProduct } from '../../common/interfaces/normalized-product.interface';
import {
  CategoryData,
  ProductSourceAdapter,
  RawReview,
  SearchOptions,
  SourceCapabilities,
  UnsupportedOperationError,
} from '../../common/interfaces/product-source-adapter.interface';
import { KEEPA_DOMAIN_INDIA, KEEPA_NOT_CONFIGURED } from './keepa.constants';
import { KeepaClient, KeepaNotConfiguredError } from './keepa.client';
import { KEEPA_SOURCE_NAME, KeepaMappingResult, mapKeepaProduct } from './keepa.mapper';

export interface KeepaAdapterStatus {
  sourceName: string;
  configured: boolean;
  apiKeyPresent: boolean;
  adapterImplemented: true;
  domain: number;
  state: typeof KEEPA_NOT_CONFIGURED | 'CONFIGURED';
  tokens: ReturnType<KeepaClient['tokens']['snapshot']>;
}

/**
 * Keepa adapter for amazon.in.
 *
 * Dry-run by construction: with no KEEPA_API_KEY set, every method that would touch the
 * network throws KeepaNotConfiguredError before any request is built. There is no "dry run"
 * flag to forget — the absence of a key is the safety.
 *
 * Methods Keepa does not serve throw UnsupportedOperationError rather than returning
 * empty or invented data. Keepa exposes rating and review *counts*, not review text, so
 * getReviews is unsupported.
 */
@Injectable()
export class KeepaProductSourceAdapter implements ProductSourceAdapter {
  readonly sourceName = KEEPA_SOURCE_NAME;

  readonly capabilities: SourceCapabilities = {
    search: true,
    productDetails: true,
    pricing: true,
    // Keepa returns rating and review counts, never review text.
    reviews: false,
    categoryData: true,
  };

  private readonly logger = new Logger(KeepaProductSourceAdapter.name);

  constructor(private readonly client: KeepaClient) {}

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  getStatus(): KeepaAdapterStatus {
    const configured = this.client.isConfigured();
    return {
      sourceName: this.sourceName,
      configured,
      apiKeyPresent: configured,
      adapterImplemented: true,
      domain: KEEPA_DOMAIN_INDIA,
      state: configured ? 'CONFIGURED' : KEEPA_NOT_CONFIGURED,
      tokens: this.client.tokens.snapshot(),
    };
  }

  /**
   * Transforms already-fetched Keepa payloads. Pure, offline, and the path the fixture
   * test uses — so the mapping is exercised without any API access.
   */
  mapProducts(
    raw: Parameters<typeof mapKeepaProduct>[0][],
    options: { collectedAt: Date; category: string },
  ): KeepaMappingResult[] {
    return raw.map((product) => mapKeepaProduct(product, options));
  }

  async searchProducts(options: SearchOptions): Promise<NormalizedProduct[]> {
    this.assertConfigured();
    // Deliberately not implemented against the live endpoint yet: Keepa's product search
    // costs 10 tokens per result page, and committing to a query strategy before the
    // subscription exists would be guesswork about a budget nobody has agreed.
    throw new UnsupportedOperationError(
      this.sourceName,
      'searchProducts',
      `live search is not wired up yet. Supply ASINs to getProductDetails instead. (category requested: ${options.category})`,
    );
  }

  async getProductDetails(identifier: string): Promise<NormalizedProduct | null> {
    this.assertConfigured();

    const response = await this.client.getProducts([identifier], { withBuyBox: true });
    const raw = response.products?.[0];
    if (!raw) {
      return null;
    }

    const mapped = mapKeepaProduct(raw, { collectedAt: new Date(), category: '' });
    if (mapped.unusableReasons.length > 0) {
      this.logger.warn(`ASIN ${identifier} unusable: ${mapped.unusableReasons.join('; ')}`);
      return null;
    }
    return mapped.product;
  }

  async getPricing(
    identifier: string,
  ): Promise<Pick<NormalizedProduct, 'sellingPrice' | 'mrp' | 'currency' | 'collectedAt' | 'sourceUrl'> | null> {
    this.assertConfigured();

    const product = await this.getProductDetails(identifier);
    if (!product) {
      return null;
    }
    return {
      sellingPrice: product.sellingPrice,
      mrp: product.mrp,
      currency: product.currency,
      collectedAt: product.collectedAt,
      sourceUrl: product.sourceUrl,
    };
  }

  async getReviews(identifier: string): Promise<RawReview[]> {
    throw new UnsupportedOperationError(
      this.sourceName,
      'getReviews',
      `Keepa provides rating and review counts, not review text. Complaint themes for ${identifier} must come from a permitted source and be recorded through the manual pipeline.`,
    );
  }

  async getCategories(): Promise<CategoryData[]> {
    this.assertConfigured();
    throw new UnsupportedOperationError(
      this.sourceName,
      'getCategories',
      'the Keepa category endpoint is not wired up yet; category slugs come from config/categories.json',
    );
  }

  /** Requirement 4: report KEEPA_NOT_CONFIGURED and make no network request. */
  private assertConfigured(): void {
    if (!this.client.isConfigured()) {
      throw new KeepaNotConfiguredError();
    }
  }
}
