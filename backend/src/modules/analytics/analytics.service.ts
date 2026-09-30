import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CRITICAL_FIELD_DESCRIPTIONS, CriticalField, DatasetStatus, PainPointType, ScoreStatus } from '../../common/interfaces/enums';
import { Product } from '../../database/entities/product.entity';
import { ProductScore } from '../../database/entities/product-score.entity';
import { QueryProductsDto } from '../products/dto/query-products.dto';
import { ProductsService } from '../products/products.service';

export interface OpportunityExplanation {
  rank: number;
  productId: string;
  productName: string;
  category: string;
  marketplace: string;
  currentPrice: number | null;
  estimatedSupplierCost: number | null;
  estimatedLandedCost: number | null;
  profitPerUnit: number | null;
  profitMarginPercentage: number | null;
  demandScore: number | null;
  competitionOpportunityScore: number | null;
  differentiationScore: number | null;
  riskScore: number | null;
  finalScore: number | null;
  classification: string | null;
  mainCustomerPainPoint: string | null;
  differentiationOpportunity: string | null;
  why: {
    demandEvidence: string;
    pricingEvidence: string;
    competitionEvidence: string;
    economicsEvidence: string;
    customerPainEvidence: string;
    differentiationEvidence: string;
    risks: string[];
  };
  suggestedValidationStep: string;
  dataSources: string[];
  dataFreshness: { collectedAt: Date; scoreComputedAt: Date | null };
  dataCompleteness: number | null;
  datasetStatus: DatasetStatus;
  scoreStatus: ScoreStatus | null;
  missingCriticalFields: string[];
  /** Non-negotiable caveat rendered next to the entry. Never empty for SAMPLE rows. */
  disclaimer: string;
}

const na = 'Data unavailable';
const inr = (value: number | null): string => (value === null ? na : `₹${value.toLocaleString('en-IN')}`);

/**
 * Requirement 4: a SAMPLE product must never be described as validated, profitable, best
 * or recommended. The wording is produced here rather than in the UI so that every
 * consumer — dashboard, API client, export — carries the same caveat.
 */
export function disclaimerFor(datasetStatus: DatasetStatus, scoreStatus: ScoreStatus | null): string {
  if (datasetStatus === DatasetStatus.SAMPLE) {
    return 'DEMO DATA — this row describes no real listing. It exists to exercise the pipeline and is not a validated, profitable or recommended product. Not market evidence.';
  }
  if (scoreStatus === ScoreStatus.INCOMPLETE) {
    return 'INCOMPLETE — critical inputs are missing, so no Final Score has been issued. Ranking below is by sub-scores only and must not be read as a recommendation.';
  }
  if (datasetStatus === DatasetStatus.UNVERIFIED) {
    return 'UNVERIFIED — researched but not independently re-checked. Confirm the listing and supplier quote before acting.';
  }
  return 'VERIFIED — inputs confirmed against the listing and a supplier quote. Still a ranking of opportunity, not a prediction of profit.';
}

