import { DataOrigin, DatasetStatus } from '../../common/interfaces/enums';
import { NormalizedProduct } from '../../common/interfaces/normalized-product.interface';
import { normalizeName, normalizeNameForDedup, normalizeUrl } from '../scraping/normalization';
import {
  KEEPA_AVAILABILITY,
  KEEPA_CSV_INDEX,
  KEEPA_IMAGE_BASE_URL,
  KEEPA_PRODUCT_TYPE,
} from './keepa.constants';
import {
  gramsToKilograms,
  keepaCount,
  keepaMinutesToDate,
  keepaPriceToMajorUnits,
  keepaRatingToStars,
  latestHistoryPoint,
  millimetresToCentimetres,
  parseHistory,
} from './keepa-conversions';
import { KeepaProduct } from './keepa.types';

export const KEEPA_SOURCE_NAME = 'keepa';

/**
 * A single mapped value with its provenance and, critically, its origin class.
 * OBSERVED and CALCULATED are never merged into one bucket: a reader must be able to see
 * which numbers Keepa reported and which this system worked out.
 */
export interface MappedField {
  field: string;
  value: string | number | null;
  origin: DataOrigin;
  /** Which Keepa field or formula produced it, for audit. */
  derivation: string;
}

export interface KeepaMappingResult {
  product: NormalizedProduct;
  fields: MappedField[];
  /** Price and rank series, kept as observations rather than collapsed to a single number. */
  priceHistory: Array<{ at: Date; price: number }>;
  salesRankHistory: Array<{ at: Date; rank: number }>;
  /** Reasons the record cannot be used, e.g. an inaccessible or invalid productType. */
  unusableReasons: string[];
  /** Things a reader must know about the mapped data. */
  notes: string[];
}

const productUrl = (asin: string): string => `https://www.amazon.in/dp/${asin}`;

/**
 * Maps one Keepa product object onto the system's NormalizedProduct.
 *
 * Mapping rules that matter:
 *  - Keepa reports the Amazon *selling* price. It is never treated as a supplier cost,
 *    so products sourced this way arrive with no cost data and score INCOMPLETE until a
 *    real supplier quote is supplied separately.
 *  - Sales rank is carried through as a rank. It is NOT converted into a units-sold
 *    estimate: that conversion needs a documented, citable model and this system has none.
 *  - Dataset status is always UNVERIFIED. Downloading data successfully says nothing about
 *    whether a human checked it.
 */
