import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { DataSourceType, DatasetStatus, RunStatus } from '../../common/interfaces/enums';
import { NormalizedProduct } from '../../common/interfaces/normalized-product.interface';
import { DataSourceRecord } from '../../database/entities/data-source.entity';
import { Marketplace } from '../../database/entities/marketplace.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductCost } from '../../database/entities/product-cost.entity';
import { ProductFieldObservation } from '../../database/entities/product-field-observation.entity';
import { ProductMetrics } from '../../database/entities/product-metrics.entity';
import { ProductPainPoint } from '../../database/entities/product-pain-point.entity';
import { ProductPrice } from '../../database/entities/product-price.entity';
import { ScrapeRun } from '../../database/entities/scrape-run.entity';
import { assessVerification } from '../scraping/verification';
import { identityKey, nameKey } from '../scraping/ingestion.service';
import { ParsedRealRecord, RealDataParser } from './real-data.parser';
import { RealDataValidator } from './real-data.validator';
import { ImportReport, MissingCriticalFieldReport, RecordRejection, RecordWarning } from './real-data.types';

/** The data source every real import is attributed to. Distinct from the seed source. */
export const REAL_DATA_SOURCE_NAME = 'real_data_import';

@Injectable()
export class RealDataImportService {
  private readonly logger = new Logger(RealDataImportService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly parser: RealDataParser,
    private readonly validator: RealDataValidator,
    @InjectRepository(DataSourceRecord) private readonly sourceRepo: Repository<DataSourceRecord>,
    @InjectRepository(ScrapeRun) private readonly runRepo: Repository<ScrapeRun>,
  ) {}

  async startRun(): Promise<ScrapeRun> {
    const source = await this.resolveSource();
    return this.runRepo.save(this.runRepo.create({ dataSourceId: source.id, status: RunStatus.PENDING }));
  }

  /**
   * Parses, validates and persists a real-data submission, returning the import report.
   *
   * Everything happens in one transaction: a submission either lands in full or not at
   * all, so a partial import can never leave the dataset in a state nobody reviewed.
   */
  async import(run: ScrapeRun, content: string, format: 'csv' | 'json'): Promise<ImportReport> {
    const { records, malformed } = this.parser.parse(content, format);
    return this.ingestRecords(run, records, malformed, format);
  }

