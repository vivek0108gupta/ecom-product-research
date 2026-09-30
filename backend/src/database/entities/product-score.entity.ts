import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NumericTransformer } from '../../common/utils/numeric.transformer';
import { CriticalField, ProductClassification, ScoreStatus } from '../../common/interfaces/enums';
import { Product } from './product.entity';

/**
 * The computed output for one product. Every sub-score is nullable — null means
 * "the inputs for this signal were not collected", which is surfaced as
 * "Data unavailable" rather than being scored as zero.
 *
 * weightsSnapshot + scoreBreakdown make each number reproducible after the fact:
 * they record the exact weights used and the raw inputs each sub-score came from.
 */
@Entity('product_scores')
export class ProductScore {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => Product, (product) => product.score, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'product_id', unique: true })
  productId!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  demandScore!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  profitabilityScore!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  competitionOpportunityScore!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  differentiationScore!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  shippingSimplicityScore!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  customerPainOpportunityScore!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  bundleExpansionScore!: number | null;

  /**
   * Null whenever scoreStatus is INCOMPLETE. A Final Score is only produced when every
   * critical input is present — a partial score would invite exactly the false confidence
   * this system exists to avoid.
   */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  finalScore!: number | null;

  @Column({ type: 'varchar', default: ScoreStatus.INCOMPLETE })
  scoreStatus!: ScoreStatus;

  /** Exactly which critical inputs were missing, so the gap is actionable rather than mysterious. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  missingCriticalFields!: CriticalField[];

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  riskScore!: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  riskReasons!: string[];

  @Column({ type: 'varchar', nullable: true })
  classification!: ProductClassification | null;

  // --- Profitability snapshot, so the ranked table and exports agree with the score. ---

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  sellingPrice!: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  estimatedLandedCost!: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  profitPerUnit!: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: NumericTransformer })
  profitMarginPercentage!: number | null;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true, transformer: NumericTransformer })
  roiPercentage!: number | null;

  /** Fraction (0-1) of weighted sub-scores that actually had data behind them. */
  @Column({ type: 'numeric', precision: 3, scale: 2, transformer: NumericTransformer })
  dataCompleteness!: number | null;

  @Column({ type: 'jsonb' })
  weightsSnapshot!: Record<string, number>;

  @Column({ type: 'jsonb' })
  scoreBreakdown!: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  computedAt!: Date;
}
