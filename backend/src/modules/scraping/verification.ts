import { DatasetStatus } from '../../common/interfaces/enums';
import { NormalizedProduct } from '../../common/interfaces/normalized-product.interface';
import { inspectUrl, isNonAttributableSourceName, isPlaceholderUrl } from '../../common/utils/placeholder-url';

/**
 * Sources that collect without a human reading the listing. Data from these can be
 * perfectly accurate and still not be *verified*: VERIFIED asserts that a person checked
 * the numbers against the live listing and a real supplier quote, and a successful
 * download is not that. Keeping the list here rather than in config means a new collector
 * cannot quietly grant itself verification by editing a JSON file.
 */
export const AUTOMATED_SOURCE_NAMES: ReadonlySet<string> = new Set([
  'keepa',
  'amazon_sp_api',
  'amazon_creators_api',
  'flipkart_affiliate',
  'ondc',
  'rainforest',
  'oxylabs',
  'serpapi',
]);

export interface VerificationAssessment {
  /** The status the record is actually allowed to hold. */
  datasetStatus: DatasetStatus;
  /** True when a VERIFIED claim was refused and downgraded to UNVERIFIED. */
  downgraded: boolean;
  /** Every reason the VERIFIED claim failed. Empty when the claim stands or was never made. */
  reasons: string[];
}

/**
 * Decides whether a record may hold DatasetStatus.VERIFIED.
 *
 * VERIFIED is the only status in this system that asserts something about the real world:
 * that a human confirmed these numbers against a live listing and a real supplier quote.
 * A claim that cannot be independently re-checked is worth less than no claim at all,
 * because it is indistinguishable from one that can — so an unsupportable claim is
 * downgraded to UNVERIFIED rather than trusted.
 *
 * This runs centrally at ingestion, not inside an adapter, so no future data source can
 * bypass it by asserting VERIFIED in its own payload.
 *
 * SAMPLE is never promoted or demoted here: demo data stays demo data.
 */
export function assessVerification(product: NormalizedProduct): VerificationAssessment {
  // Requirement 5/6: seed and demo data can never become VERIFIED, whatever it claims.
  if (product.datasetStatus === DatasetStatus.SAMPLE) {
    return { datasetStatus: DatasetStatus.SAMPLE, downgraded: false, reasons: [] };
  }

  if (product.datasetStatus !== DatasetStatus.VERIFIED) {
    return { datasetStatus: DatasetStatus.UNVERIFIED, downgraded: false, reasons: [] };
  }

  const reasons: string[] = [];

  // --- Automated collection is not human verification ---
  // A download succeeding says nothing about whether anyone checked the listing. VERIFIED
  // has to be attested by a person, so an automated collector can never confer it.
  if (AUTOMATED_SOURCE_NAMES.has(product.sourceName.trim().toLowerCase())) {
    reasons.push(
      `source '${product.sourceName}' is an automated collector — data arriving from it is not ` +
        'human-verified. VERIFIED requires a person to confirm the listing and a supplier quote.',
    );
  }

  // --- A real, traceable source (requirement 1 and 3) ---
  const sourceUrl = inspectUrl(product.sourceUrl);
  if (sourceUrl.isPlaceholder) {
    reasons.push(`source_url is not a real traceable URL: ${sourceUrl.reasons.join('; ')}`);
  }

  const productUrl = inspectUrl(product.url);
  if (productUrl.isPlaceholder) {
    reasons.push(`product url is not a real traceable URL: ${productUrl.reasons.join('; ')}`);
  }

  if (isNonAttributableSourceName(product.sourceName)) {
    reasons.push(
      `source_name '${product.sourceName}' does not attribute the record to a real, traceable origin ` +
        '(an adapter name or a demo/sample placeholder is not an attribution)',
    );
  }

  // --- collected_at (requirement 3) ---
  if (!product.collectedAt || Number.isNaN(new Date(product.collectedAt).getTime())) {
    reasons.push('collected_at is missing or unparseable');
  }

  // --- Actual product information (requirement 3) ---
  // A name alone describes nothing checkable; VERIFIED needs at least one concrete
  // attribute a person could confirm against the listing.
  const concreteAttributes = [
    product.brand,
    product.description,
    product.weightKg,
    product.dimensions,
    product.features?.length ? product.features : null,
  ].filter((value) => value !== null && value !== undefined);

  if (concreteAttributes.length === 0) {
    reasons.push(
      'no actual product information on record (needs at least one of: brand, description, weight, dimensions, features)',
    );
  }

  // --- Actual observed price (requirement 3) ---
  if (typeof product.sellingPrice !== 'number' || !Number.isFinite(product.sellingPrice) || product.sellingPrice <= 0) {
    reasons.push('no actual observed selling price');
  }

  // --- Cost evidence, where a cost is claimed (requirement 3) ---
  if (product.costs?.productCost !== null && product.costs?.productCost !== undefined) {
    if (isNonAttributableSourceName(product.costs.sourceName)) {
      reasons.push(
        `a product cost is claimed but its cost_source '${product.costs.sourceName}' is not a real attributable supplier/quote`,
      );
    }
    if (product.costs.sourceUrl && isPlaceholderUrl(product.costs.sourceUrl)) {
      reasons.push('cost_source_url is a placeholder URL');
    }
  }

  // --- Evidence for demand and competition metrics (requirement 3) ---
  if (product.reviewCount === null || product.averageRating === null) {
    reasons.push('demand metrics (review count and average rating) are not both present');
  }
  if (product.competitorCount === null) {
    reasons.push('competition metric (count of comparable listings) is missing');
  }
  // The metrics inherit the product's source URL; if that is a placeholder the numbers
  // have no evidence behind them, which the source_url check above already records.

  if (reasons.length > 0) {
    return { datasetStatus: DatasetStatus.UNVERIFIED, downgraded: true, reasons };
  }

  return { datasetStatus: DatasetStatus.VERIFIED, downgraded: false, reasons: [] };
}