  /**
   * Persists already-parsed records. Split out from import() so a source that produces
   * NormalizedProducts directly — the Keepa adapter, or any future API adapter — reuses
   * exactly this validation, deduplication, verification-gate and persistence path rather
   * than growing a parallel one that could drift.
   */
  async ingestRecords(
    run: ScrapeRun,
    records: ParsedRealRecord[],
    preRejected: RecordRejection[] = [],
    format: 'csv' | 'json' = 'json',
  ): Promise<ImportReport> {
    const startedAt = new Date();
    run.status = RunStatus.RUNNING;
    run.startedAt = startedAt;
    await this.runRepo.save(run);

    const rejections: RecordRejection[] = [...preRejected];
    const warnings: RecordWarning[] = [];
    const missingCritical: MissingCriticalFieldReport[] = [];
    const verificationDowngrades: ImportReport['verificationDowngrades'] = [];

    const accepted: ParsedRealRecord[] = [];
    for (const parsed of records) {
      const result = this.validator.validate(parsed);
      if (!result.accepted && result.rejection) {
        rejections.push(result.rejection);
        continue;
      }
      if (result.warnings.length > 0) {
        warnings.push({
          record: parsed.record,
          identifier: parsed.product.name,
          warnings: result.warnings,
        });
      }
      accepted.push(parsed);
    }

    let created = 0;
    let updated = 0;
    let duplicatesInFile = 0;
    let duplicatesMergedIntoExisting = 0;

    await this.dataSource.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const seenInFile = new Set<string>();

      for (const parsed of accepted) {
        const { product: normalized } = parsed;

        const marketplace = await manager
          .getRepository(Marketplace)
          .findOne({ where: { slug: normalized.marketplaceSlug } });

        if (!marketplace) {
          rejections.push({
            record: parsed.record,
            identifier: normalized.name,
            code: 'UNKNOWN_MARKETPLACE',
            errors: [`unknown marketplace '${normalized.marketplaceSlug}' — add it to the marketplaces table first`],
          });
          continue;
        }

        const key = identityKey(normalized.marketplaceSlug, normalized.externalId, normalized.url);
        const byName = nameKey(normalized.marketplaceSlug, normalized.normalizedName);
        if (seenInFile.has(key) || seenInFile.has(byName)) {
          duplicatesInFile += 1;
          rejections.push({
            record: parsed.record,
            identifier: normalized.name,
            code: 'DUPLICATE_IN_FILE',
            errors: ['another record in this submission already describes this product'],
          });
          continue;
        }
        seenInFile.add(key);
        seenInFile.add(byName);

        const existing = await this.findExistingRealProduct(productRepo, marketplace.id, normalized);
        const product = existing ?? productRepo.create();
        const isNew = !existing;
        if (existing) {
          duplicatesMergedIntoExisting += 1;
        }

        // The verification gate decides the final status. A request for VERIFIED that
        // fails is recorded, not honoured.
        const verification = assessVerification({
          ...normalized,
          datasetStatus: parsed.verificationRequested ? DatasetStatus.VERIFIED : DatasetStatus.UNVERIFIED,
        });
        if (verification.downgraded) {
          verificationDowngrades.push({
            record: parsed.record,
            identifier: normalized.name,
            reasons: verification.reasons,
          });
        }

        Object.assign(product, {
          name: normalized.name,
          normalizedName: normalized.normalizedName,
          url: normalized.url,
          marketplaceId: marketplace.id,
          externalId: normalized.externalId,
          brand: normalized.brand,
          category: normalized.category,
          subcategory: normalized.subcategory,
          description: normalized.description,
          features: normalized.features,
          variants: normalized.variants,
          sizes: normalized.sizes,
          colors: normalized.colors,
          imageUrls: normalized.imageUrls,
          weightKg: normalized.weightKg,
          dimensions: normalized.dimensions,
          fragile: normalized.fragile,
          returnRisk: normalized.returnRisk,
          regulatoryComplexity: normalized.regulatoryComplexity,
          brandIpRisk: normalized.brandIpRisk,
          seasonalDemand: normalized.seasonalDemand,
          establishedBrandDominance: normalized.establishedBrandDominance,
          bundlePotentialScore: normalized.bundlePotentialScore,
          dataSourceId: run.dataSourceId,
          sourceName: normalized.sourceName,
          sourceUrl: normalized.sourceUrl,
          collectedAt: normalized.collectedAt,
          confidenceScore: normalized.confidenceScore,
          datasetStatus: verification.datasetStatus,
          verificationNotes: verification.reasons.length > 0 ? verification.reasons : null,
        });

        await productRepo.save(product);
        await this.persistObservations(manager, product, parsed, run.id);

        const missing = this.missingCriticalFields(normalized);
        if (missing.length > 0) {
          missingCritical.push({ record: parsed.record, identifier: normalized.name, missing });
        }

        if (isNew) {
          created += 1;
        } else {
          updated += 1;
        }
      }
    });

    const finishedAt = new Date();
    run.status = RunStatus.COMPLETED;
    run.recordsReceived = records.length + preRejected.length;
    run.recordsCreated = created;
    run.recordsUpdated = updated;
    run.recordsSkippedDuplicate = duplicatesInFile;
    run.recordsRejected = rejections.length;
    run.rejections = rejections.map((rejection) => ({
      row: rejection.record,
      identifier: rejection.identifier,
      errors: [`[${rejection.code}] ${rejection.errors.join('; ')}`],
    }));
    run.finishedAt = finishedAt;
    await this.runRepo.save(run);

    const report: ImportReport = {
      runId: run.id,
      format,
      submitted: records.length + preRejected.length,
      imported: created + updated,
      created,
      updated,
      rejected: rejections.length,
      duplicatesInFile,
      duplicatesMergedIntoExisting,
      recordsMissingCriticalFields: missingCritical,
      rejections,
      warnings,
      verificationDowngrades,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };

    this.logger.log(
      `Real import ${run.id}: ${report.imported} imported (${created} new), ${report.rejected} rejected, ` +
        `${duplicatesInFile} in-file duplicates, ${verificationDowngrades.length} VERIFIED requests refused`,
    );

    return report;
  }

  async failRun(run: ScrapeRun, error: Error): Promise<void> {
    run.status = RunStatus.FAILED;
    run.errorMessage = error.message;
    run.finishedAt = new Date();
    await this.runRepo.save(run);
  }

  getRun(runId: string): Promise<ScrapeRun | null> {
    return this.runRepo.findOne({ where: { id: runId } });
  }

  /**
   * Deduplication scoped to real data only.
   *
   * This is the isolation boundary: a real record is never matched against a SAMPLE
   * product, so demo rows can never absorb real research (or be quietly overwritten by
   * it) just because they happen to share a name.
   */
  private findExistingRealProduct(
    repo: Repository<Product>,
    marketplaceId: string,
    normalized: NormalizedProduct,
  ): Promise<Product | null> {
    const notSample = Not(DatasetStatus.SAMPLE);

    if (normalized.externalId) {
      return repo
        .findOne({ where: { marketplaceId, externalId: normalized.externalId, datasetStatus: notSample } })
        .then((found) => found ?? this.findByUrlOrName(repo, marketplaceId, normalized));
    }
    return this.findByUrlOrName(repo, marketplaceId, normalized);
  }

  private async findByUrlOrName(
    repo: Repository<Product>,
    marketplaceId: string,
    normalized: NormalizedProduct,
  ): Promise<Product | null> {
    const notSample = Not(DatasetStatus.SAMPLE);

    const byUrl = await repo.findOne({ where: { marketplaceId, url: normalized.url, datasetStatus: notSample } });
    if (byUrl) {
      return byUrl;
    }
    return repo.findOne({
      where: { marketplaceId, normalizedName: normalized.normalizedName, datasetStatus: notSample },
    });
  }

  /** Writes the typed value rows plus the per-field provenance ledger. */
  private async persistObservations(
    manager: DataSource['manager'],
    product: Product,
    parsed: ParsedRealRecord,
    runId: string,
  ): Promise<void> {
    const normalized = parsed.product;
    const priceRepo = manager.getRepository(ProductPrice);
    const metricsRepo = manager.getRepository(ProductMetrics);
    const costRepo = manager.getRepository(ProductCost);
    const painPointRepo = manager.getRepository(ProductPainPoint);
    const observationRepo = manager.getRepository(ProductFieldObservation);

    const latestPrice = await priceRepo.findOne({ where: { productId: product.id }, order: { collectedAt: 'DESC' } });
    if (!latestPrice || latestPrice.sellingPrice !== normalized.sellingPrice || latestPrice.mrp !== normalized.mrp) {
      await priceRepo.save(
        priceRepo.create({
          productId: product.id,
          sellingPrice: normalized.sellingPrice,
          mrp: normalized.mrp,
          discountPercentage: normalized.discountPercentage,
          currency: normalized.currency,
          sourceName: normalized.sourceName,
          sourceUrl: normalized.sourceUrl,
          collectedAt: normalized.collectedAt,
          confidenceScore: normalized.confidenceScore,
        }),
      );
    }

    const hasMetrics =
      normalized.reviewCount !== null ||
      normalized.averageRating !== null ||
      normalized.competitorCount !== null ||
      normalized.sellerCount !== null ||
      normalized.bestSellerRank !== null;

    if (hasMetrics) {
      const latestMetrics = await metricsRepo.findOne({
        where: { productId: product.id },
        order: { collectedAt: 'DESC' },
      });
      const changed =
        !latestMetrics ||
        latestMetrics.reviewCount !== normalized.reviewCount ||
        latestMetrics.averageRating !== normalized.averageRating ||
        latestMetrics.competitorCount !== normalized.competitorCount;

      if (changed) {
        await metricsRepo.save(
          metricsRepo.create({
            productId: product.id,
            reviewCount: normalized.reviewCount,
            averageRating: normalized.averageRating,
            competitorCount: normalized.competitorCount,
            sellerCount: normalized.sellerCount,
            bestSellerRank: normalized.bestSellerRank,
            searchTerm: normalized.searchTerm,
            sourceName: normalized.sourceName,
            sourceUrl: normalized.sourceUrl,
            collectedAt: normalized.collectedAt,
            confidenceScore: normalized.confidenceScore,
          }),
        );
      }
    }

    if (normalized.costs) {
      await costRepo.save(
        costRepo.create({
          productId: product.id,
          productCost: normalized.costs.productCost,
          shippingCost: normalized.costs.shippingCost,
          packagingCost: normalized.costs.packagingCost,
          marketplaceFeeOverride: normalized.costs.marketplaceFeeOverride,
          paymentFee: normalized.costs.paymentFee,
          advertisingCost: normalized.costs.advertisingCost,
          returnAllowance: normalized.costs.returnAllowance,
          otherCosts: normalized.costs.otherCosts,
          sourceName: normalized.costs.sourceName,
          sourceUrl: normalized.costs.sourceUrl,
          effectiveDate: normalized.collectedAt.toISOString().slice(0, 10),
          collectedAt: normalized.collectedAt,
          confidenceScore: normalized.confidenceScore,
        }),
      );
    }

    if (normalized.painPoints.length > 0) {
      await painPointRepo.delete({ productId: product.id });
      await painPointRepo.save(
        normalized.painPoints.map((painPoint) =>
          painPointRepo.create({
            productId: product.id,
            type: painPoint.type,
            theme: painPoint.theme,
            detail: painPoint.detail,
            mentionCount: painPoint.mentionCount,
            sourceName: painPoint.sourceName,
            sourceUrl: painPoint.sourceUrl,
            collectedAt: normalized.collectedAt,
            confidenceScore: painPoint.confidenceScore,
          }),
        ),
      );
    }

    // Per-field provenance: every field the submitter actually supplied, with its source
    // and observation timestamp. Append-only, so re-imports build a history.
    await observationRepo.save(
      parsed.observations.map((observation) =>
        observationRepo.create({
          productId: product.id,
          fieldName: observation.fieldName,
          rawValue: observation.rawValue,
          numericValue: observation.numericValue,
          sourceName: normalized.sourceName,
          sourceUrl: normalized.sourceUrl,
          observedAt: normalized.collectedAt,
          confidenceScore: normalized.confidenceScore,
          importRunId: runId,
        }),
      ),
    );
  }

  /** Mirrors the scoring engine's critical-field rules, for the import report. */
  private missingCriticalFields(product: NormalizedProduct): string[] {
    const missing: string[] = [];
    if (product.costs?.productCost === null || product.costs === null) {
      missing.push('supplier_cost');
    }
    if (product.reviewCount === null || product.averageRating === null) {
      missing.push('demand_signal (rating + review_count)');
    }
    if (product.competitorCount === null) {
      missing.push('competition_signal');
    }
    return missing;
  }

  private async resolveSource(): Promise<DataSourceRecord> {
    const existing = await this.sourceRepo.findOne({ where: { name: REAL_DATA_SOURCE_NAME } });
    if (existing) {
      return existing;
    }
    return this.sourceRepo.save(
      this.sourceRepo.create({
        name: REAL_DATA_SOURCE_NAME,
        type: DataSourceType.MANUAL,
        enabled: true,
        complianceNotes:
          'Researcher-supplied data about real listings, collected by hand or exported from a permitted source. ' +
          'No automated collection is performed by this pipeline, and no access control is circumvented.',
      }),
    );
  }
}
