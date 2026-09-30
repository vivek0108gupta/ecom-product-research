/**
 * Detection of non-genuine URLs and source names.
 *
 * This exists because a URL that looks structurally valid can still point at nothing real.
 * A record sourced from `example-research.com` is indistinguishable from a real one by
 * shape alone, so VERIFIED status has to be gated on the *substance* of the source, not
 * on whether the string parses.
 *
 * Note these checks do not reject the record — SAMPLE data deliberately uses example.com.
 * They only block a claim of verification. See verification.ts.
 */

/**
 * Reserved and non-routable domains (RFC 2606 / RFC 6761), plus the tokens people reach
 * for when inventing a stand-in. Matched per hyphen-delimited label, so `example-research`
 * is caught while a legitimate host like `protest-gear.in` is not.
 */
const PLACEHOLDER_HOST_TOKENS = new Set([
  'example',
  'test',
  'invalid',
  'localhost',
  'demo',
  'sample',
  'placeholder',
  'dummy',
  'fake',
  'mock',
  'sandbox',
  'staging',
  'lorem',
  'ipsum',
  'foo',
  'bar',
  'baz',
  'acme',
  'yourdomain',
  'mydomain',
  'domain',
]);

/** TLDs that can never host a real public listing. */
const PLACEHOLDER_TLDS = new Set(['test', 'invalid', 'localhost', 'example', 'local', 'internal']);

/** Path segments that mark a URL as illustrative rather than a real listing. */
const PLACEHOLDER_PATH_SEGMENTS = new Set(['demo', 'sample', 'placeholder', 'dummy', 'fake', 'mock', 'example']);

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export interface PlaceholderUrlResult {
  isPlaceholder: boolean;
  /** Why it was flagged, for display and for the downgrade record. Empty when genuine. */
  reasons: string[];
}

/**
 * `is_placeholder_url(url)` — true when the URL cannot point at a real, traceable listing.
 *
 * An unparseable string counts as a placeholder: if we cannot even resolve a host from it,
 * it certainly cannot serve as evidence.
 */
export function isPlaceholderUrl(url: string | null | undefined): boolean {
  return inspectUrl(url).isPlaceholder;
}

/** Same check, with the specific reasons, for error messages and audit records. */
export function inspectUrl(url: string | null | undefined): PlaceholderUrlResult {
  const reasons: string[] = [];

  if (!url || url.trim() === '') {
    return { isPlaceholder: true, reasons: ['no URL supplied'] };
  }

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { isPlaceholder: true, reasons: [`'${url}' is not a parseable URL`] };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    reasons.push(`protocol '${parsed.protocol}' is not http(s)`);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (LOOPBACK_HOSTS.has(hostname)) {
    reasons.push(`'${hostname}' is a loopback address, not a public listing`);
  }

  const labels = hostname.split('.');
  const tld = labels[labels.length - 1];
  if (PLACEHOLDER_TLDS.has(tld)) {
    reasons.push(`'.${tld}' is a reserved/non-public TLD`);
  }

  // Check each hyphen-delimited token of each label: catches 'example-research.com'
  // and 'demo-store.in' without flagging 'protest-gear.in'.
  for (const label of labels) {
    for (const token of label.split('-')) {
      if (PLACEHOLDER_HOST_TOKENS.has(token)) {
        reasons.push(`hostname '${hostname}' contains placeholder token '${token}'`);
      }
    }
  }

  for (const segment of parsed.pathname.split('/')) {
    if (PLACEHOLDER_PATH_SEGMENTS.has(segment.toLowerCase())) {
      reasons.push(`URL path contains placeholder segment '/${segment}/'`);
    }
  }

  return { isPlaceholder: reasons.length > 0, reasons: [...new Set(reasons)] };
}

/**
 * Source names that identify a mechanism or a stand-in rather than a real, attributable
 * origin. `manual_csv` is the adapter's own name — it says how the row arrived, not who
 * observed it — so it cannot support a claim of verification either.
 */
const NON_ATTRIBUTABLE_SOURCE_NAMES = new Set([
  'seed_demo_data',
  'manual_csv',
  'manual entry',
  'demo assumption',
  'unknown',
  'n/a',
  'na',
  'none',
  'test',
  'demo',
  'sample',
  'placeholder',
  'example',
  'tbd',
]);

/** True when the source name does not attribute the data to a real, traceable origin. */
export function isNonAttributableSourceName(sourceName: string | null | undefined): boolean {
  if (!sourceName || sourceName.trim() === '') {
    return true;
  }
  const normalized = sourceName.trim().toLowerCase();
  if (NON_ATTRIBUTABLE_SOURCE_NAMES.has(normalized)) {
    return true;
  }
  // Also catch things like 'demo_source_2' or 'sample-research'.
  return [...NON_ATTRIBUTABLE_SOURCE_NAMES].some((token) =>
    new RegExp(`(^|[^a-z])${token.replace(/[^a-z0-9]/g, '[^a-z0-9]')}([^a-z]|$)`).test(normalized),
  );
}
