import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { DatasetStatus, PainPointType, RiskLevel } from '../../../common/interfaces/enums';
import { NormalizedPainPoint, NormalizedProduct } from '../../../common/interfaces/normalized-product.interface';
import {
  CategoryData,
  ProductSourceAdapter,
  RawReview,
  SearchOptions,
  SourceCapabilities,
  UnsupportedOperationError,
} from '../../../common/interfaces/product-source-adapter.interface';
import {
  computeDiscountPercentage,
  normalizeName,
  normalizeNameForDedup,
  normalizeUrl,
  parseList,
  parseNullableBoolean,
  parseNullableDate,
  parseNullableInt,
  parseNullableNumber,
  parseNullableString,
} from '../normalization';

type CsvRow = Record<string, string>;

export interface ParseOutcome {
  products: NormalizedProduct[];
  /** Rows that could not even be turned into a product shape (bad numbers, missing price). */
  malformed: Array<{ row: number; identifier: string | null; errors: string[] }>;
}

/**
 * Phase 1's only data source.
 *
 * Why manual: Amazon India, Flipkart and Meesho all prohibit automated collection in
 * their terms, and none exposes an open product-search API. This adapter therefore takes
 * data a person looked up and recorded by hand (or exported from a source they are
 * licensed to use) and feeds it through exactly the same pipeline a future API-backed
 * adapter would use. No requests are made to any marketplace by this adapter.
 *
 * Add AmazonAdapter/FlipkartAdapter later by implementing ProductSourceAdapter against a
 * permitted API — nothing downstream has to change.
 */
@Injectable()
export class ManualCsvAdapter implements ProductSourceAdapter {
  readonly sourceName = 'manual_csv';
  readonly capabilities: SourceCapabilities = {
    search: false,
    productDetails: true,
    pricing: true,
    reviews: false,
    categoryData: true,
  };

  private readonly logger = new Logger(ManualCsvAdapter.name);

