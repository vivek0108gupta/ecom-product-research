/** Field-level normalization shared by every adapter. */

/** Empty string, '-', 'n/a', 'null' and friends all mean "not collected" → null, never 0 or ''. */
export function parseNullableString(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || ['-', 'n/a', 'na', 'null', 'none', 'unknown'].includes(trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
}

/** Strips currency symbols, thousands separators and stray whitespace: '₹1,299.00' → 1299. */
export function parseNullableNumber(raw: string | undefined | null): number | null {
  const value = parseNullableString(raw);
  if (value === null) {
    return null;
  }
  const cleaned = value.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseNullableInt(raw: string | undefined | null): number | null {
  const parsed = parseNullableNumber(raw);
  return parsed === null ? null : Math.round(parsed);
}

/** Tri-state on purpose: a blank flag means "not assessed", which is not the same as false. */
export function parseNullableBoolean(raw: string | undefined | null): boolean | null {
  const value = parseNullableString(raw);
  if (value === null) {
    return null;
  }
  const lowered = value.toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(lowered)) {
    return true;
  }
  if (['false', 'no', 'n', '0'].includes(lowered)) {
    return false;
  }
  return null;
}

/** Pipe-separated multi-values: 'black|blue|red' → ['black','blue','red']. */
export function parseList(raw: string | undefined | null): string[] | null {
  const value = parseNullableString(raw);
  if (value === null) {
    return null;
  }
  const items = value
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : null;
}

export function parseNullableDate(raw: string | undefined | null): Date | null {
  const value = parseNullableString(raw);
  if (value === null) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Canonical URL form used for deduplication: lowercase host, no tracking query string,
 * no trailing slash. Two researchers pasting the same listing with different tracking
 * parameters must collapse to one product.
 */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    url.hash = '';
    url.search = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.hostname}${path}`;
  } catch {
    return raw.trim();
  }
}

/** Collapses whitespace so 'Car  Phone   Holder ' stores as 'Car Phone Holder'. */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Aggressive form used only as the third deduplication key: lowercase, punctuation and
 * bracketed qualifiers removed, whitespace collapsed. So
 * 'Packing Cubes, Set of 6 (Travel Organizer)' and 'packing cubes set of 6 travel organizer'
 * collapse to the same key, while genuinely different products stay apart.
 */
export function normalizeNameForDedup(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeDiscountPercentage(sellingPrice: number, mrp: number | null): number | null {
  if (mrp === null || mrp <= 0 || sellingPrice > mrp) {
    return null;
  }
  return Math.round(((mrp - sellingPrice) / mrp) * 10000) / 100;
}
