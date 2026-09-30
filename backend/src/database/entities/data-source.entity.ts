import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { DataSourceType } from '../../common/interfaces/enums';
import { ScrapeRun } from './scrape-run.entity';

@Entity('data_sources')
export class DataSourceRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ type: 'varchar', default: DataSourceType.MANUAL })
  type!: DataSourceType;

  @Column({ type: 'varchar', nullable: true })
  baseUrl!: string | null;

  /** URL of the ToS / robots policy that was reviewed before this source was enabled. */
  @Column({ type: 'varchar', nullable: true })
  termsUrl!: string | null;

  /** Sources are opt-in. A disabled source is never collected from. */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'text', nullable: true })
  complianceNotes!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => ScrapeRun, (run) => run.dataSource)
  runs!: ScrapeRun[];
}
