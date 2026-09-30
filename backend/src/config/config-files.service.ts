import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { CategoryDefinition, SCORE_COMPONENT_KEYS, ScoringConfig } from './scoring-config.types';

/**
 * Loads the operator-editable JSON config (scoring weights, category list) from disk.
 * Weights are configuration, not code — nothing in the scoring engine hardcodes them.
 */
@Injectable()
export class ConfigFilesService implements OnModuleInit {
  private readonly logger = new Logger(ConfigFilesService.name);
  private scoring!: ScoringConfig;
  private categories!: CategoryDefinition[];

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.reload();
  }

  reload(): void {
    const scoringPath = this.configService.get<string>('configPaths.scoring')!;
    const categoriesPath = this.configService.get<string>('configPaths.categories')!;

    this.scoring = JSON.parse(readFileSync(scoringPath, 'utf-8')) as ScoringConfig;
    this.categories = (JSON.parse(readFileSync(categoriesPath, 'utf-8')) as { categories: CategoryDefinition[] }).categories;

    this.assertWeightsSumToOne();
    this.logger.log(`Loaded scoring config from ${scoringPath} and ${this.categories.length} categories from ${categoriesPath}`);
  }

  getScoringConfig(): ScoringConfig {
    return this.scoring;
  }

  getCategories(): CategoryDefinition[] {
    return this.categories;
  }

  isKnownCategory(slug: string): boolean {
    return this.categories.some((category) => category.slug === slug);
  }

  private assertWeightsSumToOne(): void {
    const weights = this.scoring.finalScoreWeights ?? {};
    let total = 0;

    for (const key of SCORE_COMPONENT_KEYS) {
      const weight = weights[key];
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
        throw new Error(`finalScoreWeights.${key} must be a non-negative number in config/scoring-weights.json, got ${JSON.stringify(weight)}.`);
      }
      total += weight;
    }

    if (Math.abs(total - 1) > 1e-6) {
      throw new Error(`finalScoreWeights must sum to 1.0, got ${total}. Fix config/scoring-weights.json.`);
    }
  }
}
