import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PainPointType } from '../../common/interfaces/enums';
import { NumericTransformer } from '../../common/utils/numeric.transformer';
import { Product } from './product.entity';

/**
 * A single traceable observation drawn from customer reviews: a complaint, a positive
 * theme, or a differentiation opportunity derived from them.
 *
 * Phase 1 has no AI analysis module — every row here is entered by the researcher who
 * actually read the reviews, and must carry the URL of the listing it came from.
 * Nothing in this table is ever generated.
 */
@Entity('product_pain_points')
@Index(['productId', 'type'])
export class ProductPainPoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, (product) => product.painPoints, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'product_id' })
  productId!: string;

  @Column({ type: 'varchar' })
  type!: PainPointType;

  /** Short theme label, e.g. 'zipper quality', 'missing parts'. */
  @Column()
  theme!: string;

  @Column({ type: 'text', nullable: true })
  detail!: string | null;

  /** How many reviews the researcher saw mentioning this theme. */
  @Column({ type: 'int', nullable: true })
  mentionCount!: number | null;

  /** Name of the source this value came from, e.g. 'manual_csv'. */
  @Column({ type: 'text' })
  sourceName!: string;

  @Column({ type: 'text' })
  sourceUrl!: string;

  @Column({ type: 'timestamptz' })
  collectedAt!: Date;

  /** 0-1 confidence in this specific observation. */
  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true, transformer: NumericTransformer })
  confidenceScore!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
