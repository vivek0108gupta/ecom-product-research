import { KEEPA_EPOCH_OFFSET_MINUTES } from './keepa.constants';
import {
  dateToKeepaMinutes,
  gramsToKilograms,
  isKeepaNoValue,
  keepaCount,
  keepaMinutesToDate,
  keepaPriceToMajorUnits,
  keepaRatingToStars,
  latestHistoryPoint,
  millimetresToCentimetres,
  parseHistory,
} from './keepa-conversions';

describe('keepaMinutesToDate', () => {
  it('applies the documented epoch offset', () => {
    // unixMs = (keepaMinutes + 21564000) * 60000
    const keepaMinutes = 7_100_000;
    const expected = new Date((keepaMinutes + KEEPA_EPOCH_OFFSET_MINUTES) * 60_000);

    expect(keepaMinutesToDate(keepaMinutes)!.getTime()).toBe(expected.getTime());
  });

  it('round-trips through dateToKeepaMinutes', () => {
    const date = new Date('2026-09-29T12:00:00.000Z');
    expect(keepaMinutesToDate(dateToKeepaMinutes(date))!.getTime()).toBe(date.getTime());
  });

  it('returns null for missing or non-positive values', () => {
    expect(keepaMinutesToDate(null)).toBeNull();
    expect(keepaMinutesToDate(undefined)).toBeNull();
    expect(keepaMinutesToDate(0)).toBeNull();
    expect(keepaMinutesToDate(-1)).toBeNull();
  });
});

describe('keepaPriceToMajorUnits', () => {
  it('converts the smallest currency unit to rupees', () => {
    expect(keepaPriceToMajorUnits(124900)).toBe(1249);
    expect(keepaPriceToMajorUnits(99)).toBe(0.99);
  });

  it('returns null for the -1 no-offer sentinel rather than a price of zero', () => {
    expect(keepaPriceToMajorUnits(-1)).toBeNull();
  });

  it('returns null for the -2 not-available sentinel', () => {
    expect(keepaPriceToMajorUnits(-2)).toBeNull();
  });

  it('returns null for missing values', () => {
    expect(keepaPriceToMajorUnits(null)).toBeNull();
    expect(keepaPriceToMajorUnits(undefined)).toBeNull();
  });

  it('keeps a genuine zero price distinct from no data', () => {
    expect(keepaPriceToMajorUnits(0)).toBe(0);
  });
});

describe('keepaRatingToStars', () => {
  it('converts the documented 0-50 scale to stars', () => {
    expect(keepaRatingToStars(45)).toBe(4.5);
    expect(keepaRatingToStars(50)).toBe(5);
    expect(keepaRatingToStars(0)).toBe(0);
  });

  it('returns null for sentinels and out-of-range values', () => {
    expect(keepaRatingToStars(-1)).toBeNull();
    expect(keepaRatingToStars(90)).toBeNull();
  });
});

describe('keepaCount', () => {
  it('passes through non-negative integers', () => {
    expect(keepaCount(1200)).toBe(1200);
    expect(keepaCount(0)).toBe(0);
  });

  it('returns null for sentinels', () => {
    expect(keepaCount(-1)).toBeNull();
    expect(keepaCount(-2)).toBeNull();
    expect(keepaCount(undefined)).toBeNull();
  });
});

describe('isKeepaNoValue', () => {
  it('recognises both documented sentinels and absence', () => {
    expect(isKeepaNoValue(-1)).toBe(true);
    expect(isKeepaNoValue(-2)).toBe(true);
    expect(isKeepaNoValue(null)).toBe(true);
    expect(isKeepaNoValue(undefined)).toBe(true);
    expect(isKeepaNoValue(0)).toBe(false);
  });
});

describe('parseHistory', () => {
  it('reads flat [time, value, time, value] pairs', () => {
    const points = parseHistory([7_099_000, 110000, 7_100_000, 100000], keepaPriceToMajorUnits);

    expect(points).toHaveLength(2);
    expect(points[0].value).toBe(1100);
    expect(points[1].value).toBe(1000);
    expect(points[1].at.getTime()).toBeGreaterThan(points[0].at.getTime());
  });

  it('drops points carrying a no-value sentinel instead of emitting zero', () => {
    const points = parseHistory([7_099_000, -1, 7_100_000, 100000], keepaPriceToMajorUnits);

    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(1000);
  });

  it('handles null, empty and odd-length series safely', () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory([])).toEqual([]);
    expect(parseHistory([7_100_000])).toEqual([]);
  });

  it('latestHistoryPoint returns the final usable point', () => {
    expect(latestHistoryPoint([7_099_000, 110000, 7_100_000, 100000], keepaPriceToMajorUnits)!.value).toBe(1000);
    expect(latestHistoryPoint(null)).toBeNull();
  });
});

describe('unit conversions', () => {
  it('converts package millimetres to centimetres', () => {
    expect(millimetresToCentimetres(300)).toBe(30);
    expect(millimetresToCentimetres(-1)).toBeNull();
    expect(millimetresToCentimetres(0)).toBeNull();
  });

  it('converts package grams to kilograms', () => {
    expect(gramsToKilograms(1000)).toBe(1);
    expect(gramsToKilograms(550)).toBe(0.55);
    expect(gramsToKilograms(-1)).toBeNull();
  });
});
