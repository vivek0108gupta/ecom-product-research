import {
  computeDiscountPercentage,
  normalizeName,
  normalizeUrl,
  parseList,
  parseNullableBoolean,
  parseNullableDate,
  parseNullableInt,
  parseNullableNumber,
  parseNullableString,
  normalizeNameForDedup,
} from './normalization';
import { identityKey, nameKey } from './ingestion.service';

describe('parseNullableString', () => {
  it('treats blanks and placeholder markers as not collected', () => {
    for (const value of ['', '   ', '-', 'n/a', 'NA', 'null', 'None', 'unknown', undefined, null]) {
      expect(parseNullableString(value)).toBeNull();
    }
  });

  it('trims real values', () => {
    expect(parseNullableString('  Car Organizer  ')).toBe('Car Organizer');
  });
});

describe('parseNullableNumber', () => {
  it('strips rupee symbols and thousands separators', () => {
    expect(parseNullableNumber('₹1,299.50')).toBe(1299.5);
    expect(parseNullableNumber('Rs. 899')).toBe(899);
    expect(parseNullableNumber('1299')).toBe(1299);
  });

  it('returns null rather than NaN or 0 for junk', () => {
    expect(parseNullableNumber('abc')).toBeNull();
    expect(parseNullableNumber('')).toBeNull();
    expect(parseNullableNumber('n/a')).toBeNull();
  });

  it('keeps zero as a real value', () => {
    expect(parseNullableNumber('0')).toBe(0);
  });

  it('rounds to an integer only where asked', () => {
    expect(parseNullableInt('4.6')).toBe(5);
    expect(parseNullableNumber('4.6')).toBe(4.6);
  });
});

describe('parseNullableBoolean', () => {
  it('is tri-state: blank means "not assessed", not false', () => {
    expect(parseNullableBoolean('yes')).toBe(true);
    expect(parseNullableBoolean('no')).toBe(false);
    expect(parseNullableBoolean('')).toBeNull();
    expect(parseNullableBoolean('maybe')).toBeNull();
  });
});

describe('parseList', () => {
  it('splits pipe-separated values and drops blanks', () => {
    expect(parseList('black|blue| red |')).toEqual(['black', 'blue', 'red']);
    expect(parseList('')).toBeNull();
  });
});

describe('parseNullableDate', () => {
  it('parses ISO timestamps and rejects junk', () => {
    expect(parseNullableDate('2026-09-20T10:00:00+05:30')?.toISOString()).toBe('2026-09-20T04:30:00.000Z');
    expect(parseNullableDate('not-a-date')).toBeNull();
  });
});

describe('normalizeUrl', () => {
  it('collapses tracking parameters, fragments, www and trailing slashes', () => {
    const variants = [
      'https://www.example.com/demo/item/?ref=abc&tag=xyz',
      'https://example.com/demo/item#reviews',
      'https://EXAMPLE.com/demo/item/',
    ];

    for (const variant of variants) {
      expect(normalizeUrl(variant)).toBe('https://example.com/demo/item');
    }
  });

  it('leaves an unparseable value untouched so validation can reject it', () => {
    expect(normalizeUrl('  not a url ')).toBe('not a url');
  });
});

describe('normalizeName', () => {
  it('collapses repeated whitespace', () => {
    expect(normalizeName('Car   Phone  Holder ')).toBe('Car Phone Holder');
  });
});

describe('normalizeNameForDedup', () => {
  it('collapses case, punctuation and spacing to a single key', () => {
    const variants = [
      'Packing Cubes, Set of 6 (Travel Organizer)',
      'packing cubes set of 6 travel organizer',
      'PACKING   CUBES - SET OF 6: TRAVEL ORGANIZER',
    ];

    for (const variant of variants) {
      expect(normalizeNameForDedup(variant)).toBe('packing cubes set of 6 travel organizer');
    }
  });

  it('keeps genuinely different products apart', () => {
    expect(normalizeNameForDedup('Packing Cubes Set of 6')).not.toBe(normalizeNameForDedup('Packing Cubes Set of 8'));
  });
});

describe('computeDiscountPercentage', () => {
  it('computes the displayed discount', () => {
    expect(computeDiscountPercentage(899, 1799)).toBe(50.03);
  });

  it('returns null rather than a negative discount when price exceeds MRP', () => {
    expect(computeDiscountPercentage(1999, 999)).toBeNull();
    expect(computeDiscountPercentage(899, null)).toBeNull();
  });
});

describe('identityKey (deduplication)', () => {
  it('keys on the marketplace id when one is published', () => {
    expect(identityKey('amazon_in', 'B0ABC', 'https://example.com/a')).toBe('amazon_in::id::B0ABC');
  });

  it('falls back to the normalized URL when there is no public id', () => {
    expect(identityKey('meesho', null, 'https://example.com/a')).toBe('meesho::url::https://example.com/a');
  });

  it('keeps the same product on different marketplaces distinct', () => {
    expect(identityKey('amazon_in', 'X1', 'u')).not.toBe(identityKey('flipkart', 'X1', 'u'));
  });

  it('collapses the same listing reached through different tracking URLs', () => {
    const a = identityKey('amazon_in', null, normalizeUrl('https://www.example.com/item?ref=1'));
    const b = identityKey('amazon_in', null, normalizeUrl('https://example.com/item/'));

    expect(a).toBe(b);
  });
});

describe('nameKey (third deduplication key)', () => {
  it('matches the same product name written differently on one marketplace', () => {
    const a = nameKey('amazon_in', normalizeNameForDedup('Packing Cubes, Set of 6'));
    const b = nameKey('amazon_in', normalizeNameForDedup('packing cubes set of 6'));

    expect(a).toBe(b);
  });

  it('keeps the same name on different marketplaces separate, so cross-marketplace comparison survives', () => {
    const amazon = nameKey('amazon_in', normalizeNameForDedup('Packing Cubes Set of 6'));
    const flipkart = nameKey('flipkart', normalizeNameForDedup('Packing Cubes Set of 6'));

    expect(amazon).not.toBe(flipkart);
  });

  it('is distinct from the id/url key space so the two can share one seen-set', () => {
    expect(nameKey('amazon_in', 'widget')).not.toBe(identityKey('amazon_in', 'widget', 'widget'));
  });
});