export function mapKeepaProduct(
  raw: KeepaProduct,
  options: { collectedAt: Date; category: string; marketplaceSlug?: string },
): KeepaMappingResult {
  const fields: MappedField[] = [];
  const notes: string[] = [];
  const unusableReasons: string[] = [];

  const observe = (field: string, value: string | number | null, derivation: string): void => {
    fields.push({ field, value, origin: DataOrigin.OBSERVED, derivation });
  };
  const calculate = (field: string, value: string | number | null, derivation: string): void => {
    fields.push({ field, value, origin: DataOrigin.CALCULATED, derivation });
  };

  // --- productType must be evaluated before trusting anything else ---
  const productType = raw.productType ?? KEEPA_PRODUCT_TYPE.STANDARD;
  if (productType === KEEPA_PRODUCT_TYPE.INVALID) {
    unusableReasons.push('Keepa productType=4 (INVALID): no reliable data for this ASIN');
  }
  if (productType === KEEPA_PRODUCT_TYPE.INACCESSIBLE) {
    unusableReasons.push('Keepa productType=3 (INACCESSIBLE): product data is not retrievable');
  }
  if (productType === KEEPA_PRODUCT_TYPE.VARIATION_PARENT) {
    notes.push('productType=5 (VARIATION_PARENT): prices belong to child variations, not this record');
  }

  const asin = raw.asin ?? '';
  if (!asin) {
    unusableReasons.push('no ASIN on the Keepa product object');
  }
  observe('source_product_id', asin || null, 'product.asin');

  const title = raw.title ?? '';
  observe('product_name', title || null, 'product.title');
  observe('brand', raw.brand ?? raw.manufacturer ?? null, 'product.brand / product.manufacturer');

  const csv = raw.csv ?? [];
  const stats = raw.stats ?? {};
  const statCurrent = stats.current ?? [];

  const currentAt = (index: number): number | null =>
    statCurrent.length > index ? statCurrent[index] : null;

  // --- Price. Preference order is documented here because it changes what the number means. ---
  // Buy Box (what a customer actually pays) → Amazon's own offer → lowest marketplace New.
  const buyBoxPrice = keepaPriceToMajorUnits(stats.buyBoxPrice);
  const amazonPrice = keepaPriceToMajorUnits(currentAt(KEEPA_CSV_INDEX.AMAZON));
  const newPrice = keepaPriceToMajorUnits(currentAt(KEEPA_CSV_INDEX.NEW));
  const buyBoxWithShipping = keepaPriceToMajorUnits(currentAt(KEEPA_CSV_INDEX.BUY_BOX_SHIPPING));

  observe('buy_box_price', buyBoxPrice, 'stats.buyBoxPrice');
  observe('buy_box_shipping', keepaPriceToMajorUnits(stats.buyBoxShipping), 'stats.buyBoxShipping');
  observe('buy_box_price_with_shipping', buyBoxWithShipping, `csv[${KEEPA_CSV_INDEX.BUY_BOX_SHIPPING}] BUY_BOX_SHIPPING`);
  observe('amazon_price', amazonPrice, `stats.current[${KEEPA_CSV_INDEX.AMAZON}] AMAZON`);
  observe('marketplace_new_price', newPrice, `stats.current[${KEEPA_CSV_INDEX.NEW}] NEW`);
  observe('buy_box_is_fba', stats.buyBoxIsFBA === undefined ? null : String(stats.buyBoxIsFBA), 'stats.buyBoxIsFBA');

  const observedPrice = buyBoxPrice ?? amazonPrice ?? newPrice;
  const priceBasis = buyBoxPrice !== null ? 'buy box' : amazonPrice !== null ? 'Amazon offer' : newPrice !== null ? 'lowest marketplace New' : 'none';
  calculate('observed_price', observedPrice, `first available of: buy box, Amazon offer, marketplace New (used: ${priceBasis})`);
  if (observedPrice === null) {
    unusableReasons.push('no current price available from Keepa (buy box, Amazon and marketplace New all absent)');
  } else {
    notes.push(`observed_price taken from the ${priceBasis}`);
  }

  // --- List price (MRP) and the discount derived from it ---
  const listPrice = keepaPriceToMajorUnits(currentAt(KEEPA_CSV_INDEX.LIST_PRICE));
  observe('mrp', listPrice, `stats.current[${KEEPA_CSV_INDEX.LIST_PRICE}] LISTPRICE`);
  const discount =
    observedPrice !== null && listPrice !== null && listPrice > 0 && observedPrice <= listPrice
      ? Math.round(((listPrice - observedPrice) / listPrice) * 10000) / 100
      : null;
  calculate('discount_percentage', discount, '(mrp - observed_price) / mrp * 100');

  // --- Demand signals ---
  const ratingPoint = latestHistoryPoint(csv[KEEPA_CSV_INDEX.RATING], keepaRatingToStars);
  const reviewPoint = latestHistoryPoint(csv[KEEPA_CSV_INDEX.COUNT_REVIEWS], keepaCount);
  const rating = ratingPoint?.value ?? keepaRatingToStars(currentAt(KEEPA_CSV_INDEX.RATING));
  const reviewCount = reviewPoint?.value ?? keepaCount(currentAt(KEEPA_CSV_INDEX.COUNT_REVIEWS));

  observe('rating', rating, `csv[${KEEPA_CSV_INDEX.RATING}] RATING (0-50 scale, /10)`);
  observe('review_count', reviewCount, `csv[${KEEPA_CSV_INDEX.COUNT_REVIEWS}] COUNT_REVIEWS`);

  // --- Sales rank. Carried as a rank only. ---
  const salesRankPoint = latestHistoryPoint(csv[KEEPA_CSV_INDEX.SALES_RANK], keepaCount);
  const salesRank = salesRankPoint?.value ?? keepaCount(currentAt(KEEPA_CSV_INDEX.SALES_RANK));
  observe('sales_rank', salesRank, `csv[${KEEPA_CSV_INDEX.SALES_RANK}] SALES`);
  observe('sales_rank_drops_30d', keepaCount(stats.salesRankDrops30), 'stats.salesRankDrops30');
  observe('sales_rank_drops_90d', keepaCount(stats.salesRankDrops90), 'stats.salesRankDrops90');
  if (salesRank !== null) {
    notes.push(
      'sales_rank is stored as a rank only. It is deliberately NOT converted into a units-sold ' +
        'estimate: that requires a documented rank-to-sales model, which this system does not have.',
    );
  }

  // --- Competition signals. Offer counts are what Keepa actually reports. ---
  const newOfferCount = keepaCount(currentAt(KEEPA_CSV_INDEX.COUNT_NEW));
  const usedOfferCount = keepaCount(currentAt(KEEPA_CSV_INDEX.COUNT_USED));
  observe('new_offer_count', newOfferCount, `stats.current[${KEEPA_CSV_INDEX.COUNT_NEW}] COUNT_NEW`);
  observe('used_offer_count', usedOfferCount, `stats.current[${KEEPA_CSV_INDEX.COUNT_USED}] COUNT_USED`);
  if (newOfferCount !== null) {
    notes.push(
      'competition_signal is set from the count of New offers on this ASIN. That is competition for ' +
        'one listing, which is a narrower thing than the number of competing products for a search term.',
    );
  }

  // --- Availability ---
  const availabilityCode = raw.availabilityAmazon;
  observe(
    'availability',
    availabilityCode === undefined ? null : (KEEPA_AVAILABILITY[availabilityCode] ?? `code ${availabilityCode}`),
    'product.availabilityAmazon',
  );
  observe('out_of_stock_percentage_90d', keepaCount(stats.outOfStockPercentage90), 'stats.outOfStockPercentage90');

  // --- Physical attributes ---
  const weightKg = gramsToKilograms(raw.packageWeight) ?? gramsToKilograms(raw.itemWeight);
  observe('product_weight', weightKg, 'product.packageWeight / itemWeight (grams -> kg)');

  const lengthCm = millimetresToCentimetres(raw.packageLength ?? raw.itemLength);
  const widthCm = millimetresToCentimetres(raw.packageWidth ?? raw.itemWidth);
  const heightCm = millimetresToCentimetres(raw.packageHeight ?? raw.itemHeight);
  const dimensions = lengthCm !== null && widthCm !== null && heightCm !== null ? { lengthCm, widthCm, heightCm } : null;
  observe('product_dimensions', dimensions ? `${lengthCm}x${widthCm}x${heightCm}` : null, 'product.package* / item* (mm -> cm)');

  // --- Images and categories ---
  const imageNames = raw.images?.map((image) => image.l ?? image.m).filter((name): name is string => Boolean(name))
    ?? raw.imagesCSV?.split(',').map((name) => name.trim()).filter(Boolean)
    ?? [];
  const imageUrls = imageNames.map((name) => `${KEEPA_IMAGE_BASE_URL}${name}`);
  observe('images', imageUrls.length > 0 ? imageUrls.join('|') : null, 'product.images / product.imagesCSV');

  const categoryTree = raw.categoryTree ?? [];
  observe('source_category', categoryTree.map((node) => node.name).join(' > ') || null, 'product.categoryTree');
  observe('source_category_ids', (raw.categories ?? []).join(',') || null, 'product.categories');

  // --- Freshness ---
  const lastUpdate = keepaMinutesToDate(raw.lastUpdate);
  const lastPriceChange = keepaMinutesToDate(raw.lastPriceChange);
  observe('keepa_last_update', lastUpdate ? lastUpdate.toISOString() : null, 'product.lastUpdate (Keepa minutes)');
  observe('keepa_last_price_change', lastPriceChange ? lastPriceChange.toISOString() : null, 'product.lastPriceChange');

  const priceHistory = parseHistory(csv[KEEPA_CSV_INDEX.AMAZON], keepaPriceToMajorUnits).map((point) => ({
    at: point.at,
    price: point.value,
  }));
  const salesRankHistory = parseHistory(csv[KEEPA_CSV_INDEX.SALES_RANK], keepaCount).map((point) => ({
    at: point.at,
    rank: point.value,
  }));

  const url = asin ? productUrl(asin) : '';

  const product: NormalizedProduct = {
    name: title ? normalizeName(title) : '',
    normalizedName: title ? normalizeNameForDedup(title) : '',
    url: url ? normalizeUrl(url) : '',
    marketplaceSlug: options.marketplaceSlug ?? 'amazon_in',
    externalId: asin || null,
    brand: raw.brand ?? raw.manufacturer ?? null,
    category: options.category,
    subcategory: categoryTree.length > 0 ? categoryTree[categoryTree.length - 1].name : null,
    description: raw.description ?? null,
    features: raw.features && raw.features.length > 0 ? raw.features : null,
    variants: raw.variations && raw.variations.length > 0 ? raw.variations.map((entry) => entry.asin) : null,
    sizes: raw.size ? [raw.size] : null,
    colors: raw.color ? [raw.color] : null,
    imageUrls: imageUrls.length > 0 ? imageUrls : null,
    weightKg,
    dimensions,

    sellingPrice: observedPrice as number,
    mrp: listPrice,
    discountPercentage: discount,
    currency: 'INR',

    reviewCount,
    averageRating: rating,
    // Offer count is the honest competition signal Keepa provides for a single ASIN.
    competitorCount: newOfferCount,
    sellerCount: newOfferCount,
    bestSellerRank: salesRank,
    searchTerm: null,

    // Keepa reports what a product SELLS for. It has no supplier-cost data, and inventing
    // one from the selling price would be fabrication. Cost stays null.
    costs: null,

    fragile: null,
    returnRisk: null,
    regulatoryComplexity: null,
    brandIpRisk: null,
    seasonalDemand: null,
    establishedBrandDominance: null,
    bundlePotentialScore: null,

    painPoints: [],

    sourceName: KEEPA_SOURCE_NAME,
    sourceUrl: url,
    collectedAt: options.collectedAt,
    confidenceScore: null,
    // Never VERIFIED just because a download succeeded.
    datasetStatus: DatasetStatus.UNVERIFIED,
  };

  notes.push(
    'No supplier cost is available from Keepa. Profitability and the Final Score stay withheld ' +
      'until a real supplier quote is supplied separately.',
  );

  return { product, fields, priceHistory, salesRankHistory, unusableReasons, notes };
}
