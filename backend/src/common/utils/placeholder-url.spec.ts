import { inspectUrl, isNonAttributableSourceName, isPlaceholderUrl } from './placeholder-url';

describe('isPlaceholderUrl', () => {
  it.each([
    'https://example.com/listing/123',
    'https://www.example.com/listing/123',
    'https://example-research.com/listing/spice-rack-12',
    'https://www.example-research.com/listing/drying-rack',
    'https://shop.example.net/p/1',
    'https://example.org/item',
    'https://research-example.com/item',
  ])('rejects the example domain %s', (url) => {
    expect(isPlaceholderUrl(url)).toBe(true);
  });

  it.each([
    'https://store.test/item',
    'https://something.invalid/item',
    'https://app.localhost/item',
    'http://localhost:3000/item',
    'http://127.0.0.1/item',
    'https://my.local/item',
  ])('rejects the reserved/non-public host %s', (url) => {
    expect(isPlaceholderUrl(url)).toBe(true);
  });

  it.each([
    'https://demo-store.in/product/1',
    'https://sample-shop.co.in/p/2',
    'https://mystore.in/demo/product-1',
    'https://mystore.in/sample/product-1',
    'https://fake-shop.com/x',
    'https://acme.com/widget',
    'https://staging.myshop.in/p/9',
  ])('rejects the demo/placeholder URL %s', (url) => {
    expect(isPlaceholderUrl(url)).toBe(true);
  });

  it.each([null, undefined, '', '   ', 'not-a-url', 'ftp://example.com/x'])(
    'rejects the unusable value %s',
    (url) => {
      expect(isPlaceholderUrl(url as string)).toBe(true);
    },
  );

  it.each([
    'https://www.amazon.in/dp/B0ABCDEFGH',
    'https://www.flipkart.com/some-product/p/itm123456',
    'https://www.meesho.com/product-name/p/abc123',
    'https://indiamart.com/proddetail/steel-rack-123.html',
    'https://mystore.in/products/spice-rack',
  ])('accepts the real marketplace URL %s', (url) => {
    expect(isPlaceholderUrl(url)).toBe(false);
  });

  it('does not flag a legitimate host that merely contains a placeholder token inside a word', () => {
    // 'protest' contains 'test', 'demonstration' contains 'demo' — neither is a stand-in.
    expect(isPlaceholderUrl('https://protest-gear.in/product/1')).toBe(false);
    expect(isPlaceholderUrl('https://demonstrations.in/product/1')).toBe(false);
    expect(isPlaceholderUrl('https://contest.in/p/1')).toBe(false);
  });

  it('documents the known boundary: a concatenated placeholder word is not detected', () => {
    // Matching is per hyphen/dot-delimited token, so 'fakeshop.com' reads as an ordinary
    // registrable domain. Detecting it would require substring matching, which would also
    // reject 'demolition.com' and 'testament.in'. This gap is acceptable because a URL is
    // only one of the checks a VERIFIED claim has to pass — see verification.ts, which
    // additionally requires an attributable source name and full price/cost/demand evidence.
    expect(isPlaceholderUrl('https://fakeshop.com/x')).toBe(false);
  });

  it('explains why a URL was flagged', () => {
    const result = inspectUrl('https://example-research.com/demo/item');

    expect(result.isPlaceholder).toBe(true);
    expect(result.reasons.some((reason) => reason.includes("placeholder token 'example'"))).toBe(true);
    expect(result.reasons.some((reason) => reason.includes("placeholder segment '/demo/'"))).toBe(true);
  });

  it('returns no reasons for a genuine URL', () => {
    expect(inspectUrl('https://www.amazon.in/dp/B0ABCDEFGH')).toEqual({ isPlaceholder: false, reasons: [] });
  });
});

describe('isNonAttributableSourceName', () => {
  it.each(['seed_demo_data', 'manual_csv', 'manual entry', 'demo assumption', 'unknown', 'n/a', '', '   '])(
    'rejects the non-attributable source name %s',
    (name) => {
      expect(isNonAttributableSourceName(name)).toBe(true);
    },
  );

  it('rejects names that merely embed a placeholder token', () => {
    expect(isNonAttributableSourceName('demo_source_2')).toBe(true);
    expect(isNonAttributableSourceName('sample-research')).toBe(true);
  });

  it('accepts a name that attributes the record to a real origin', () => {
    expect(isNonAttributableSourceName('amazon_seller_central_export')).toBe(false);
    expect(isNonAttributableSourceName('indiamart supplier quote 2026-09-28')).toBe(false);
    expect(isNonAttributableSourceName('vivek manual listing review')).toBe(false);
  });
});