  /** Parses a CSV buffer into normalized products. Never throws on a bad row — it reports it. */
  parseCsv(content: string): ParseOutcome {
    const rows = parse(content, {
      columns: (header: string[]) => header.map((column) => column.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as CsvRow[];

    const products: NormalizedProduct[] = [];
    const malformed: ParseOutcome['malformed'] = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2; // +1 for zero-index, +1 for the header line
      try {
        const product = this.mapRow(row);
        products.push(product);
      } catch (error) {
        malformed.push({
          row: rowNumber,
          identifier: parseNullableString(row.name) ?? parseNullableString(row.url),
          errors: [(error as Error).message],
        });
      }
    });

    this.logger.log(`Parsed ${products.length} products, ${malformed.length} malformed rows`);
    return { products, malformed };
  }

  private mapRow(row: CsvRow): NormalizedProduct {
    const name = parseNullableString(row.name);
    const url = parseNullableString(row.url);
    const sellingPrice = parseNullableNumber(row.selling_price);

    if (!name) {
      throw new Error('name is empty');
    }
    if (!url) {
      throw new Error('url is empty');
    }
    if (sellingPrice === null) {
      throw new Error(`selling_price '${row.selling_price ?? ''}' is not a number`);
    }

    const mrp = parseNullableNumber(row.mrp);
    const lengthCm = parseNullableNumber(row.length_cm);
    const widthCm = parseNullableNumber(row.width_cm);
    const heightCm = parseNullableNumber(row.height_cm);
    const hasDimensions = lengthCm !== null && widthCm !== null && heightCm !== null;

    const sourceUrl = parseNullableString(row.source_url) ?? url;
    const collectedAt = parseNullableDate(row.collected_at) ?? new Date();

    const sourceName = parseNullableString(row.source_name) ?? this.sourceName;
    const confidenceScore = parseNullableNumber(row.confidence_score);

    const painPoints: NormalizedPainPoint[] = [
      ...this.mapPainPoints(row.complaints, PainPointType.COMPLAINT, sourceUrl, sourceName, confidenceScore),
      ...this.mapPainPoints(row.positives, PainPointType.POSITIVE, sourceUrl, sourceName, confidenceScore),
      ...this.mapPainPoints(row.opportunities, PainPointType.OPPORTUNITY, sourceUrl, sourceName, confidenceScore),
    ];

    const costSource = parseNullableString(row.cost_source);
    const costFields = [
      row.product_cost,
      row.shipping_cost,
      row.packaging_cost,
      row.marketplace_fee_override,
      row.payment_fee,
      row.advertising_cost,
      row.return_allowance,
      row.other_costs,
    ];
    const hasAnyCost = costFields.some((field) => parseNullableNumber(field) !== null);

    return {
      name: normalizeName(name),
      normalizedName: normalizeNameForDedup(name),
      url: normalizeUrl(url),
      marketplaceSlug: (parseNullableString(row.marketplace) ?? '').toLowerCase(),
      externalId: parseNullableString(row.external_id),
      brand: parseNullableString(row.brand),
      category: (parseNullableString(row.category) ?? '').toLowerCase(),
      subcategory: parseNullableString(row.subcategory),
      description: parseNullableString(row.description),
      features: parseList(row.features),
      variants: parseList(row.variants),
      sizes: parseList(row.sizes),
      colors: parseList(row.colors),
      imageUrls: parseList(row.image_urls),
      weightKg: parseNullableNumber(row.weight_kg),
      dimensions: hasDimensions ? { lengthCm: lengthCm!, widthCm: widthCm!, heightCm: heightCm! } : null,

      sellingPrice,
      mrp,
      discountPercentage: computeDiscountPercentage(sellingPrice, mrp),
      currency: (parseNullableString(row.currency) ?? 'INR').toUpperCase(),

      reviewCount: parseNullableInt(row.review_count),
      averageRating: parseNullableNumber(row.average_rating),
      competitorCount: parseNullableInt(row.competitor_count),
      sellerCount: parseNullableInt(row.seller_count),
      bestSellerRank: parseNullableInt(row.best_seller_rank),
      searchTerm: parseNullableString(row.search_term),

      costs: hasAnyCost
        ? {
            productCost: parseNullableNumber(row.product_cost),
            shippingCost: parseNullableNumber(row.shipping_cost),
            packagingCost: parseNullableNumber(row.packaging_cost),
            marketplaceFeeOverride: parseNullableNumber(row.marketplace_fee_override),
            paymentFee: parseNullableNumber(row.payment_fee),
            advertisingCost: parseNullableNumber(row.advertising_cost),
            returnAllowance: parseNullableNumber(row.return_allowance),
            otherCosts: parseNullableNumber(row.other_costs),
            sourceName: costSource ?? 'manual entry',
            sourceUrl: parseNullableString(row.cost_source_url),
          }
        : null,

      fragile: parseNullableBoolean(row.fragile),
      returnRisk: this.parseRiskLevel(row.return_risk),
      regulatoryComplexity: this.parseRiskLevel(row.regulatory_complexity),
      brandIpRisk: parseNullableBoolean(row.brand_ip_risk),
      seasonalDemand: parseNullableBoolean(row.seasonal_demand),
      establishedBrandDominance: parseNullableBoolean(row.established_brand_dominance),
      bundlePotentialScore: parseNullableNumber(row.bundle_potential_score),

      painPoints,

      sourceName,
      sourceUrl,
      collectedAt,
      confidenceScore,
      datasetStatus: this.parseDatasetStatus(row),
    };
  }

  private mapPainPoints(
    raw: string | undefined,
    type: PainPointType,
    sourceUrl: string,
    sourceName: string,
    confidenceScore: number | null,
  ): NormalizedPainPoint[] {
    const themes = parseList(raw);
    if (!themes) {
      return [];
    }
    return themes.map((theme) => {
      // Optional 'theme:count' form records how many reviews mentioned it.
      const [label, count] = theme.split(':');
      return {
        type,
        theme: label.trim(),
        detail: null,
        mentionCount: count !== undefined ? parseNullableInt(count) : null,
        sourceName,
        sourceUrl,
        confidenceScore,
      };
    });
  }

  /**
   * Explicit `dataset_status` wins. Otherwise a legacy `is_sample_data=true` maps to SAMPLE.
   * Everything else defaults to UNVERIFIED — an import is never assumed to be VERIFIED,
   * since only a person can attest to that.
   */
  private parseDatasetStatus(row: CsvRow): DatasetStatus {
    const explicit = parseNullableString(row.dataset_status)?.toUpperCase();
    if (explicit && (Object.values(DatasetStatus) as string[]).includes(explicit)) {
      return explicit as DatasetStatus;
    }
    if (parseNullableBoolean(row.is_sample_data) === true) {
      return DatasetStatus.SAMPLE;
    }
    return DatasetStatus.UNVERIFIED;
  }

  private parseRiskLevel(raw: string | undefined): RiskLevel | null {
    const value = parseNullableString(raw)?.toLowerCase();
    if (!value) {
      return null;
    }
    return (Object.values(RiskLevel) as string[]).includes(value) ? (value as RiskLevel) : null;
  }

  // --- ProductSourceAdapter surface ---
  // A CSV drop is not a live source: there is nothing to query on demand. These throw
  // rather than returning empty//fabricated data so a caller can never mistake silence for a result.

  async searchProducts(_options: SearchOptions): Promise<NormalizedProduct[]> {
    throw new UnsupportedOperationError(this.sourceName, 'searchProducts', 'this source ingests supplied files; it cannot query a marketplace');
  }

  async getProductDetails(_identifier: string): Promise<NormalizedProduct | null> {
    throw new UnsupportedOperationError(this.sourceName, 'getProductDetails', 'this source ingests supplied files; it cannot fetch on demand');
  }

  async getPricing(_identifier: string): Promise<null> {
    throw new UnsupportedOperationError(this.sourceName, 'getPricing', 'prices arrive with each ingested file');
  }

  async getReviews(_identifier: string): Promise<RawReview[]> {
    throw new UnsupportedOperationError(
      this.sourceName,
      'getReviews',
      'raw review collection is not permitted from this source; supply summarized, traceable observations in the complaints/positives/opportunities columns instead',
    );
  }

  async getCategories(): Promise<CategoryData[]> {
    throw new UnsupportedOperationError(this.sourceName, 'getCategories', 'categories come from config/categories.json, not from this source');
  }
}
