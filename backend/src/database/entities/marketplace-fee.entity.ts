import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FeeType } from '../../common/interfaces/enums';
import { Marketplace } from './marketplace.entity';

/**
 * Fee assumptions live in data, never in code. Each row records where the number
 * came from and when it took effect, so a profitability figure can always be traced
 * back to a specific published fee schedule.
 */
@Entity('marketplace_fees')
@Index(['marketplace', 'category', 'feeType', 'effectiveDate'])
export class MarketplaceFee {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Marketplace, (marketplace) => marketplace.fees, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplace_id' })
  marketplace!: Marketplace;

  @Column({ name: 'marketplace_id' })
  marketplaceId!: string;

  /** Category slug this fee applies to, or 'default' as the catch-all fallback. */
  @Column({ default: 'default' })
  category!: string;

  @Column({ type: 'varchar' })
  feeType!: FeeType;

  /** Percentage (0-100) for *_percentage fee types, absolute INR for fixed fee types. */
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  feeValue!: string;

  @Column({ type: 'text' })
  source!: string;

  @Column({ type: 'date' })
  effectiveDate!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  collectedAt!: Date;
}
