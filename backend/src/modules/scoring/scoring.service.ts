import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PainPointType, ScoreStatus } from '../../common/interfaces/enums';
import { ConfigFilesService } from '../../config/config-files.service';
import { Product } from '../../database/entities/product.entity';
import { ProductScore } from '../../database/entities/product-score.entity';
import { ProfitabilityService } from '../profitability/profitability.service';
import { ProfitabilityResult } from '../profitability/profitability.types';
import {
  bundleExpansionScore,
  classify,
  competitionOpportunityScore,
  computeFinalScore,
  computeRiskScore,
  customerPainOpportunityScore,
  demandScore,
  differentiationScore,
  profitabilityScore,
  shippingSimplicityScore,
} from './scoring-functions';
import { assessDataQuality } from './data-quality';
import { CohortStats, ScoringInput, SubScores } from './scoring.types';

const latestBy = <T>(rows: T[] | undefined, field: keyof T): T | null => {
  if (!rows || rows.length === 0) {
    return null;
  }
  return [...rows].sort((a, b) => new Date(b[field] as unknown as string).getTime() - new Date(a[field] as unknown as string).getTime())[0];
};

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductScore) private readonly scoreRepo: Repository<ProductScore>,
    private readonly profitability: ProfitabilityService,
    private readonly configFiles: ConfigFilesService,
  ) {}

  /**
   * Recomputes scores for every product. Products are normalized against a cohort of
   * their own category (falling back to the whole dataset when a category has fewer
   * than 3 products, since a 1-2 product cohort carries no relative information).
   */
  async rescoreAll(): Promise<{ scored: number; incomplete: number }> {
    const products = await this.productRepo.find({
      relations: { prices: true, metrics: true, costs: true, painPoints: true },
    });

    const inputs = await Promise.all(products.map((product) => this.buildInput(product)));
    const cohorts = this.buildCohorts(inputs);

    let scored = 0;
    let incomplete = 0;

    for (const input of inputs) {
      const cohort = cohorts.get(input.category) ?? cohorts.get('__all__')!;
      const result = this.scoreOne(input, cohort);
      if (result.quality.scoreStatus === ScoreStatus.INCOMPLETE) {
        incomplete += 1;
      } else {
        scored += 1;
      }
      await this.persist(input, result);
    }

    this.logger.log(`Rescored ${scored} products; ${incomplete} INCOMPLETE (missing critical inputs, no final score issued)`);
    return { scored, incomplete };
  }

  private scoreOne(input: ScoringInput, cohort: CohortStats) {
    const config = this.configFiles.getScoringConfig();
    const quality = assessDataQuality(input);

    // Sub-scores are always computed — transparency is not withheld, only the headline number.
    const subScores: SubScores = {
      demand: demandScore(input, cohort, config),
      profitability: profitabilityScore(input, config),
      competitionOpportunity: competitionOpportunityScore(input, cohort, config),
      differentiation: differentiationScore(input, config),
      shippingSimplicity: shippingSimplicityScore(input, config),
      customerPainOpportunity: customerPainOpportunityScore(input, config),
      bundleExpansion: bundleExpansionScore(input, config),
    };

    const final = computeFinalScore(subScores, config, quality.scoreStatus);
    const risk = computeRiskScore(input, subScores, config);
    const classification = classify(final.value, risk.value, config);

    return { subScores, final, risk, classification, quality, finalScore: final.value, profitability: input.profitability };
  }

  private async persist(input: ScoringInput, result: ReturnType<ScoringService['scoreOne']>): Promise<void> {
    const { subScores, final, risk, classification, quality, profitability } = result;

    const existing = await this.scoreRepo.findOne({ where: { productId: input.productId } });
    const score = existing ?? this.scoreRepo.create({ productId: input.productId });

    score.demandScore = subScores.demand.value;
    score.profitabilityScore = subScores.profitability.value;
    score.competitionOpportunityScore = subScores.competitionOpportunity.value;
    score.differentiationScore = subScores.differentiation.value;
    score.shippingSimplicityScore = subScores.shippingSimplicity.value;
    score.customerPainOpportunityScore = subScores.customerPainOpportunity.value;
    score.bundleExpansionScore = subScores.bundleExpansion.value;
    score.finalScore = final.value;
    score.scoreStatus = quality.scoreStatus;
    score.missingCriticalFields = quality.missingCriticalFields;
    score.riskScore = risk.value;
    score.riskReasons = risk.reasons;
    score.classification = classification;
    score.sellingPrice = profitability?.sellingPrice ?? null;
    score.estimatedLandedCost = profitability?.estimatedLandedCost ?? null;
    score.profitPerUnit = profitability?.isReliable ? profitability.profitPerUnit : null;
    score.profitMarginPercentage = profitability?.isReliable ? profitability.profitMarginPercentage : null;
    score.roiPercentage = profitability?.isReliable ? profitability.roiPercentage : null;
    score.dataCompleteness = final.dataCompleteness;
    score.weightsSnapshot = this.configFiles.getScoringConfig().finalScoreWeights as unknown as Record<string, number>;
    score.scoreBreakdown = {
      subScores,
      effectiveWeights: final.effectiveWeights,
      contributions: final.contributions,
      risk: risk.evidence,
      profitability: profitability ?? null,
      dataQuality: quality,
    };
    score.computedAt = new Date();

    await this.scoreRepo.save(score);
  }

  private async buildInput(product: Product): Promise<ScoringInput> {
    const latestPrice = latestBy(product.prices, 'collectedAt');
    const latestMetrics = latestBy(product.metrics, 'collectedAt');
    const latestCost = latestBy(product.costs, 'collectedAt');

    let profit: ProfitabilityResult | null = null;
    if (latestPrice) {
      profit = await this.profitability.calculateForProduct({
        marketplaceId: product.marketplaceId,
        category: product.category,
        sellingPrice: latestPrice.sellingPrice,
        cost: latestCost,
      });
    }

    const painPoints = product.painPoints ?? [];

    return {
      productId: product.id,
      category: product.category,
      marketplaceId: product.marketplaceId,
      sellingPrice: latestPrice?.sellingPrice ?? null,
      productCost: latestCost?.productCost ?? null,
      sourceName: product.sourceName ?? null,
      sourceUrl: product.sourceUrl ?? null,
      collectedAt: product.collectedAt ?? null,
      weightKg: product.weightKg,
      dimensions: product.dimensions,
      fragile: product.fragile,
      returnRisk: product.returnRisk,
      regulatoryComplexity: product.regulatoryComplexity,
      brandIpRisk: product.brandIpRisk,
      seasonalDemand: product.seasonalDemand,
      establishedBrandDominance: product.establishedBrandDominance,
      bundlePotentialScore: product.bundlePotentialScore,
      reviewCount: latestMetrics?.reviewCount ?? null,
      averageRating: latestMetrics?.averageRating ?? null,
      competitorCount: latestMetrics?.competitorCount ?? null,
      painPointsCollected: painPoints.length > 0,
      complaintCount: painPoints.filter((point) => point.type === PainPointType.COMPLAINT).length,
      opportunityCount: painPoints.filter((point) => point.type === PainPointType.OPPORTUNITY).length,
      profitability: profit,
    };
  }

  /** Builds per-category normalization ranges, plus an '__all__' fallback cohort. */
  private buildCohorts(inputs: ScoringInput[]): Map<string, CohortStats> {
    const cohorts = new Map<string, CohortStats>();
    const byCategory = new Map<string, ScoringInput[]>();

    for (const input of inputs) {
      const bucket = byCategory.get(input.category) ?? [];
      bucket.push(input);
      byCategory.set(input.category, bucket);
    }

    cohorts.set('__all__', statsFor(inputs, 'all products'));

    for (const [category, members] of byCategory) {
      cohorts.set(category, members.length >= 3 ? statsFor(members, `category:${category}`) : statsFor(inputs, 'all products (category cohort too small)'));
    }

    return cohorts;
  }
}

function statsFor(inputs: ScoringInput[], label: string): CohortStats {
  const logReviews = inputs.filter((i) => i.reviewCount !== null).map((i) => Math.log(i.reviewCount! + 1));
  const competitors = inputs.filter((i) => i.competitorCount !== null).map((i) => i.competitorCount!);

  return {
    logReviewsMin: logReviews.length ? Math.min(...logReviews) : Number.NaN,
    logReviewsMax: logReviews.length ? Math.max(...logReviews) : Number.NaN,
    competitorMin: competitors.length ? Math.min(...competitors) : Number.NaN,
    competitorMax: competitors.length ? Math.max(...competitors) : Number.NaN,
    cohortSize: inputs.length,
    cohortLabel: label,
  };
}
