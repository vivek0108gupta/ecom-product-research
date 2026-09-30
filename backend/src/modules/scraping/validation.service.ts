import { Injectable } from '@nestjs/common';
import { DatasetStatus } from '../../common/interfaces/enums';
import { ConfigFilesService } from '../../config/config-files.service';
import { NormalizedProduct } from '../../common/interfaces/normalized-product.interface';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const HTTP_URL = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

/**
 * Gate between a data source and the database. A record that fails validation is
 * rejected and recorded in the run's rejection list — never silently repaired,
 * and never persisted with an invented substitute value.
 */
@Injectable()
export class ValidationService {
  constructor(private readonly configFiles: ConfigFilesService) {}

  validate(product: NormalizedProduct): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!product.name || product.name.trim().length < 3) {
      errors.push('name is required (min 3 characters)');
    }

    if (!HTTP_URL.test(product.url ?? '')) {
      errors.push(`url is not a valid http(s) URL: '${product.url}'`);
    }

    if (!product.marketplaceSlug) {
      errors.push('marketplace is required');
    }

    if (!product.category) {
      errors.push('category is required');
    } else if (!this.configFiles.isKnownCategory(product.category)) {
      errors.push(`category '${product.category}' is not in config/categories.json — add it there first`);
    }

    if (typeof product.sellingPrice !== 'number' || !Number.isFinite(product.sellingPrice)) {
      errors.push('selling_price must be numeric');
    } else if (product.sellingPrice <= 0) {
      errors.push('selling_price must be greater than zero');
    }

    if (product.currency !== 'INR') {
      errors.push(`currency must be INR for this system, got '${product.currency}'`);
    }

    if (product.mrp !== null && product.sellingPrice > product.mrp) {
      warnings.push(`selling_price (${product.sellingPrice}) exceeds MRP (${product.mrp}) — verify the listing`);
    }

    if (!HTTP_URL.test(product.sourceUrl ?? '')) {
      errors.push('source_url is required and must be a valid http(s) URL');
    }

    if (!product.sourceName || product.sourceName.trim() === '') {
      errors.push('source_name is required — every externally sourced value must name its source');
    }

    if (!Object.values(DatasetStatus).includes(product.datasetStatus)) {
      errors.push(`dataset_status must be one of ${Object.values(DatasetStatus).join(', ')}`);
    }

    if (!(product.collectedAt instanceof Date) || Number.isNaN(product.collectedAt.getTime())) {
      errors.push('collected_at is required and must be a valid timestamp');
    } else if (product.collectedAt.getTime() > Date.now() + 86_400_000) {
      errors.push('collected_at is in the future');
    }

    if (product.averageRating !== null && (product.averageRating < 0 || product.averageRating > 5)) {
      errors.push(`average_rating must be between 0 and 5, got ${product.averageRating}`);
    }

    if (product.reviewCount !== null && product.reviewCount < 0) {
      errors.push('review_count cannot be negative');
    }

    if (product.weightKg !== null && product.weightKg <= 0) {
      errors.push('weight_kg must be greater than zero when supplied');
    }

    if (product.confidenceScore !== null && (product.confidenceScore < 0 || product.confidenceScore > 1)) {
      errors.push('confidence_score must be between 0 and 1');
    }

    for (const painPoint of product.painPoints) {
      if (!HTTP_URL.test(painPoint.sourceUrl ?? '')) {
        errors.push(`pain point '${painPoint.theme}' has no valid source URL — review observations must be traceable`);
        break;
      }
    }

    if (product.costs?.productCost === null || product.costs === null) {
      warnings.push('No supplier/product cost supplied — profitability will be reported as unavailable');
    }

    if (product.reviewCount === null || product.averageRating === null) {
      warnings.push('Missing review count or rating — demand score will be reported as unavailable');
    }

    if (product.competitorCount === null) {
      warnings.push('No competing-listing count — competition score and Final Score will be withheld');
    }

    if (product.datasetStatus === DatasetStatus.VERIFIED && product.confidenceScore !== null && product.confidenceScore < 0.8) {
      warnings.push(`Marked VERIFIED but confidence is only ${product.confidenceScore} — confirm this is intentional`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
