import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DataSourceType, RunStatus } from '../../common/interfaces/enums';
import { NormalizedProduct } from '../../common/interfaces/normalized-product.interface';
import { DataSourceRecord } from '../../database/entities/data-source.entity';
import { Marketplace } from '../../database/entities/marketplace.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductCost } from '../../database/entities/product-cost.entity';
import { ProductMetrics } from '../../database/entities/product-metrics.entity';
import { ProductPainPoint } from '../../database/entities/product-pain-point.entity';
import { ProductPrice } from '../../database/entities/product-price.entity';
import { ScrapeRun } from '../../database/entities/scrape-run.entity';
import { ValidationService } from './validation.service';
import { assessVerification } from './verification';

export interface IngestionSummary {
  runId: string;
  received: number;
  created: number;
  updated: number;
  skippedDuplicate: number;
  rejected: number;
  rejections: Array<{ row: number; identifier: string | null; errors: string[] }>;
  /** Rows that claimed VERIFIED but could not support it and were stored as UNVERIFIED. */
  verificationDowngrades: Array<{ row: number; identifier: string | null; reasons: string[] }>;
}

/**
 * Within-batch identity key, matching the DB-level dedup order:
 * marketplace + externalId, else marketplace + normalized url.
 * (The normalized-name key is applied as a lookup in findExisting, not here, because a
 * name collision needs to be checked against what is already stored, not just this file.)
 */
export const identityKey = (marketplaceSlug: string, externalId: string | null, url: string): string =>
  externalId ? `${marketplaceSlug}::id::${externalId}` : `${marketplaceSlug}::url::${url}`;

