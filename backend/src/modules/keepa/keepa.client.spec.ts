import { KEEPA_NOT_CONFIGURED } from './keepa.constants';
import { KeepaClient, KeepaNotConfiguredError } from './keepa.client';
import { KeepaProductSourceAdapter } from './keepa-product-source.adapter';
import { KeepaTokenBucket } from './keepa-token-bucket';
import { UnsupportedOperationError } from '../../common/interfaces/product-source-adapter.interface';

/** A fetch that fails the test if it is ever called. */
const forbiddenFetch = jest.fn(() => {
  throw new Error('NETWORK CALL ATTEMPTED — the dry-run guarantee is broken');
}) as unknown as typeof fetch;

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe('KeepaClient — no API key means no network', () => {
  beforeEach(() => (forbiddenFetch as unknown as jest.Mock).mockClear());

  const unconfigured = () => new KeepaClient(() => undefined, { fetchImpl: forbiddenFetch });

  it('reports itself as not configured', () => {
    expect(unconfigured().isConfigured()).toBe(false);
  });

  it('throws KEEPA_NOT_CONFIGURED without making a request', async () => {
    await expect(unconfigured().getProducts(['B0TEST00001'])).rejects.toBeInstanceOf(KeepaNotConfiguredError);
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });

  it('carries the KEEPA_NOT_CONFIGURED code and an actionable message', async () => {
    let error: KeepaNotConfiguredError | null = null;
    try {
      await unconfigured().getProducts(['B0TEST00001']);
    } catch (caught) {
      error = caught as KeepaNotConfiguredError;
    }

    expect(error).not.toBeNull();
    expect(error!.code).toBe(KEEPA_NOT_CONFIGURED);
    expect(error!.message).toContain('KEEPA_API_KEY');
    expect(error!.message).toContain('No request was made');
  });

  it.each(['', '   '])('treats a blank key (%p) as unconfigured', async (key) => {
    const client = new KeepaClient(() => key, { fetchImpl: forbiddenFetch });

    expect(client.isConfigured()).toBe(false);
    await expect(client.getProducts(['B0TEST00001'])).rejects.toBeInstanceOf(KeepaNotConfiguredError);
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });

  it('blocks the category endpoint too', async () => {
    await expect(unconfigured().getCategoryLookup(1)).rejects.toBeInstanceOf(KeepaNotConfiguredError);
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });
});

