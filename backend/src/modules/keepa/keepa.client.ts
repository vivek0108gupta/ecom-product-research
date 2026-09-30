import { Injectable, Logger } from '@nestjs/common';
import { KEEPA_API_BASE_URL, KEEPA_DOMAIN_INDIA, KEEPA_NOT_CONFIGURED } from './keepa.constants';
import { KeepaTokenBucket } from './keepa-token-bucket';
import { KeepaResponse } from './keepa.types';

export class KeepaNotConfiguredError extends Error {
  readonly code = KEEPA_NOT_CONFIGURED;

  constructor() {
    super(
      `${KEEPA_NOT_CONFIGURED}: no KEEPA_API_KEY is set. No request was made. ` +
        'Set KEEPA_API_KEY in .env and enable the keepa source in config/data-sources.json to activate live collection.',
    );
    this.name = 'KeepaNotConfiguredError';
  }
}

export interface KeepaClientOptions {
  maxRetries?: number;
  baseBackoffMs?: number;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests so backoff does not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * HTTP client for Keepa.
 *
 * Two guarantees matter here:
 *  1. With no API key, this class makes no network request at all — it throws
 *     KeepaNotConfiguredError before constructing a URL. Dry-run mode is enforced by the
 *     absence of a key, not by a flag someone could forget to set.
 *  2. Requests are budgeted against the documented token bucket before being sent, and
 *     transient failures back off exponentially rather than hammering the endpoint.
 */
@Injectable()
export class KeepaClient {
  private readonly logger = new Logger(KeepaClient.name);
  readonly tokens = new KeepaTokenBucket();

  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly apiKeyProvider: () => string | undefined = () => process.env.KEEPA_API_KEY,
    options: KeepaClientOptions = {},
  ) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseBackoffMs = options.baseBackoffMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  isConfigured(): boolean {
    const key = this.apiKeyProvider();
    return typeof key === 'string' && key.trim().length > 0;
  }

  /** Throws KeepaNotConfiguredError when no key is present. Never performs I/O in that state. */
  private requireKey(): string {
    const key = this.apiKeyProvider();
    if (!key || key.trim() === '') {
      throw new KeepaNotConfiguredError();
    }
    return key.trim();
  }

  /**
   * Fetches product data for up to 100 ASINs (Keepa's documented per-request maximum).
   * Costs 1 token per ASIN, plus 2 per product when Buy Box data is requested.
   */
  async getProducts(
    asins: string[],
    options: { domain?: number; withBuyBox?: boolean; statsDays?: number; history?: boolean } = {},
  ): Promise<KeepaResponse> {
    const key = this.requireKey();

    if (asins.length === 0) {
      return { products: [] };
    }
    if (asins.length > 100) {
      throw new Error('Keepa accepts at most 100 ASINs per product request');
    }

    const cost = KeepaTokenBucket.estimateProductCost(asins.length, { withBuyBox: options.withBuyBox });
    const budget = this.tokens.canAfford(cost);
    if (!budget.allowed) {
      this.logger.warn(`Waiting ${budget.waitMs}ms for Keepa tokens: ${budget.reason}`);
      await this.sleep(budget.waitMs);
    }

    const params = new URLSearchParams({
      key,
      domain: String(options.domain ?? KEEPA_DOMAIN_INDIA),
      asin: asins.join(','),
      stats: String(options.statsDays ?? 90),
      history: options.history === false ? '0' : '1',
    });
    if (options.withBuyBox) {
      params.set('buybox', '1');
    }

    const response = await this.request(`${KEEPA_API_BASE_URL}/product?${params.toString()}`);
    this.tokens.spend(response.tokensConsumed ?? cost);
    return response;
  }

  /** Category lookup. Costs 1 token per documented category request. */
  async getCategoryLookup(categoryId: number, domain = KEEPA_DOMAIN_INDIA): Promise<KeepaResponse> {
    const key = this.requireKey();
    const params = new URLSearchParams({ key, domain: String(domain), category: String(categoryId) });
    return this.request(`${KEEPA_API_BASE_URL}/category?${params.toString()}`);
  }

  /** GET with timeout, exponential backoff on transient failures, and token-state capture. */
  private async request(url: string): Promise<KeepaResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) {
        // Exponential backoff with jitter, so parallel workers do not retry in lockstep.
        const backoff = this.baseBackoffMs * 2 ** (attempt - 1);
        const jitter = Math.floor(Math.random() * (this.baseBackoffMs / 2));
        await this.sleep(backoff + jitter);
        this.logger.warn(`Keepa retry ${attempt}/${this.maxRetries} after ${backoff + jitter}ms`);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const httpResponse = await this.fetchImpl(url, { signal: controller.signal });

        if (TRANSIENT_STATUS.has(httpResponse.status)) {
          lastError = new Error(`Keepa returned transient HTTP ${httpResponse.status}`);
          continue;
        }
        if (!httpResponse.ok) {
          // Non-transient (401 bad key, 400 bad request): retrying cannot help.
          throw new Error(`Keepa returned HTTP ${httpResponse.status}`);
        }

        const body = (await httpResponse.json()) as KeepaResponse;
        this.captureTokenState(body);

        if (body.error) {
          throw new Error(`Keepa API error: ${body.error.type ?? 'unknown'} — ${body.error.message ?? ''}`);
        }
        return body;
      } catch (error) {
        const failure = error as Error;
        if (failure.name === 'AbortError') {
          lastError = new Error(`Keepa request timed out after ${this.timeoutMs}ms`);
          continue;
        }
        if (lastError && failure.message.startsWith('Keepa returned transient')) {
          continue;
        }
        throw failure;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new Error('Keepa request failed after retries');
  }

  private captureTokenState(body: KeepaResponse): void {
    if (typeof body.tokensLeft === 'number' && typeof body.refillRate === 'number') {
      this.tokens.update({
        tokensLeft: body.tokensLeft,
        refillRate: body.refillRate,
        refillInMs: body.refillIn ?? 0,
        observedAt: new Date(),
      });
    }
  }
}
