import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { DatasetStatus, ScoreStatus } from '../../common/interfaces/enums';
import { Product } from '../../database/entities/product.entity';
import { ProductScore } from '../../database/entities/product-score.entity';
import { ProfitabilityService } from '../profitability/profitability.service';
import { QueryProductsDto } from './dto/query-products.dto';

export interface RankedProductRow {
  rank: number;
  productId: string;
  name: string;
  url: string;
  marketplace: string;
  category: string;
  brand: string | null;
  sellingPrice: number | null;
  estimatedLandedCost: number | null;
  profitPerUnit: number | null;
  profitMarginPercentage: number | null;
  demandScore: number | null;
  competitionOpportunityScore: number | null;
  differentiationScore: number | null;
  shippingSimplicityScore: number | null;
  customerPainOpportunityScore: number | null;
  bundleExpansionScore: number | null;
  riskScore: number | null;
  riskReasons: string[];
  finalScore: number | null;
  classification: string | null;
  dataCompleteness: number | null;
  datasetStatus: DatasetStatus;
  scoreStatus: ScoreStatus | null;
  missingCriticalFields: string[];
  sourceName: string;
  sourceUrl: string;
  collectedAt: Date;
  computedAt: Date | null;
}

const SORTABLE: Record<string, string> = {
  finalScore: 'score.finalScore',
  profitMarginPercentage: 'score.profitMarginPercentage',
  demandScore: 'score.demandScore',
  riskScore: 'score.riskScore',
  sellingPrice: 'score.sellingPrice',
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductScore) private readonly scoreRepo: Repository<ProductScore>,
    private readonly profitability: ProfitabilityService,
  ) {}

  /** The ranked list. Products without a computed score sort last, never silently dropped. */
  async findRanked(query: QueryProductsDto): Promise<{ total: number; rows: RankedProductRow[] }> {
    const qb = this.baseQuery(query);

    const sortColumn = SORTABLE[query.sortBy ?? 'finalScore'] ?? SORTABLE.finalScore;
    const direction = query.sortDirection === 'ASC' ? 'ASC' : 'DESC';

    const total = await qb.getCount();

    const products = await qb
      .orderBy(sortColumn, direction, 'NULLS LAST')
      .addOrderBy('product.name', 'ASC')
      .skip(query.offset ?? 0)
      .take(query.limit ?? 50)
      .getMany();

    const offset = query.offset ?? 0;
    const rows = products.map((product, index) => this.toRankedRow(product, offset + index + 1));
    return { total, rows };
  }

  /** Full detail for one product, including the evidence behind every score. */
  async findOneDetailed(id: string) {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: { prices: true, metrics: true, costs: true, painPoints: true, score: true, marketplace: true, dataSource: true },
    });

    if (!product) {
      throw new NotFoundException(`No product with id ${id}`);
    }

    const sortByCollected = <T extends { collectedAt: Date }>(rows: T[]): T[] =>
      [...rows].sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());

    const prices = sortByCollected(product.prices ?? []);
    const metrics = sortByCollected(product.metrics ?? []);
    const costs = sortByCollected(product.costs ?? []);

    const profitability = prices[0]
      ? await this.profitability.calculateForProduct({
          marketplaceId: product.marketplaceId,
          category: product.category,
          sellingPrice: prices[0].sellingPrice,
          cost: costs[0] ?? null,
        })
      : null;

    return {
      product: {
        id: product.id,
        name: product.name,
        url: product.url,
        externalId: product.externalId,
        brand: product.brand,
        category: product.category,
        subcategory: product.subcategory,
        description: product.description,
        features: product.features,
        variants: product.variants,
        sizes: product.sizes,
        colors: product.colors,
        imageUrls: product.imageUrls,
        weightKg: product.weightKg,
        dimensions: product.dimensions,
        fragile: product.fragile,
        returnRisk: product.returnRisk,
        regulatoryComplexity: product.regulatoryComplexity,
        brandIpRisk: product.brandIpRisk,
        seasonalDemand: product.seasonalDemand,
        establishedBrandDominance: product.establishedBrandDominance,
        marketplace: product.marketplace,
        datasetStatus: product.datasetStatus,
        verificationNotes: product.verificationNotes,
        confidenceScore: product.confidenceScore,
      },
      provenance: {
        source: product.dataSource?.name ?? null,
        sourceUrl: product.sourceUrl,
        collectedAt: product.collectedAt,
        dataSourceType: product.dataSource?.type ?? null,
        complianceNotes: product.dataSource?.complianceNotes ?? null,
      },
      priceHistory: prices,
      metricsHistory: metrics,
      costHistory: costs,
      painPoints: product.painPoints ?? [],
      profitability,
      score: product.score ?? null,
      dataSources: this.collectDataSources(product, prices, metrics, costs),
    };
  }

  /**
   * Requirement 13/14: every externally sourced value on a product, with where it came
   * from, when, and how much it is trusted. Built from the actual stored rows, so it can
   * never claim a source for a value that does not have one.
   */
  private collectDataSources(
    product: Product,
    prices: Array<{ sourceName: string; sourceUrl: string; collectedAt: Date; confidenceScore: number | null; sellingPrice: number }>,
    metrics: Array<{ sourceName: string; sourceUrl: string; collectedAt: Date; confidenceScore: number | null }>,
    costs: Array<{ sourceName: string; sourceUrl: string | null; collectedAt: Date; confidenceScore: number | null }>,
  ) {
    const entries: Array<{
      field: string;
      sourceName: string;
      sourceUrl: string | null;
      collectedAt: Date;
      confidenceScore: number | null;
      datasetStatus: DatasetStatus;
    }> = [];

    const push = (
      field: string,
      row: { sourceName: string; sourceUrl: string | null; collectedAt: Date; confidenceScore: number | null } | undefined,
    ) => {
      if (row) {
        entries.push({
          field,
          sourceName: row.sourceName,
          sourceUrl: row.sourceUrl,
          collectedAt: row.collectedAt,
          confidenceScore: row.confidenceScore,
          datasetStatus: product.datasetStatus,
        });
      }
    };

    push('Product record', {
      sourceName: product.sourceName,
      sourceUrl: product.sourceUrl,
      collectedAt: product.collectedAt,
      confidenceScore: product.confidenceScore,
    });
    push('Selling price / MRP', prices[0]);
    push('Demand & competition signals', metrics[0]);
    push('Cost inputs', costs[0]);

    const painPoint = (product.painPoints ?? [])[0];
    push('Review observations', painPoint);

    return entries;
  }

  /** Rows for export/analytics — same filters, no pagination. */
  async findAllForExport(query: QueryProductsDto): Promise<RankedProductRow[]> {
    const products = await this.baseQuery(query).orderBy('score.finalScore', 'DESC', 'NULLS LAST').getMany();
    return products.map((product, index) => this.toRankedRow(product, index + 1));
  }

  private baseQuery(query: QueryProductsDto): SelectQueryBuilder<Product> {
    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.score', 'score')
      .leftJoinAndSelect('product.marketplace', 'marketplace')
      .leftJoinAndSelect('product.dataSource', 'dataSource');

    if (query.category?.length) {
      qb.andWhere('product.category IN (:...categories)', { categories: query.category });
    }
    if (query.marketplace?.length) {
      qb.andWhere('marketplace.slug IN (:...marketplaces)', { marketplaces: query.marketplace });
    }
    if (query.priceMin !== undefined) {
      qb.andWhere('score.sellingPrice >= :priceMin', { priceMin: query.priceMin });
    }
    if (query.priceMax !== undefined) {
      qb.andWhere('score.sellingPrice <= :priceMax', { priceMax: query.priceMax });
    }
    if (query.marginMin !== undefined) {
      qb.andWhere('score.profitMarginPercentage >= :marginMin', { marginMin: query.marginMin });
    }
    if (query.demandMin !== undefined) {
      qb.andWhere('score.demandScore >= :demandMin', { demandMin: query.demandMin });
    }
    if (query.competitionOpportunityMin !== undefined) {
      qb.andWhere('score.competitionOpportunityScore >= :competitionMin', { competitionMin: query.competitionOpportunityMin });
    }
    if (query.differentiationMin !== undefined) {
      qb.andWhere('score.differentiationScore >= :differentiationMin', { differentiationMin: query.differentiationMin });
    }
    if (query.riskMax !== undefined) {
      qb.andWhere('score.riskScore <= :riskMax', { riskMax: query.riskMax });
    }
    if (query.scoreMin !== undefined) {
      qb.andWhere('score.finalScore >= :scoreMin', { scoreMin: query.scoreMin });
    }
    if (query.classification) {
      qb.andWhere('score.classification = :classification', { classification: query.classification });
    }
    if (query.search) {
      qb.andWhere('(product.name ILIKE :search OR product.brand ILIKE :search)', { search: `%${query.search}%` });
    }
    if (query.datasetStatus?.length) {
      qb.andWhere('product.datasetStatus IN (:...datasetStatus)', { datasetStatus: query.datasetStatus });
    }
    if (query.excludeSampleData) {
      qb.andWhere('product.datasetStatus != :sampleStatus', { sampleStatus: DatasetStatus.SAMPLE });
    }
    if (query.scoreStatus) {
      qb.andWhere('score.scoreStatus = :scoreStatus', { scoreStatus: query.scoreStatus });
    }
    // "Verified opportunities": real (non-SAMPLE) data that also cleared the critical-field check.
    if (query.verifiedOnly) {
      qb.andWhere('product.datasetStatus != :sampleOnly', { sampleOnly: DatasetStatus.SAMPLE });
      qb.andWhere('score.scoreStatus = :completeOnly', { completeOnly: ScoreStatus.COMPLETE });
      qb.andWhere('score.finalScore IS NOT NULL');
    }

    return qb;
  }

  private toRankedRow(product: Product, rank: number): RankedProductRow {
    const score = product.score;
    return {
      rank,
      productId: product.id,
      name: product.name,
      url: product.url,
      marketplace: product.marketplace?.name ?? product.marketplaceId,
      category: product.category,
      brand: product.brand,
      sellingPrice: score?.sellingPrice ?? null,
      estimatedLandedCost: score?.estimatedLandedCost ?? null,
      profitPerUnit: score?.profitPerUnit ?? null,
      profitMarginPercentage: score?.profitMarginPercentage ?? null,
      demandScore: score?.demandScore ?? null,
      competitionOpportunityScore: score?.competitionOpportunityScore ?? null,
      differentiationScore: score?.differentiationScore ?? null,
      shippingSimplicityScore: score?.shippingSimplicityScore ?? null,
      customerPainOpportunityScore: score?.customerPainOpportunityScore ?? null,
      bundleExpansionScore: score?.bundleExpansionScore ?? null,
      riskScore: score?.riskScore ?? null,
      riskReasons: score?.riskReasons ?? [],
      finalScore: score?.finalScore ?? null,
      classification: score?.classification ?? null,
      dataCompleteness: score?.dataCompleteness ?? null,
      datasetStatus: product.datasetStatus,
      scoreStatus: score?.scoreStatus ?? null,
      missingCriticalFields: score?.missingCriticalFields ?? [],
      sourceName: product.sourceName ?? product.dataSource?.name ?? 'unknown',
      sourceUrl: product.sourceUrl,
      collectedAt: product.collectedAt,
      computedAt: score?.computedAt ?? null,
    };
  }
}
