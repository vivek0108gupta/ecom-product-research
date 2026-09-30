import { Injectable, Logger } from '@nestjs/common';
import { DataOrigin } from '../../common/interfaces/enums';
import { SourceRegistryService } from '../data-sources/source-registry.service';
import { RealDataImportService } from '../real-data-import/real-data-import.service';
import { ParsedRealRecord } from '../real-data-import/real-data.parser';
import { ImportReport, RecordRejection } from '../real-data-import/real-data.types';
import { KeepaProductSourceAdapter } from './keepa-product-source.adapter';
import { KeepaClient } from './keepa.client';
import { KeepaTokenBucket } from './keepa-token-bucket';
import { KEEPA_NOT_CONFIGURED } from './keepa.constants';
import { mapKeepaProduct } from './keepa.mapper';

/** Pilot default. Raise via MAX_PRODUCTS once a small run has proven itself. */
export const PILOT_DEFAULT_MAX_PRODUCTS = 10;

/** Hard ceiling for pilot mode. A pilot that can fetch hundreds is not a pilot. */
export const PILOT_HARD_MAX_PRODUCTS = 100;

export interface PilotPreflight {
  ready: boolean;
  apiKeyPresent: boolean;
  sourceEnabled: boolean;
  adapterRegistered: boolean;
  blockers: string[];
}

export interface PilotEstimate {
  productsRequested: number;
  maxProducts: number;
  estimatedTokens: number;
  tokensAvailable: number | null;
  refillRatePerMinute: number | null;
  estimatedSeconds: number | null;
  /** True when the run needs more tokens than a full bucket can ever hold at once. */
  exceedsBucketCapacity: boolean;
  notes: string[];
}

export interface PilotResult {
  /** False when the run stopped at the estimate because --confirm-cost was absent. */
  executed: boolean;
  preflight: PilotPreflight;
  estimate: PilotEstimate;
  collection: {
    productsRequested: number;
    productsReceived: number;
    productsRejected: number;
    duplicates: number;
    recordsMissingFields: number;
    tokensConsumed: number | null;
    tokensRemaining: number | null;
    elapsedMs: number;
    rejections: RecordRejection[];
    missingFieldDetail: Array<{ identifier: string | null; missing: string[] }>;
    importReport: ImportReport | null;
  } | null;
}

export interface PilotOptions {
  asins: string[];
  maxProducts?: number;
  /** Nothing reaches the network unless this is true. */
  confirmCost: boolean;
  category: string;
  withBuyBox?: boolean;
}

/**
 * Controlled pilot collection from Keepa.
 *
 * Two independent brakes, because the failure this guards against is spending real money
 * on a misconfigured run:
 *   1. preflight — key present, source enabled, adapter registered. All three, or nothing runs.
 *   2. --confirm-cost — without it the estimate is printed and the method returns before any
 *      request is constructed. This is checked before the client is touched at all.
 */
@Injectable()
export class KeepaPilotService {
  private readonly logger = new Logger(KeepaPilotService.name);

  constructor(
    private readonly adapter: KeepaProductSourceAdapter,
    private readonly client: KeepaClient,
    private readonly registry: SourceRegistryService,
    private readonly importService: RealDataImportService,
  ) {}

  /** All three conditions must hold. Reports every blocker, not just the first. */
  preflight(): PilotPreflight {
    const blockers: string[] = [];

    const apiKeyPresent = this.client.isConfigured();
    if (!apiKeyPresent) {
      blockers.push(`${KEEPA_NOT_CONFIGURED}: KEEPA_API_KEY is not set`);
    }

    const source = this.registry.getSource('keepa');
    const sourceEnabled = source?.enabled === true;
    if (!sourceEnabled) {
      blockers.push("the 'keepa' source is not enabled in config/data-sources.json");
    }

    const adapterRegistered = source?.adapterImplemented === true;
    if (!adapterRegistered) {
      blockers.push(
        "the Keepa adapter is not registered: add 'KeepaProductSourceAdapter' to implementedAdapters in source-registry.service.ts",
      );
    }

    return { ready: blockers.length === 0, apiKeyPresent, sourceEnabled, adapterRegistered, blockers };
  }

  /** Resolves the effective cap: explicit flag, else MAX_PRODUCTS, else the default; capped hard. */
  resolveMaxProducts(explicit?: number): { maxProducts: number; notes: string[] } {
    const notes: string[] = [];
    const fromEnv = Number.parseInt(process.env.MAX_PRODUCTS ?? '', 10);

    let value = PILOT_DEFAULT_MAX_PRODUCTS;
    if (explicit !== undefined && Number.isFinite(explicit)) {
      value = explicit;
    } else if (Number.isFinite(fromEnv)) {
      value = fromEnv;
      notes.push(`MAX_PRODUCTS=${fromEnv} from the environment`);
    }

    if (value < 1) {
      notes.push(`requested ${value}, raised to 1`);
      value = 1;
    }
    if (value > PILOT_HARD_MAX_PRODUCTS) {
      notes.push(`requested ${value}, capped at the pilot hard limit of ${PILOT_HARD_MAX_PRODUCTS}`);
      value = PILOT_HARD_MAX_PRODUCTS;
    }

    return { maxProducts: value, notes };
  }

