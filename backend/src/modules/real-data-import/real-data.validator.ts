import { Injectable } from '@nestjs/common';
import { DatasetStatus } from '../../common/interfaces/enums';
import { ConfigFilesService } from '../../config/config-files.service';
import { inspectUrl, isNonAttributableSourceName } from '../../common/utils/placeholder-url';
import { ParsedRealRecord } from './real-data.parser';
import { RecordRejection, RejectionCode } from './real-data.types';

export interface RealRecordValidation {
  accepted: boolean;
  rejection: RecordRejection | null;
  warnings: string[];
}

/** Source names that mark a record as seed/demo data, which this pipeline refuses outright. */
const SEED_SOURCE_NAMES = new Set(['seed_demo_data', 'sample_data', 'demo_data']);

/**
 * Gatekeeper for the real-data pipeline.
 *
 * Stricter than the general ValidationService on purpose. That one accepts demo rows so
 * the seed can load; this one exists precisely to keep demo-shaped data out of the real
 * dataset, so it rejects rather than warns. A record that fails here is never persisted.
 */
@Injectable()
export class RealDataValidator {
  constructor(private readonly configFiles: ConfigFilesService) {}

  validate(parsed: ParsedRealRecord): RealRecordValidation {
    const { product } = parsed;
    const identifier = product.name || product.url || null;
    const warnings: string[] = [];

    const reject = (code: RejectionCode, errors: string[]): RealRecordValidation => ({
      accepted: false,
      rejection: { record: parsed.record, identifier, code, errors },
      warnings,
    });

    // --- Seed isolation, checked first so demo data can never reach the real dataset ---
    const sourceNameLower = product.sourceName.trim().toLowerCase();
    if (SEED_SOURCE_NAMES.has(sourceNameLower)) {
      return reject('SEED_DATA_SOURCE', [
        `source_name '${product.sourceName}' identifies seed/demo data, which cannot be imported as real data`,
      ]);
    }

    if ((parsed.product.datasetStatus as DatasetStatus) === DatasetStatus.SAMPLE) {
      return reject('SAMPLE_STATUS_NOT_ALLOWED', [
        'dataset_status SAMPLE is reserved for seed data and cannot be submitted through the real-data pipeline',
      ]);
    }

    // --- Required fields (requirement: the seven that every real record must contain) ---
    const missing: string[] = [];
    if (!product.name) {
      missing.push('product_name');
    }
    if (!product.marketplaceSlug) {
      missing.push('marketplace');
    }
    if (!product.url) {
      missing.push('product_url');
    }
    if (typeof product.sellingPrice !== 'number' || !Number.isFinite(product.sellingPrice)) {
      missing.push('observed_price');
    }
    if (!product.collectedAt || Number.isNaN(new Date(product.collectedAt).getTime())) {
      missing.push('observed_at');
    }
    if (!product.sourceUrl) {
      missing.push('source_url');
    }
    if (!product.sourceName) {
      missing.push('source_name');
    }

    if (missing.length > 0) {
      return reject('MISSING_REQUIRED_FIELD', missing.map((field) => `${field} is required for a real record`));
    }

    // --- Placeholder / non-traceable sources ---
    const productUrl = inspectUrl(product.url);
    const sourceUrl = inspectUrl(product.sourceUrl);
    if (productUrl.isPlaceholder || sourceUrl.isPlaceholder) {
      const errors: string[] = [];
      if (productUrl.isPlaceholder) {
        errors.push(`product_url is a placeholder/example URL: ${productUrl.reasons.join('; ')}`);
      }
      if (sourceUrl.isPlaceholder) {
        errors.push(`source_url is a placeholder/example URL: ${sourceUrl.reasons.join('; ')}`);
      }
      return reject('PLACEHOLDER_URL', errors);
    }

    if (isNonAttributableSourceName(product.sourceName)) {
      return reject('SEED_DATA_SOURCE', [
        `source_name '${product.sourceName}' does not attribute the record to a real, traceable origin`,
      ]);
    }

    // --- Value sanity ---
    const invalid: string[] = [];
    if (product.sellingPrice <= 0) {
      invalid.push(`observed_price must be greater than zero, got ${product.sellingPrice}`);
    }
    if (product.currency !== 'INR') {
      invalid.push(`currency must be INR for this system, got '${product.currency}'`);
    }
    if (new Date(product.collectedAt).getTime() > Date.now() + 86_400_000) {
      invalid.push('observed_at is in the future');
    }
    if (product.averageRating !== null && (product.averageRating < 0 || product.averageRating > 5)) {
      invalid.push(`rating must be between 0 and 5, got ${product.averageRating}`);
    }
    if (product.reviewCount !== null && product.reviewCount < 0) {
      invalid.push('review_count cannot be negative');
    }
    if (product.weightKg !== null && product.weightKg <= 0) {
      invalid.push('product_weight must be greater than zero when supplied');
    }
    if (product.confidenceScore !== null && (product.confidenceScore < 0 || product.confidenceScore > 1)) {
      invalid.push('confidence_score must be between 0 and 1');
    }
    for (const painPoint of product.painPoints) {
      if (inspectUrl(painPoint.sourceUrl).isPlaceholder) {
        invalid.push(`review observation '${painPoint.theme}' has no traceable source URL`);
        break;
      }
    }

    if (invalid.length > 0) {
      return reject('INVALID_VALUE', invalid);
    }

    // --- Category must be configured, since scoring normalizes within a category cohort ---
    if (!product.category) {
      return reject('UNKNOWN_CATEGORY', ['category is required so the product can be scored against a peer cohort']);
    }
    if (!this.configFiles.isKnownCategory(product.category)) {
      return reject('UNKNOWN_CATEGORY', [
        `category '${product.category}' is not in config/categories.json — add it there first`,
      ]);
    }

    // --- Accepted. Warnings do not block, but are reported. ---
    if (product.costs?.productCost === null || product.costs === null) {
      warnings.push('No supplier_cost supplied — profitability and the Final Score will be withheld');
    }
    if (product.reviewCount === null || product.averageRating === null) {
      warnings.push('Missing rating or review_count — demand signal incomplete, Final Score will be withheld');
    }
    if (product.competitorCount === null) {
      warnings.push('No competition_signal supplied — Final Score will be withheld');
    }
    if (product.mrp !== null && product.sellingPrice > product.mrp) {
      warnings.push(`observed_price (${product.sellingPrice}) exceeds MRP (${product.mrp}) — verify the listing`);
    }
    if (parsed.verificationRequested) {
      warnings.push('VERIFIED was requested; it is granted only if the record passes the verification gate');
    }

    return { accepted: true, rejection: null, warnings };
  }
}
