import { KEEPA_TOKEN_EXPIRY_MINUTES } from './keepa.constants';
import { KeepaTokenState } from './keepa.types';

export interface TokenBudgetDecision {
  allowed: boolean;
  /** Milliseconds to wait before the request can be afforded. 0 when allowed now. */
  waitMs: number;
  tokensLeft: number;
  reason: string;
}

/**
 * Client-side mirror of Keepa's documented token bucket.
 *
 * Keepa generates `refillRate` tokens every minute around the clock, unused tokens expire
 * after 60 minutes, and every response reports `tokensLeft` / `refillIn`. Tracking that
 * locally lets a caller decide *before* sending whether it can afford a request, rather
 * than discovering it by being throttled.
 *
 * The authoritative number is always whatever the last response said; local projection
 * only fills the gap between responses.
 */
export class KeepaTokenBucket {
  private tokensLeft: number | null = null;
  private refillRatePerMinute: number | null = null;
  private lastObservedAt: Date | null = null;

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Adopt the token state reported by a real response. This always wins over projection. */
  update(state: KeepaTokenState): void {
    this.tokensLeft = state.tokensLeft;
    this.refillRatePerMinute = state.refillRate;
    this.lastObservedAt = state.observedAt;
  }

  /**
   * Tokens available now: the last reported balance plus what has accrued since, capped at
   * the documented ceiling of rate x 60 (because tokens expire after an hour).
   */
  projectedTokens(): number | null {
    if (this.tokensLeft === null || this.refillRatePerMinute === null || this.lastObservedAt === null) {
      return null;
    }
    const minutesElapsed = (this.now().getTime() - this.lastObservedAt.getTime()) / 60_000;
    const accrued = Math.floor(Math.max(0, minutesElapsed) * this.refillRatePerMinute);
    const ceiling = this.refillRatePerMinute * KEEPA_TOKEN_EXPIRY_MINUTES;
    return Math.min(this.tokensLeft + accrued, ceiling);
  }

  /** Whether a request costing `cost` tokens can be afforded, and if not, how long to wait. */
  canAfford(cost: number): TokenBudgetDecision {
    const projected = this.projectedTokens();

    if (projected === null) {
      // Nothing observed yet. Allow one request so the first response can seed the state.
      return { allowed: true, waitMs: 0, tokensLeft: 0, reason: 'no token state observed yet; sending one request to seed it' };
    }

    if (projected >= cost) {
      return { allowed: true, waitMs: 0, tokensLeft: projected, reason: `${projected} tokens available, request costs ${cost}` };
    }

    const shortfall = cost - projected;
    const rate = this.refillRatePerMinute ?? 1;
    const waitMs = Math.ceil((shortfall / rate) * 60_000);

    return {
      allowed: false,
      waitMs,
      tokensLeft: projected,
      reason: `need ${cost} tokens, have ${projected}; refills at ${rate}/min so wait ~${Math.ceil(waitMs / 1000)}s`,
    };
  }

  /** Deduct locally after a request, until the response's own figure replaces it. */
  spend(cost: number): void {
    if (this.tokensLeft !== null) {
      this.tokensLeft = Math.max(this.tokensLeft - cost, -cost);
      this.lastObservedAt = this.now();
    }
  }

  snapshot(): { tokensLeft: number | null; refillRatePerMinute: number | null; lastObservedAt: Date | null; projected: number | null } {
    return {
      tokensLeft: this.tokensLeft,
      refillRatePerMinute: this.refillRatePerMinute,
      lastObservedAt: this.lastObservedAt,
      projected: this.projectedTokens(),
    };
  }

  /** Tokens needed for a plain product lookup of `asinCount` ASINs. */
  static estimateProductCost(asinCount: number, options: { withBuyBox?: boolean; offerPages?: number } = {}): number {
    const perAsin = 1 + (options.withBuyBox ? 2 : 0) + (options.offerPages ?? 0) * 6;
    return asinCount * perAsin;
  }
}