  /** Cost projection. Pure arithmetic against the documented token model — no I/O. */
  estimate(productCount: number, maxProducts: number, withBuyBox: boolean, extraNotes: string[] = []): PilotEstimate {
    const estimatedTokens = KeepaTokenBucket.estimateProductCost(productCount, { withBuyBox });
    const snapshot = this.client.tokens.snapshot();
    const tokensAvailable = snapshot.projected;
    const refillRate = snapshot.refillRatePerMinute;

    const notes = [...extraNotes];
    let estimatedSeconds: number | null = null;
    let exceedsBucketCapacity = false;

    if (refillRate !== null && refillRate > 0) {
      const bucketCapacity = refillRate * 60;
      exceedsBucketCapacity = estimatedTokens > bucketCapacity;
      const shortfall = Math.max(0, estimatedTokens - (tokensAvailable ?? 0));
      estimatedSeconds = Math.ceil((shortfall / refillRate) * 60) + Math.ceil(productCount / 100) * 2;
      if (exceedsBucketCapacity) {
        notes.push(
          `this run needs ${estimatedTokens} tokens but a full bucket holds only ${bucketCapacity} ` +
            '(refill rate x 60, since tokens expire after an hour); it will have to wait for refills mid-run',
        );
      }
    } else {
      notes.push('token availability is unknown until the first response; the estimate assumes a cold bucket');
    }

    if (withBuyBox) {
      notes.push('Buy Box data adds 2 tokens per product');
    }

    return {
      productsRequested: productCount,
      maxProducts,
      estimatedTokens,
      tokensAvailable,
      refillRatePerMinute: refillRate,
      estimatedSeconds,
      exceedsBucketCapacity,
      notes,
    };
  }

  /**
   * Runs the pilot. Without `confirmCost` this returns after the estimate and makes no
   * request — the check happens before any ASIN is sent anywhere.
   */
  async run(options: PilotOptions): Promise<PilotResult> {
    const preflight = this.preflight();
    const { maxProducts, notes } = this.resolveMaxProducts(options.maxProducts);
    const withBuyBox = options.withBuyBox ?? true;

    const selected = options.asins.slice(0, maxProducts);
    if (options.asins.length > maxProducts) {
      notes.push(`${options.asins.length} ASINs supplied, trimmed to the cap of ${maxProducts}`);
    }

    // The estimate is built for the cap when no ASINs were supplied, so a bare
    // `research:keepa:pilot` still shows what a full pilot would cost.
    const estimate = this.estimate(selected.length > 0 ? selected.length : maxProducts, maxProducts, withBuyBox, notes);

    if (!options.confirmCost) {
      return { executed: false, preflight, estimate, collection: null };
    }
    if (!preflight.ready) {
      return { executed: false, preflight, estimate, collection: null };
    }
    if (selected.length === 0) {
      return {
        executed: false,
        preflight,
        estimate: { ...estimate, notes: [...estimate.notes, 'no ASINs supplied: pass --asins=... or --asin-file=...'] },
        collection: null,
      };
    }

    const startedAt = Date.now();
    const response = await this.client.getProducts(selected, { withBuyBox });
    const collectedAt = new Date();

    const rejections: RecordRejection[] = [];
    const records: ParsedRealRecord[] = [];

    (response.products ?? []).forEach((raw, index) => {
      const mapped = mapKeepaProduct(raw, { collectedAt, category: options.category });

      if (mapped.unusableReasons.length > 0) {
        rejections.push({
          record: index + 1,
          identifier: raw.asin ?? null,
          code: 'INVALID_VALUE',
          errors: mapped.unusableReasons,
        });
        return;
      }

      records.push({
        record: index + 1,
        product: mapped.product,
        // Only OBSERVED values go into the provenance ledger; calculated figures are
        // reproducible from them and must not masquerade as things Keepa reported.
        observations: mapped.fields
          .filter((field) => field.origin === DataOrigin.OBSERVED && field.value !== null)
          .map((field) => ({
            fieldName: field.field,
            rawValue: String(field.value),
            numericValue: typeof field.value === 'number' ? field.value : null,
          })),
        // Never request VERIFIED. Collection is not verification.
        verificationRequested: false,
      });
    });

    const run = await this.importService.startRun();
    const importReport = await this.importService.ingestRecords(run, records, rejections, 'json');
    const elapsedMs = Date.now() - startedAt;

    const snapshot = this.client.tokens.snapshot();
    this.logger.log(
      `Keepa pilot: requested ${selected.length}, received ${response.products?.length ?? 0}, ` +
        `imported ${importReport.imported}, ${response.tokensConsumed ?? '?'} tokens consumed`,
    );

    return {
      executed: true,
      preflight,
      estimate,
      collection: {
        productsRequested: selected.length,
        productsReceived: response.products?.length ?? 0,
        productsRejected: importReport.rejected,
        duplicates: importReport.duplicatesInFile + importReport.duplicatesMergedIntoExisting,
        recordsMissingFields: importReport.recordsMissingCriticalFields.length,
        tokensConsumed: response.tokensConsumed ?? null,
        tokensRemaining: snapshot.tokensLeft,
        elapsedMs,
        rejections: importReport.rejections,
        missingFieldDetail: importReport.recordsMissingCriticalFields.map((entry) => ({
          identifier: entry.identifier,
          missing: entry.missing,
        })),
        importReport,
      },
    };
  }
}