describe('KeepaClient — request behaviour with a key', () => {
  const sleep = jest.fn(async () => undefined);

  beforeEach(() => sleep.mockClear());

  it('captures token state from the response envelope', async () => {
    const fetchImpl = jest.fn(async () =>
      okResponse({ products: [], tokensLeft: 1180, refillRate: 20, refillIn: 42000, tokensConsumed: 3 }),
    ) as unknown as typeof fetch;

    const client = new KeepaClient(() => 'test-key', { fetchImpl, sleep });
    await client.getProducts(['B0TEST00001']);

    const snapshot = client.tokens.snapshot();
    expect(snapshot.tokensLeft).toBe(1180 - 3);
    expect(snapshot.refillRatePerMinute).toBe(20);
  });

  it('sends the India domain and the ASIN list', async () => {
    const fetchImpl = jest.fn(async () => okResponse({ products: [] })) as unknown as typeof fetch;
    await new KeepaClient(() => 'test-key', { fetchImpl, sleep }).getProducts(['A1', 'A2']);

    const url = (fetchImpl as unknown as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('domain=10');
    expect(url).toContain('asin=A1%2CA2');
    expect(url).toContain('key=test-key');
  });

  it('retries transient failures with backoff, then succeeds', async () => {
    let attempts = 0;
    const fetchImpl = jest.fn(async () => {
      attempts += 1;
      return attempts < 3
        ? ({ ok: false, status: 503 } as unknown as Response)
        : okResponse({ products: [], tokensLeft: 10, refillRate: 20 });
    }) as unknown as typeof fetch;

    const result = await new KeepaClient(() => 'k', { fetchImpl, sleep, baseBackoffMs: 1 }).getProducts(['A1']);

    expect(attempts).toBe(3);
    expect(sleep).toHaveBeenCalled();
    expect(result.products).toEqual([]);
  });

  it('does not retry a non-transient failure such as a bad key', async () => {
    let attempts = 0;
    const fetchImpl = jest.fn(async () => {
      attempts += 1;
      return { ok: false, status: 401 } as unknown as Response;
    }) as unknown as typeof fetch;

    await expect(new KeepaClient(() => 'bad', { fetchImpl, sleep }).getProducts(['A1'])).rejects.toThrow('HTTP 401');
    expect(attempts).toBe(1);
  });

  it('surfaces an error object returned in the response body', async () => {
    const fetchImpl = jest.fn(async () =>
      okResponse({ error: { type: 'invalidKey', message: 'not a valid key' } }),
    ) as unknown as typeof fetch;

    await expect(new KeepaClient(() => 'k', { fetchImpl, sleep }).getProducts(['A1'])).rejects.toThrow('invalidKey');
  });

  it('refuses more than the documented 100 ASINs per request', async () => {
    const fetchImpl = jest.fn(async () => okResponse({ products: [] })) as unknown as typeof fetch;
    const asins = Array.from({ length: 101 }, (_, index) => `A${index}`);

    await expect(new KeepaClient(() => 'k', { fetchImpl, sleep }).getProducts(asins)).rejects.toThrow('at most 100');
  });

  it('waits when the token budget cannot afford the request', async () => {
    const fetchImpl = jest.fn(async () => okResponse({ products: [], tokensLeft: 1, refillRate: 20 })) as unknown as typeof fetch;
    const client = new KeepaClient(() => 'k', { fetchImpl, sleep });

    await client.getProducts(['A1']); // seeds token state at 1 token
    await client.getProducts(Array.from({ length: 50 }, (_, i) => `B${i}`)); // needs 50

    expect(sleep).toHaveBeenCalled();
  });
});

describe('KeepaProductSourceAdapter — unconfigured', () => {
  const adapter = new KeepaProductSourceAdapter(new KeepaClient(() => undefined, { fetchImpl: forbiddenFetch }));

  beforeEach(() => (forbiddenFetch as unknown as jest.Mock).mockClear());

  it('reports KEEPA_NOT_CONFIGURED in its status', () => {
    const status = adapter.getStatus();

    expect(status.state).toBe(KEEPA_NOT_CONFIGURED);
    expect(status.configured).toBe(false);
    expect(status.apiKeyPresent).toBe(false);
    expect(status.adapterImplemented).toBe(true);
    expect(status.domain).toBe(10);
  });

  it.each(['getProductDetails', 'getPricing'] as const)('%s refuses without a key and makes no request', async (method) => {
    await expect(adapter[method]('B0TEST00001')).rejects.toBeInstanceOf(KeepaNotConfiguredError);
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });

  it('declares that it cannot supply review text', async () => {
    expect(adapter.capabilities.reviews).toBe(false);
    await expect(adapter.getReviews('B0TEST00001')).rejects.toBeInstanceOf(UnsupportedOperationError);
  });

  it('maps fixtures offline without any key or network', () => {
    const mapped = adapter.mapProducts(
      [{ asin: 'B0FIXTURE1', productType: 0, title: 'Fixture', stats: { buyBoxPrice: 100000 } }],
      { collectedAt: new Date(), category: 'home-organization' },
    );

    expect(mapped[0].product.sellingPrice).toBe(1000);
    expect(forbiddenFetch).not.toHaveBeenCalled();
  });
});

describe('KeepaTokenBucket', () => {
  it('estimates the documented cost of a product request', () => {
    expect(KeepaTokenBucket.estimateProductCost(500)).toBe(500);
    expect(KeepaTokenBucket.estimateProductCost(500, { withBuyBox: true })).toBe(1500);
    expect(KeepaTokenBucket.estimateProductCost(10, { offerPages: 2 })).toBe(130);
  });

  it('allows the first request so the response can seed token state', () => {
    expect(new KeepaTokenBucket().canAfford(50).allowed).toBe(true);
  });

  it('accrues tokens at the refill rate between responses', () => {
    let now = new Date('2026-09-29T12:00:00Z');
    const bucket = new KeepaTokenBucket(() => now);
    bucket.update({ tokensLeft: 0, refillRate: 20, refillInMs: 0, observedAt: now });

    expect(bucket.canAfford(20).allowed).toBe(false);

    now = new Date('2026-09-29T12:01:00Z'); // one minute later => +20 tokens
    expect(bucket.projectedTokens()).toBe(20);
    expect(bucket.canAfford(20).allowed).toBe(true);
  });

  it('caps the projection at the documented 60-minute expiry ceiling', () => {
    let now = new Date('2026-09-29T12:00:00Z');
    const bucket = new KeepaTokenBucket(() => now);
    bucket.update({ tokensLeft: 0, refillRate: 20, refillInMs: 0, observedAt: now });

    now = new Date('2026-09-29T23:00:00Z'); // 11 hours later
    expect(bucket.projectedTokens()).toBe(20 * 60);
  });

  it('reports how long to wait when it cannot afford a request', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    const bucket = new KeepaTokenBucket(() => now);
    bucket.update({ tokensLeft: 0, refillRate: 20, refillInMs: 0, observedAt: now });

    const decision = bucket.canAfford(40);
    expect(decision.allowed).toBe(false);
    expect(decision.waitMs).toBe(120_000); // 40 tokens at 20/min = 2 minutes
    expect(decision.reason).toContain('refills at 20/min');
  });
});
