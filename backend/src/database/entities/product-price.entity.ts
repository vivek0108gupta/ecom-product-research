import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NumericTransformer } from '../../common/utils/numeric.transformer';
import { Product } from './product.entity';

/**
 * Append-only price observations. One row per observation, never updated in place,
 * so a real price history builds up from what was actually collected.
 * Prices are never back-filled or estimated.
 */
@Entity('product_prices')
@Index(['productId', 'collectedAt'])
export class ProductPrice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, (product) => product.prices, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'product_id' })
  productId!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  sellingPrice!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  mrp!: number | null;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  discountPercentage!: number | null;

  @Column({ default: 'INR' })
  currency!: string;

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
