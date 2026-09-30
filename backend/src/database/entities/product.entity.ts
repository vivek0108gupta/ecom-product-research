import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { NumericTransformer } from '../../common/utils/numeric.transformer';
import { DatasetStatus, RiskLevel } from '../../common/interfaces/enums';
import { DataSourceRecord } from './data-source.entity';
import { Marketplace } from './marketplace.entity';
import { ProductCost } from './product-cost.entity';
import { ProductFieldObservation } from './product-field-observation.entity';
import { ProductMetrics } from './product-metrics.entity';
import { ProductPainPoint } from './product-pain-point.entity';
import { ProductPrice } from './product-price.entity';
import { ProductScore } from './product-score.entity';

export interface ProductDimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/**
 * Deduplication contract, checked in this order against the same marketplace:
 *   1. externalId  (ASIN/FSN/SKU) where the marketplace publishes one
 *   2. normalized url (tracking params, fragment, www and trailing slash removed)
 *   3. normalized name (lowercased, punctuation and extra whitespace stripped)
 * The first two are enforced by unique constraints; the third is a lookup at ingestion,
 * since two genuinely different products can legitimately share a name across marketplaces.
 */
@Entity('products')
@Unique('uq_product_marketplace_external_id', ['marketplaceId', 'externalId'])
@Unique('uq_product_marketplace_url', ['marketplaceId', 'url'])
@Index(['category'])
@Index(['datasetStatus'])
@Index(['marketplaceId', 'normalizedName'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  /** Lowercased, punctuation-stripped name used as the third deduplication key. */
  @Column()
  normalizedName!: string;

  @Column({ type: 'text' })
  url!: string;

  @ManyToOne(() => Marketplace, (marketplace) => marketplace.products, { nullable: false, eager: true })
  @JoinColumn({ name: 'marketplace_id' })
  marketplace!: Marketplace;

  @Column({ name: 'marketplace_id' })
  marketplaceId!: string;

  /** Public marketplace identifier (ASIN / FSN / SKU) where one is displayed. */
  @Column({ type: 'varchar', nullable: true })
  externalId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  brand!: string | null;

  /** Category slug from config/categories.json. */
  @Column()
  category!: string;

  @Column({ type: 'varchar', nullable: true })
  subcategory!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  features!: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  variants!: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  sizes!: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  colors!: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  imageUrls!: string[] | null;

  @Column({ type: 'numeric', precision: 10, scale: 3, nullable: true, transformer: NumericTransformer })
  weightKg!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  dimensions!: ProductDimensions | null;

  // --- Researcher-supplied qualitative flags. Nullable: absent means "not assessed", not "false". ---

  @Column({ type: 'boolean', nullable: true })
  fragile!: boolean | null;

  @Column({ type: 'varchar', nullable: true })
  returnRisk!: RiskLevel | null;

  @Column({ type: 'varchar', nullable: true })
  regulatoryComplexity!: RiskLevel | null;

  @Column({ type: 'boolean', nullable: true })
  brandIpRisk!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  seasonalDemand!: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  establishedBrandDominance!: boolean | null;

  /** Manual 0-100 override for bundle/expansion potential; falls back to category baseline when null. */
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: NumericTransformer })
  bundlePotentialScore!: number | null;

  // --- Provenance. Required on every product. ---

  @ManyToOne(() => DataSourceRecord, { nullable: false, eager: true })
  @JoinColumn({ name: 'data_source_id' })
  dataSource!: DataSourceRecord;

  @Column({ name: 'data_source_id' })
  dataSourceId!: string;

  @Column({ type: 'text' })
  sourceUrl!: string;

  @Column({ type: 'timestamptz' })
  collectedAt!: Date;

  /** 0-1. How much the collector trusts this record (manual entry defaults lower than an official API). */
  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true, transformer: NumericTransformer })
  confidenceScore!: number | null;

  /**
   * Trust level of this record. SAMPLE rows are demo data and must never be surfaced as
   * validated, profitable, best or recommended products.
   */
  @Column({ type: 'varchar', default: DatasetStatus.UNVERIFIED })
  datasetStatus!: DatasetStatus;

  /** Who said so, for the product record itself. Per-value sources live on each child table. */
  @Column({ type: 'varchar' })
  sourceName!: string;

  /**
   * Populated when a VERIFIED claim was refused and the record was downgraded to
   * UNVERIFIED, listing exactly why. Null when no claim was made or the claim stood.
   */
  @Column({ type: 'jsonb', nullable: true })
  verificationNotes!: string[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => ProductPrice, (price) => price.product)
  prices!: ProductPrice[];

  @OneToMany(() => ProductMetrics, (metrics) => metrics.product)
  metrics!: ProductMetrics[];

  @OneToMany(() => ProductCost, (cost) => cost.product)
  costs!: ProductCost[];

  @OneToMany(() => ProductPainPoint, (painPoint) => painPoint.product)
  painPoints!: ProductPainPoint[];

  @OneToMany(() => ProductFieldObservation, (observation) => observation.product)
  fieldObservations!: ProductFieldObservation[];

  @OneToOne(() => ProductScore, (score) => score.product)
  score!: ProductScore | null;
}