export function validationStepFor(datasetStatus: DatasetStatus): string {
  if (datasetStatus === DatasetStatus.SAMPLE) {
    return 'No action: this is demo data. Import real researched data before drawing any conclusion.';
  }
  return 'Validate before scaling: confirm the supplier quote and sample quality, then run a small first order (20-30 units) and measure real sell-through, return rate and ad cost against these estimates. These scores rank opportunity from collected signals — they are not a prediction of profit.';
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductScore) private readonly scoreRepo: Repository<ProductScore>,
    private readonly products: ProductsService,
  ) {}

  /** Headline numbers for the dashboard. Averages are taken only over products that have the value. */
  async summary() {
    const totalProducts = await this.productRepo.count();
    const scores = await this.scoreRepo.find();

    const withFinal = scores.filter((score) => score.finalScore !== null);
    const withMargin = scores.filter((score) => score.profitMarginPercentage !== null);

    const average = (values: number[]): number | null =>
      values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;

    const categoryRows = await this.productRepo
      .createQueryBuilder('product')
      .leftJoin('product.score', 'score')
      .select('product.category', 'category')
      .addSelect('COUNT(*)', 'productCount')
      .addSelect('AVG(score.finalScore)', 'averageScore')
      .groupBy('product.category')
      .orderBy('AVG(score.finalScore)', 'DESC', 'NULLS LAST')
      .getRawMany<{ category: string; productCount: string; averageScore: string | null }>();

    const datasetStatusCounts = {
      SAMPLE: await this.productRepo.count({ where: { datasetStatus: DatasetStatus.SAMPLE } }),
      UNVERIFIED: await this.productRepo.count({ where: { datasetStatus: DatasetStatus.UNVERIFIED } }),
      VERIFIED: await this.productRepo.count({ where: { datasetStatus: DatasetStatus.VERIFIED } }),
    };

    return {
      totalProductsAnalyzed: totalProducts,
      productsScored: withFinal.length,
      productsUnscored: totalProducts - withFinal.length,
      productsAboveScore70: withFinal.filter((score) => score.finalScore! > 70).length,
      averageMarginPercentage: average(withMargin.map((score) => score.profitMarginPercentage!)),
      marginDataCoverage: totalProducts === 0 ? 0 : Math.round((withMargin.length / totalProducts) * 100) / 100,
      highRiskProducts: scores.filter((score) => (score.riskScore ?? 0) >= 60).length,
      classificationCounts: {
        A: scores.filter((score) => score.classification === 'A').length,
        B: scores.filter((score) => score.classification === 'B').length,
        C: scores.filter((score) => score.classification === 'C').length,
        unclassified: scores.filter((score) => score.classification === null).length,
      },
      averageDataCompleteness: average(scores.map((score) => score.dataCompleteness ?? 0)),
      topCategories: categoryRows.map((row) => ({
        category: row.category,
        productCount: Number.parseInt(row.productCount, 10),
        averageScore: row.averageScore === null ? null : Math.round(Number.parseFloat(row.averageScore) * 100) / 100,
      })),
      datasetStatusCounts,
      /**
       * REAL VERIFIED PRODUCTS: records that survived the verification gate — a real,
       * traceable source with genuine product, price, cost and demand/competition evidence.
       * Placeholder-sourced and seed data can never contribute to this number, so the
       * VERIFIED count *is* the real-verified count by construction.
       */
      realVerifiedProducts: datasetStatusCounts.VERIFIED,
      /** Records that claimed VERIFIED, failed the gate, and are stored as UNVERIFIED. */
      downgradedVerificationClaims: await this.productRepo
        .createQueryBuilder('product')
        .where('product."verificationNotes" IS NOT NULL')
        .getCount(),
      scoreStatusCounts: {
        COMPLETE: scores.filter((score) => score.scoreStatus === ScoreStatus.COMPLETE).length,
        INCOMPLETE: scores.filter((score) => score.scoreStatus === ScoreStatus.INCOMPLETE).length,
      },
      /** Products eligible for the Verified Opportunities view. */
      verifiedOpportunityCount: await this.countVerifiedOpportunities(),
    };
  }

  private countVerifiedOpportunities(): Promise<number> {
    return this.productRepo
      .createQueryBuilder('product')
      .innerJoin('product.score', 'score')
      .where('product.datasetStatus != :sample', { sample: DatasetStatus.SAMPLE })
      .andWhere('score.scoreStatus = :complete', { complete: ScoreStatus.COMPLETE })
      .andWhere('score.finalScore IS NOT NULL')
      .getCount();
  }

  /**
   * Verified Opportunities (requirement 19): only products backed by real data that also
   * cleared every critical-field check. This is the only view in the system whose entries
   * may be read as candidate opportunities — everything else carries a caveat.
   */
  async verifiedOpportunities(limit = 20, filters: QueryProductsDto = {}): Promise<OpportunityExplanation[]> {
    return this.topOpportunities(limit, { ...filters, verifiedOnly: true });
  }

  /**
   * The ranked opportunity list with a plain-language "why", assembled entirely from
   * stored values and the evidence recorded alongside each score. No model writes this —
   * every sentence is a restatement of a number or a researcher-recorded observation.
   *
   * Entries are NOT recommendations: each carries a `disclaimer` that states what the row
   * actually is, and SAMPLE rows say so in the strongest terms.
   */
  async topOpportunities(limit = 20, filters: QueryProductsDto = {}): Promise<OpportunityExplanation[]> {
    const { rows } = await this.products.findRanked({ ...filters, limit, offset: 0, sortBy: 'finalScore', sortDirection: 'DESC' });

    return Promise.all(
      rows.map(async (row) => {
        const detail = await this.products.findOneDetailed(row.productId);
        const complaints = detail.painPoints.filter((point) => point.type === PainPointType.COMPLAINT);
        const opportunities = detail.painPoints.filter((point) => point.type === PainPointType.OPPORTUNITY);
        const metrics = detail.metricsHistory[0] ?? null;
        const price = detail.priceHistory[0] ?? null;
        const cost = detail.costHistory[0] ?? null;

        const topComplaint = [...complaints].sort((a, b) => (b.mentionCount ?? 0) - (a.mentionCount ?? 0))[0] ?? null;

        return {
          rank: row.rank,
          productId: row.productId,
          productName: row.name,
          category: row.category,
          marketplace: row.marketplace,
          currentPrice: row.sellingPrice,
          estimatedSupplierCost: cost?.productCost ?? null,
          estimatedLandedCost: row.estimatedLandedCost,
          profitPerUnit: row.profitPerUnit,
          profitMarginPercentage: row.profitMarginPercentage,
          demandScore: row.demandScore,
          competitionOpportunityScore: row.competitionOpportunityScore,
          differentiationScore: row.differentiationScore,
          riskScore: row.riskScore,
          finalScore: row.finalScore,
          classification: row.classification,
          mainCustomerPainPoint: topComplaint?.theme ?? null,
          differentiationOpportunity: opportunities[0]?.theme ?? null,
          why: {
            demandEvidence:
              metrics && metrics.reviewCount !== null && metrics.averageRating !== null
                ? `${metrics.reviewCount.toLocaleString('en-IN')} reviews at ${metrics.averageRating}/5 on ${row.marketplace} (review count is an indirect popularity signal, not a sales figure).`
                : na,
            pricingEvidence: price
              ? `Listed at ${inr(price.sellingPrice)}${price.mrp ? ` against an MRP of ${inr(price.mrp)}` : ''}${price.discountPercentage ? ` (${price.discountPercentage}% off)` : ''}.`
              : na,
            competitionEvidence:
              metrics?.competitorCount !== null && metrics?.competitorCount !== undefined
                ? `${metrics.competitorCount} comparable listings counted${metrics.searchTerm ? ` for "${metrics.searchTerm}"` : ''}; competition opportunity scores ${row.competitionOpportunityScore ?? na}/100 (100 = least contested).`
                : na,
            economicsEvidence: detail.profitability?.isReliable
              ? `${inr(row.sellingPrice)} selling price less ${inr(detail.profitability.totalCost)} total cost leaves ${inr(row.profitPerUnit)} per unit (${row.profitMarginPercentage}% margin). ${detail.profitability.reliabilityNotes.join(' ')}`
              : `${na} — no supplier cost on record, so no profit figure is claimed.`,
            customerPainEvidence:
              complaints.length > 0
                ? `${complaints.length} recurring complaint theme(s) recorded from listing reviews: ${complaints.map((point) => point.theme).join(', ')}.`
                : detail.painPoints.length > 0
                  ? 'Reviews were read and no recurring complaint theme was recorded.'
                  : na,
            differentiationEvidence:
              opportunities.length > 0
                ? `Recorded opportunities: ${opportunities.map((point) => point.theme).join(', ')}.`
                : na,
            risks: row.riskReasons.length > 0 ? row.riskReasons : ['No risk penalties triggered by the data on file.'],
          },
          suggestedValidationStep: validationStepFor(row.datasetStatus),
          dataSources: [...new Set([row.sourceName, ...detail.painPoints.map((point) => point.sourceName)])],
          dataFreshness: { collectedAt: row.collectedAt, scoreComputedAt: row.computedAt },
          dataCompleteness: row.dataCompleteness,
          datasetStatus: row.datasetStatus,
          scoreStatus: row.scoreStatus,
          missingCriticalFields: (row.missingCriticalFields as CriticalField[]).map(
            (field) => CRITICAL_FIELD_DESCRIPTIONS[field] ?? field,
          ),
          disclaimer: disclaimerFor(row.datasetStatus, row.scoreStatus),
        };
      }),
    );
  }
}
