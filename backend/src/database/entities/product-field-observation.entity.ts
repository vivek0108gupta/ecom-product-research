import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { NumericTransformer } from '../../common/utils/numeric.transformer';
import { Product } from './product.entity';

/**
 * Append-only provenance ledger: one row per imported field, per observation.
 *
 * The typed tables (product_prices, product_metrics, product_costs) hold the values the
 * scoring engine reads. This table answers a different question — "who said this, and
 * when?" — for *every* field a real import supplied, including ones that live as plain
 * columns on products (weight, dimensions, brand) and therefore have nowhere else to
 * record their own source.
 *
 * Nothing is ever updated in place: a re-observation appends a new row, so the history of
 * what was claimed and when survives intact.
 */
@Entity('product_field_observations')
@Index(['productId', 'fieldName', 'observedAt'])
export class ProductFieldObservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Product, (product) => product.fieldObservations, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'product_id' })
  productId!: string;

  /** Canonical field name as accepted by the import schema, e.g. 'observed_price', 'supplier_cost'. */
  @Column()
  fieldName!: string;

  /** Original value as supplied, kept verbatim so the record can be audited against the source. */
  @Column({ type: 'text' })
  rawValue!: string;

  /** Parsed numeric form where the field is numeric; null for text/structured fields. */
  @Column({ type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: NumericTransformer })
  numericValue!: number | null;

  @Column({ type: 'text' })
  sourceName!: string;

  @Column({ type: 'text' })
  sourceUrl!: string;

  /** When the value was observed at source — not when it was imported. */
  @Column({ type: 'timestamptz' })
  observedAt!: Date;

  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true, transformer: NumericTransformer })
  confidenceScore!: number | null;

  /** The import run that recorded this observation. */
  @Column({ type: 'uuid', nullable: true })
  importRunId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
