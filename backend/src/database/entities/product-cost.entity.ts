import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NumericTransformer } from '../../common/utils/numeric.transformer';
import { Product } from './product.entity';

/**
 * Cost assumptions for one product, all in INR per unit. Every field is nullable:
 * a missing cost is reported as unavailable, never silently treated as zero.
 * Marketplace fees are NOT stored here — they are resolved from marketplace_fees
 * at calculation time unless marketplaceFeeOverride is set.
 */
@Entity('product_costs')
@Index(['productId', 'effectiveDate'])
export class ProductCost {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, (product) => product.costs, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'product_id' })
  productId!: string;

  /** Supplier/unit cost of the product itself. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  productCost!: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  shippingCost!: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  packagingCost!: number | null;

  /** Absolute INR override; when null, fees are resolved from the marketplace_fees table. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  marketplaceFeeOverride!: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  paymentFee!: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  advertisingCost!: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  returnAllowance!: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: NumericTransformer })
  otherCosts!: number | null;

  /** Name of the source this value came from, e.g. 'manual_csv'. */
  @Column({ type: 'text' })
  sourceName!: string;

  @Column({ type: 'text', nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'date' })
  effectiveDate!: string;

  @Column({ type: 'timestamptz' })
  collectedAt!: Date;

  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true, transformer: NumericTransformer })
  confidenceScore!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
