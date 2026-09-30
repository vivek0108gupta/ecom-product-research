import { KEEPA_EPOCH_OFFSET_MINUTES, KEEPA_NOT_AVAILABLE, KEEPA_NO_VALUE } from './keepa.constants';

/**
 * Conversions between Keepa's wire format and ours.
 *
 * Every function here returns `null` rather than a fallback when the input carries no
 * value. Keepa signals "no offer" with -1 (and -2 for "not available"); turning either of
 * those into 0 would present an out-of-stock product as free.
 */

/** Keepa Time minutes -> Date. Documented: unixMs = (keepaMinutes + 21564000) * 60000 */
export function keepaMinutesToDate(keepaMinutes: number | null | undefined): Date | null {
  if (keepaMinutes === null || keepaMinutes === undefined || !Number.isFinite(keepaMinutes)) {
    return null;
  }
  if (keepaMinutes <= 0) {
    return null;
  }
  return new Date((keepaMinutes + KEEPA_EPOCH_OFFSET_MINUTES) * 60_000);
}

export function dateToKeepaMinutes(date: Date): number {
  return Math.floor(date.getTime() / 60_000) - KEEPA_EPOCH_OFFSET_MINUTES;
}

/** True for Keepa's "no data" sentinels. */
export function isKeepaNoValue(value: number | null | undefined): boolean {
  return value === null || value === undefined || value === KEEPA_NO_VALUE || value === KEEPA_NOT_AVAILABLE;
}

/**
 * Keepa prices are integers in the locale's smallest currency unit. For amazon.in that is
 * paise, so 124900 -> ₹1249.00. Returns null for the no-value sentinels.
 */
export function keepaPriceToMajorUnits(value: number | null | undefined): number | null {
  if (isKeepaNoValue(value)) {
    return null;
  }
  if (!Number.isFinite(value as number) || (value as number) < 0) {
    return null;
  }
  return Math.round((value as number)) / 100;
}

/** Rating history is on a 0-50 scale: 45 -> 4.5 stars. */
export function keepaRatingToStars(value: number | null | undefined): number | null {
  if (isKeepaNoValue(value)) {
    return null;
  }
  const rating = (value as number) / 10;
  return rating >= 0 && rating <= 5 ? Math.round(rating * 100) / 100 : null;
}

/** Plain integer counts (review count, offer count, sales rank) with sentinel handling. */
export function keepaCount(value: number | null | undefined): number | null {
  if (isKeepaNoValue(value)) {
    return null;
  }
  return Number.isFinite(value as number) && (value as number) >= 0 ? Math.round(value as number) : null;
}

export interface KeepaHistoryPoint {
  at: Date;
  value: number;
}

/**
 * Keepa history arrays are flat pairs: [keepaMinutes, value, keepaMinutes, value, ...].
 * Points carrying a no-value sentinel are dropped rather than emitted as zero.
 */
export function parseHistory(
  history: number[] | null | undefined,
  transform: (raw: number) => number | null = (raw) => raw,
): KeepaHistoryPoint[] {
  if (!Array.isArray(history) || history.length < 2) {
    return [];
  }

  const points: KeepaHistoryPoint[] = [];
  for (let index = 0; index + 1 < history.length; index += 2) {
    const at = keepaMinutesToDate(history[index]);
    const value = transform(history[index + 1]);
    if (at !== null && value !== null) {
      points.push({ at, value });
    }
  }
  return points;
}

/** The most recent point of a history array, or null when the series has no usable data. */
export function latestHistoryPoint(
  history: number[] | null | undefined,
  transform: (raw: number) => number | null = (raw) => raw,
): KeepaHistoryPoint | null {
  const points = parseHistory(history, transform);
  return points.length > 0 ? points[points.length - 1] : null;
}

/** Package dimensions arrive in millimetres; we store centimetres. */
export function millimetresToCentimetres(value: number | null | undefined): number | null {
  if (isKeepaNoValue(value) || !Number.isFinite(value as number) || (value as number) <= 0) {
    return null;
  }
  return Math.round(((value as number) / 10) * 100) / 100;
}

/** Package weight arrives in grams; we store kilograms. */
export function gramsToKilograms(value: number | null | undefined): number | null {
  if (isKeepaNoValue(value) || !Number.isFinite(value as number) || (value as number) <= 0) {
    return null;
  }
  return Math.round(((value as number) / 1000) * 1000) / 1000;
}
