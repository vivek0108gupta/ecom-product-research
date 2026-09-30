import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NumericTransformer } from '../../common/utils/numeric.transformer';
import { Product } from './product.entity';

/**
 * Demand and competition *signals* as observed at a point in time.
 * Review count is an indirect popularity signal only — it is never treated as a sales figure.
 */
@Entity('product_metrics')
@Index(['productId', 'collectedAt'])
export class ProductMetrics {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, (product) => product.metrics, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'product_id' })
  productId!: string;

  @Column({ type: 'int', nullable: true })
  reviewCount!: number | null;

  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true, transformer: NumericTransformer })
  averageRating!: number | null;

  /** Number of comparable competing listings the researcher counted for this product's search term. */
  @Column({ type: 'int', nullable: true })
  competitorCount!: number | null;

  /** Distinct sellers on the listing, where the marketplace displays it. */
  @Column({ type: 'int', nullable: true })
  sellerCount!: number | null;

  /** Best-seller rank where publicly displayed. */
  @Column({ type: 'int', nullable: true })
  bestSellerRank!: number | null;

  @Column({ type: 'varchar', nullable: true })
  searchTerm!: string | null;

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