/** Third dedup key: marketplace + aggressively normalized product name. */
export const nameKey = (marketplaceSlug: string, normalizedName: string): string =>
  `${marketplaceSlug}::name::${normalizedName}`;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly validation: ValidationService,
    @InjectRepository(Marketplace) private readonly marketplaceRepo: Repository<Marketplace>,
    @InjectRepository(DataSourceRecord) private readonly sourceRepo: Repository<DataSourceRecord>,
    @InjectRepository(ScrapeRun) private readonly runRepo: Repository<ScrapeRun>,
  ) {}

  async startRun(sourceName: string): Promise<ScrapeRun> {
    const source = await this.resolveSource(sourceName);
    if (!source.enabled) {
      throw new Error(`Data source '${sourceName}' is disabled. Enable it in data_sources before ingesting.`);
    }
    return this.runRepo.save(this.runRepo.create({ dataSourceId: source.id, status: RunStatus.PENDING }));
  }

  async markRunning(runId: string): Promise<ScrapeRun> {
    const run = await this.runRepo.findOneOrFail({ where: { id: runId } });
    run.status = RunStatus.RUNNING;
    run.startedAt = new Date();
    return this.runRepo.save(run);
  }

  getRun(runId: string): Promise<ScrapeRun | null> {
    return this.runRepo.findOne({ where: { id: runId } });
  }

  /**
   * Persists normalized products inside one transaction.
   *
   * Incremental by design: an existing product is updated in place and only gains a new
   * price/metrics observation when the observed values actually differ from the newest
   * ones on file, so re-importing an unchanged file does not inflate history.
   */
  async ingest(
    run: ScrapeRun,
    products: NormalizedProduct[],
    preRejected: Array<{ row: number; identifier: string | null; errors: string[] }> = [],
  ): Promise<IngestionSummary> {
    const rejections = [...preRejected];
    const verificationDowngrades: IngestionSummary['verificationDowngrades'] = [];
    const seenInBatch = new Set<string>();
    let created = 0;
    let updated = 0;
    let skippedDuplicate = 0;

    await this.dataSource.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const priceRepo = manager.getRepository(ProductPrice);
      const metricsRepo = manager.getRepository(ProductMetrics);
      const costRepo = manager.getRepository(ProductCost);
      const painPointRepo = manager.getRepository(ProductPainPoint);

      for (const [index, normalized] of products.entries()) {
        const rowNumber = index + 2;
        const result = this.validation.validate(normalized);

        if (!result.valid) {
          rejections.push({ row: rowNumber, identifier: normalized.name ?? normalized.url, errors: result.errors });
          continue;
        }
        if (result.warnings.length > 0) {
          this.logger.warn(`Row ${rowNumber} (${normalized.name}): ${result.warnings.join('; ')}`);
        }

        const marketplace = await manager.getRepository(Marketplace).findOne({ where: { slug: normalized.marketplaceSlug } });
        if (!marketplace) {
          rejections.push({
            row: rowNumber,
            identifier: normalized.name,
            errors: [`unknown marketplace '${normalized.marketplaceSlug}' — add it to the marketplaces table first`],
          });
          continue;
        }

        // A row is a within-batch duplicate if it collides on either the id/url key or the
        // name key, so one file listing the same product twice under different URLs collapses.
        const key = identityKey(normalized.marketplaceSlug, normalized.externalId, normalized.url);
        const byName = nameKey(normalized.marketplaceSlug, normalized.normalizedName);
        if (seenInBatch.has(key) || seenInBatch.has(byName)) {
          skippedDuplicate += 1;
          continue;
        }
        seenInBatch.add(key);
        seenInBatch.add(byName);

        // Central verification gate: a VERIFIED claim only survives if the record can
        // actually be re-checked. Applied here, not in the adapter, so no data source can
        // assert VERIFIED on its own say-so.
        const verification = assessVerification(normalized);
        if (verification.downgraded) {
          verificationDowngrades.push({ row: rowNumber, identifier: normalized.name, reasons: verification.reasons });
          this.logger.warn(
            `Row ${rowNumber} (${normalized.name}): VERIFIED claim refused, stored as UNVERIFIED — ${verification.reasons.join('; ')}`,
          );
        }

        const existing = await this.findExisting(productRepo, marketplace.id, normalized);
        const product = existing ?? productRepo.create();
        const isNew = !existing;

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
          const latestMetrics = await metricsRepo.findOne({ where: { productId: product.id }, order: { collectedAt: 'DESC' } });
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
          // Review observations are replaced wholesale per import so the set always
          // reflects the most recent read of the listing rather than accumulating duplicates.
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

        if (isNew) {
          created += 1;
        } else {
          updated += 1;
        }
      }
    });

    run.status = RunStatus.COMPLETED;
    run.recordsReceived = products.length + preRejected.length;
    run.recordsCreated = created;
    run.recordsUpdated = updated;
    run.recordsSkippedDuplicate = skippedDuplicate;
    run.recordsRejected = rejections.length;
    run.rejections = rejections;
    run.finishedAt = new Date();
    await this.runRepo.save(run);

    this.logger.log(
      `Run ${run.id}: ${created} created, ${updated} updated, ${skippedDuplicate} duplicates, ` +
        `${rejections.length} rejected, ${verificationDowngrades.length} VERIFIED claims downgraded`,
    );

    return {
      runId: run.id,
      received: run.recordsReceived,
      created,
      updated,
      skippedDuplicate,
      rejected: rejections.length,
      rejections,
      verificationDowngrades,
    };
  }

  async failRun(run: ScrapeRun, error: Error): Promise<void> {
    run.status = RunStatus.FAILED;
    run.errorMessage = error.message;
    run.finishedAt = new Date();
    await this.runRepo.save(run);
  }

  listRuns(limit = 25): Promise<ScrapeRun[]> {
    return this.runRepo.find({ order: { createdAt: 'DESC' }, take: limit });
  }

  /**
   * Duplicate detection, in descending order of confidence:
   *   1. marketplace + externalId   (a published ID is authoritative)
   *   2. marketplace + normalized URL
   *   3. marketplace + normalized name
   *
   * Name matching is deliberately last and scoped to a single marketplace: two sellers on
   * different marketplaces legitimately list the same product name, and those must stay
   * separate records so cross-marketplace price comparison still works.
   */
  private async findExisting(
    repo: Repository<Product>,
    marketplaceId: string,
    normalized: NormalizedProduct,
  ): Promise<Product | null> {
    if (normalized.externalId) {
      const byExternalId = await repo.findOne({ where: { marketplaceId, externalId: normalized.externalId } });
      if (byExternalId) {
        return byExternalId;
      }
    }

    const byUrl = await repo.findOne({ where: { marketplaceId, url: normalized.url } });
    if (byUrl) {
      return byUrl;
    }

    return repo.findOne({ where: { marketplaceId, normalizedName: normalized.normalizedName } });
  }

  private async resolveSource(name: string): Promise<DataSourceRecord> {
    const existing = await this.sourceRepo.findOne({ where: { name } });
    if (existing) {
      return existing;
    }
    return this.sourceRepo.save(
      this.sourceRepo.create({
        name,
        type: DataSourceType.MANUAL,
        enabled: true,
        complianceNotes: 'Researcher-supplied data. No automated collection performed by this source.',
      }),
    );
  }
}
