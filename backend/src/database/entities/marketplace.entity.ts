import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { MarketplaceFee } from './marketplace-fee.entity';
import { Product } from './product.entity';

@Entity('marketplaces')
export class Marketplace {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stable machine key, e.g. 'amazon_in', 'flipkart', 'meesho'. */
  @Column({ unique: true })
  slug!: string;

  @Column()
  name!: string;

  @Column({ default: 'IN' })
  country!: string;

  @Column({ default: 'INR' })
  currency!: string;

  @Column({ type: 'varchar', nullable: true })
  websiteUrl!: string | null;

  @OneToMany(() => Product, (product) => product.marketplace)
  products!: Product[];

  @OneToMany(() => MarketplaceFee, (fee) => fee.marketplace)
  fees!: MarketplaceFee[];
}
