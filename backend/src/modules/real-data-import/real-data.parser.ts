import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { DatasetStatus, PainPointType, RiskLevel } from '../../common/interfaces/enums';
import { NormalizedPainPoint, NormalizedProduct } from '../../common/interfaces/normalized-product.interface';
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
} from '../scraping/normalization';
import { FieldObservation, ImportField, OPTIONAL_FIELDS, RecordRejection, REQUIRED_FIELDS } from './real-data.types';

type RawRecord = Record<string, unknown>;

export interface ParsedRealRecord {
  /** 1-based position in the submitted file, for the import report. */
  record: number;
  product: NormalizedProduct;
  /** Every field actually supplied, for the provenance ledger. */
  observations: FieldObservation[];
  /** True when the submitter asked for VERIFIED; the gate decides whether they get it. */
  verificationRequested: boolean;
}

export interface RealDataParseResult {
  records: ParsedRealRecord[];
  malformed: RecordRejection[];
}

const NUMERIC_FIELDS = new Set<ImportField>([
  'observed_price',
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
  'product_weight',
  'demand_signal',
  'competition_signal',
  'seller_count',
  'best_seller_rank',
  'mrp',
  'confidence_score',
]);

/**
 * Parses a real-data submission (CSV or JSON) into normalized products plus a per-field
 * provenance record.
 *
 * It never invents a value: a field that is absent stays absent, and a field that cannot
 * be parsed makes the record malformed rather than being silently coerced.
 */
@Injectable()
export class RealDataParser {
  private readonly logger = new Logger(RealDataParser.name);

  parse(content: string, format: 'csv' | 'json'): RealDataParseResult {
    const raw = format === 'csv' ? this.parseCsv(content) : this.parseJson(content);
    const records: ParsedRealRecord[] = [];
    const malformed: RecordRejection[] = [];

    raw.forEach((row, index) => {
      // CSV: +1 for zero-index, +1 for the header line. JSON: 1-based array position.
      const recordNumber = format === 'csv' ? index + 2 : index + 1;
      try {
        records.push(this.mapRecord(row, recordNumber));
      } catch (error) {
        malformed.push({
          record: recordNumber,
          identifier: this.read(row, 'product_name') ?? this.read(row, 'product_url'),
          code: 'MALFORMED_RECORD',
          errors: [(error as Error).message],
        });
      }
    });

    this.logger.log(`Parsed ${records.length} real records from ${format}, ${malformed.length} malformed`);
    return { records, malformed };
  }

