/**
 * Constants taken from Keepa's published API documentation (keepa.com/api-docs),
 * checked 2026-09-29. Nothing here is guessed — a wrong csv index or epoch offset would
 * silently corrupt every price we store, so each value is sourced from the docs.
 */

/** Amazon.in. Keepa domain IDs: 1=com, 2=co.uk, 3=de, 4=fr, 5=co.jp, 6=ca, 8=it, 9=es, 10=in, 11=com.mx, 12=com.br */
export const KEEPA_DOMAIN_INDIA = 10;

export const KEEPA_API_BASE_URL = 'https://api.keepa.com';

/**
 * Indices into the product `csv` history array, and into `stats.current`
 * (both use Keepa's "Price Type" indexing).
 */
export const KEEPA_CSV_INDEX = {
  AMAZON: 0,
  NEW: 1,
  USED: 2,
  SALES_RANK: 3,
  LIST_PRICE: 4,
  COLLECTIBLE: 5,
  REFURBISHED: 6,
  NEW_FBM_SHIPPING: 7,
  LIGHTNING_DEAL: 8,
  WAREHOUSE: 9,
  NEW_FBA: 10,
  COUNT_NEW: 11,
  COUNT_USED: 12,
  COUNT_REFURBISHED: 13,
  COUNT_COLLECTIBLE: 14,
  EXTRA_INFO_UPDATES: 15,
  /** Rating history on a 0-50 scale: 45 means 4.5 stars. */
  RATING: 16,
  COUNT_REVIEWS: 17,
  /** New buy box price including shipping. */
  BUY_BOX_SHIPPING: 18,
} as const;

/** Keepa uses -1 for "no offer / no data in this interval". Never treat it as a price of zero. */
export const KEEPA_NO_VALUE = -1;
/** Some stats fields use -2 for "not available", alongside -1. */
export const KEEPA_NOT_AVAILABLE = -2;

/**
 * Keepa Time is minutes since its own epoch.
 * Documented conversion: unixMilliseconds = (keepaMinutes + 21564000) * 60000
 */
export const KEEPA_EPOCH_OFFSET_MINUTES = 21_564_000;

/** availabilityAmazon codes, per the product object docs. */
export const KEEPA_AVAILABILITY: Record<number, string> = {
  [-1]: 'no Amazon offer',
  0: 'in stock',
  1: 'pre-order',
  2: 'unknown',
  3: 'back-order',
  4: 'delayed shipping',
};

/**
 * productType must be evaluated before trusting any other field.
 * 0=STANDARD, 1=DOWNLOADABLE, 2=EBOOK, 3=INACCESSIBLE, 4=INVALID, 5=VARIATION_PARENT
 */
export const KEEPA_PRODUCT_TYPE = {
  STANDARD: 0,
  DOWNLOADABLE: 1,
  EBOOK: 2,
  INACCESSIBLE: 3,
  INVALID: 4,
  VARIATION_PARENT: 5,
} as const;

/** Amazon image CDN prefix for names returned in the images/imagesCSV fields. */
export const KEEPA_IMAGE_BASE_URL = 'https://m.media-amazon.com/images/I/';

/**
 * Documented token costs, used to budget requests before sending them.
 * A product request costs 1 token per ASIN; options add to that.
 */
export const KEEPA_TOKEN_COST = {
  PRODUCT_PER_ASIN: 1,
  /** +6 tokens per found offer page when the offers parameter is used. */
  OFFERS_PER_PAGE: 6,
  /** +2 tokens per product for Buy Box data. */
  BUY_BOX_PER_PRODUCT: 2,
  /** Product search costs 10 tokens per result page. */
  SEARCH_PER_PAGE: 10,
} as const;

/** Unused tokens expire 60 minutes after they are generated. */
export const KEEPA_TOKEN_EXPIRY_MINUTES = 60;

/** Reported when no API key is configured. No network request is attempted in that state. */
export const KEEPA_NOT_CONFIGURED = 'KEEPA_NOT_CONFIGURED';