  private parseCsv(content: string): RawRecord[] {
    return parse(content, {
      columns: (header: string[]) => header.map((column) => column.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as RawRecord[];
  }

  private parseJson(content: string): RawRecord[] {
    let payload: unknown;
    try {
      payload = JSON.parse(content);
    } catch (error) {
      throw new Error(`Body is not valid JSON: ${(error as Error).message}`);
    }

    // Accept a bare array or an envelope such as { records: [...] } / { products: [...] }.
    const candidates = Array.isArray(payload)
      ? payload
      : ((payload as Record<string, unknown>)?.records ?? (payload as Record<string, unknown>)?.products);

    if (!Array.isArray(candidates)) {
      throw new Error('JSON payload must be an array of records, or an object with a "records" or "products" array.');
    }

    return candidates.map((entry) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        return {} as RawRecord;
      }
      // Normalize keys to the snake_case field names the schema uses, so camelCase
      // submissions (common from JSON clients) are accepted too.
      return Object.fromEntries(
        Object.entries(entry as RawRecord).map(([key, value]) => [
          key.trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase(),
          value,
        ]),
      ) as RawRecord;
    });
  }

  private read(row: RawRecord, field: string): string | null {
    const value = row[field];
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return parseNullableString(String(value));
  }

  private mapRecord(row: RawRecord, recordNumber: number): ParsedRealRecord {
    const productName = this.read(row, 'product_name');
    const productUrl = this.read(row, 'product_url');
    const sourceUrl = this.read(row, 'source_url');
    const sourceName = this.read(row, 'source_name');
    const marketplace = this.read(row, 'marketplace') ?? this.read(row, 'source');
    const observedPriceRaw = this.read(row, 'observed_price');
    const observedAtRaw = this.read(row, 'observed_at');

    // Parse failures that make the record unusable are raised here; *absence* of a
    // required field is handled by the validator so it lands in the report as a
    // MISSING_REQUIRED_FIELD rejection rather than a malformed one.
    const observedPrice = observedPriceRaw === null ? null : parseNullableNumber(observedPriceRaw);
    if (observedPriceRaw !== null && observedPrice === null) {
      throw new Error(`observed_price '${observedPriceRaw}' is not a number`);
    }

    const observedAt = observedAtRaw === null ? null : parseNullableDate(observedAtRaw);
    if (observedAtRaw !== null && observedAt === null) {
      throw new Error(`observed_at '${observedAtRaw}' is not a parseable timestamp`);
    }

    const dimensions = this.parseDimensions(this.read(row, 'product_dimensions'));
    const mrp = parseNullableNumber(this.read(row, 'mrp'));
    // No fallback to product_url: source_url is a required field for a real record, and
    // silently substituting the listing URL would let a record pass without declaring
    // where the observation actually came from.
    const effectiveSourceUrl = sourceUrl ?? '';
    const confidenceScore = parseNullableNumber(this.read(row, 'confidence_score'));

    const costFieldNames = [
      'supplier_cost',
      'shipping_cost',
      'packaging_cost',
      'marketplace_fee',
      'payment_fee',
      'advertising_cost',
      'return_allowance',
      'other_costs',
    ] as const;
    const hasAnyCost = costFieldNames.some((field) => parseNullableNumber(this.read(row, field)) !== null);

    const painPoints: NormalizedPainPoint[] = [
      ...this.mapPainPoints(this.read(row, 'complaints'), PainPointType.COMPLAINT, effectiveSourceUrl, sourceName, confidenceScore),
      ...this.mapPainPoints(this.read(row, 'positives'), PainPointType.POSITIVE, effectiveSourceUrl, sourceName, confidenceScore),
      ...this.mapPainPoints(this.read(row, 'opportunities'), PainPointType.OPPORTUNITY, effectiveSourceUrl, sourceName, confidenceScore),
    ];

    // A submitter may *request* VERIFIED, but import alone never grants it — the existing
    // verification gate decides, and the default is UNVERIFIED.
    const verificationRequested =
      parseNullableBoolean(this.read(row, 'verification_requested')) === true ||
      (this.read(row, 'dataset_status') ?? '').toUpperCase() === DatasetStatus.VERIFIED;

    const product: NormalizedProduct = {
      name: productName ? normalizeName(productName) : '',
      normalizedName: productName ? normalizeNameForDedup(productName) : '',
      url: productUrl ? normalizeUrl(productUrl) : '',
      marketplaceSlug: (marketplace ?? '').toLowerCase(),
      externalId: this.read(row, 'product_id'),
      brand: this.read(row, 'brand'),
      category: (this.read(row, 'category') ?? '').toLowerCase(),
      subcategory: this.read(row, 'subcategory'),
      description: this.read(row, 'description'),
      features: parseList(this.read(row, 'features')),
      variants: parseList(this.read(row, 'variants')),
      sizes: parseList(this.read(row, 'sizes')),
      colors: parseList(this.read(row, 'colors')),
      imageUrls: parseList(this.read(row, 'image_urls')),
      weightKg: parseNullableNumber(this.read(row, 'product_weight')),
      dimensions,

      sellingPrice: observedPrice as number,
      mrp,
      discountPercentage: observedPrice === null ? null : computeDiscountPercentage(observedPrice, mrp),
      currency: (this.read(row, 'currency') ?? 'INR').toUpperCase(),

      // demand_signal / competition_signal are accepted as aliases for the specific
      // metrics they describe, so a submitter can use either vocabulary.
      reviewCount: parseNullableInt(this.read(row, 'review_count') ?? this.read(row, 'demand_signal')),
      averageRating: parseNullableNumber(this.read(row, 'rating')),
      competitorCount: parseNullableInt(this.read(row, 'competition_signal')),
      sellerCount: parseNullableInt(this.read(row, 'seller_count')),
      bestSellerRank: parseNullableInt(this.read(row, 'best_seller_rank')),
      searchTerm: this.read(row, 'search_term'),

      costs: hasAnyCost
        ? {
            productCost: parseNullableNumber(this.read(row, 'supplier_cost')),
            shippingCost: parseNullableNumber(this.read(row, 'shipping_cost')),
            packagingCost: parseNullableNumber(this.read(row, 'packaging_cost')),
            marketplaceFeeOverride: parseNullableNumber(this.read(row, 'marketplace_fee')),
            paymentFee: parseNullableNumber(this.read(row, 'payment_fee')),
            advertisingCost: parseNullableNumber(this.read(row, 'advertising_cost')),
            returnAllowance: parseNullableNumber(this.read(row, 'return_allowance')),
            otherCosts: parseNullableNumber(this.read(row, 'other_costs')),
            sourceName: this.read(row, 'cost_source_name') ?? sourceName ?? '',
            sourceUrl: this.read(row, 'cost_source_url'),
          }
        : null,

      fragile: parseNullableBoolean(this.read(row, 'fragile')),
      returnRisk: this.parseRiskLevel(this.read(row, 'return_risk')),
      regulatoryComplexity: this.parseRiskLevel(this.read(row, 'regulatory_complexity')),
      brandIpRisk: parseNullableBoolean(this.read(row, 'brand_ip_risk')),
      seasonalDemand: parseNullableBoolean(this.read(row, 'seasonal_demand')),
      establishedBrandDominance: parseNullableBoolean(this.read(row, 'established_brand_dominance')),
      bundlePotentialScore: parseNullableNumber(this.read(row, 'bundle_potential_score')),

      painPoints,

      sourceName: sourceName ?? '',
      sourceUrl: effectiveSourceUrl,
      collectedAt: (observedAt ?? new Date(Number.NaN)) as Date,
      confidenceScore,
      // Requirement: import alone never confers VERIFIED. The gate may grant it later.
      datasetStatus: DatasetStatus.UNVERIFIED,
    };

    return {
      record: recordNumber,
      product,
      observations: this.collectObservations(row),
      verificationRequested,
    };
  }

  /** Records every supplied field verbatim so its source and timestamp can be stored. */
  private collectObservations(row: RawRecord): FieldObservation[] {
    const observations: FieldObservation[] = [];

    for (const fieldName of [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]) {
      const rawValue = this.read(row, fieldName);
      if (rawValue === null) {
        continue;
      }
      observations.push({
        fieldName,
        rawValue,
        numericValue: NUMERIC_FIELDS.has(fieldName) ? parseNullableNumber(rawValue) : null,
      });
    }

    return observations;
  }

  /** Accepts '30x20x25', '30 x 20 x 25 cm' or a {lengthCm,widthCm,heightCm} JSON object. */
  private parseDimensions(raw: string | null): NormalizedProduct['dimensions'] {
    if (!raw) {
      return null;
    }

    if (raw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const length = Number(parsed.lengthCm ?? parsed.length_cm ?? parsed.length);
        const width = Number(parsed.widthCm ?? parsed.width_cm ?? parsed.width);
        const height = Number(parsed.heightCm ?? parsed.height_cm ?? parsed.height);
        if ([length, width, height].every((value) => Number.isFinite(value) && value > 0)) {
          return { lengthCm: length, widthCm: width, heightCm: height };
        }
      } catch {
        return null;
      }
      return null;
    }

    const parts = raw
      .toLowerCase()
      .replace(/cm|mm|in|inches/g, '')
      .split(/[x×*]/)
      .map((part) => Number.parseFloat(part.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    return parts.length === 3 ? { lengthCm: parts[0], widthCm: parts[1], heightCm: parts[2] } : null;
  }

  private mapPainPoints(
    raw: string | null,
    type: PainPointType,
    sourceUrl: string,
    sourceName: string | null,
    confidenceScore: number | null,
  ): NormalizedPainPoint[] {
    const themes = parseList(raw);
    if (!themes) {
      return [];
    }
    return themes.map((theme) => {
      const [label, count] = theme.split(':');
      return {
        type,
        theme: label.trim(),
        detail: null,
        mentionCount: count !== undefined ? parseNullableInt(count) : null,
        sourceName: sourceName ?? '',
        sourceUrl,
        confidenceScore,
      };
    });
  }

  private parseRiskLevel(raw: string | null): RiskLevel | null {
    const value = raw?.toLowerCase();
    if (!value) {
      return null;
    }
    return (Object.values(RiskLevel) as string[]).includes(value) ? (value as RiskLevel) : null;
  }
}
