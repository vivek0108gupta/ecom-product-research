import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RunStatus } from '../../common/interfaces/enums';
import { DataSourceRecord } from './data-source.entity';

/** One data-collection run: what was attempted, what landed, what failed and why. */
@Entity('scrape_runs')
export class ScrapeRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => DataSourceRecord, (source) => source.runs, { nullable: false, eager: true })
  @JoinColumn({ name: 'data_source_id' })
  dataSource!: DataSourceRecord;

  @Column({ name: 'data_source_id' })
  dataSourceId!: string;

  @Column({ type: 'varchar', default: RunStatus.PENDING })
  status!: RunStatus;

  @Column({ type: 'int', default: 0 })
  recordsReceived!: number;

  @Column({ type: 'int', default: 0 })
  recordsCreated!: number;

  @Column({ type: 'int', default: 0 })
  recordsUpdated!: number;

  @Column({ type: 'int', default: 0 })
  recordsSkippedDuplicate!: number;

  @Column({ type: 'int', default: 0 })
  recordsRejected!: number;

  /** Per-row validation failures: [{ row, errors: string[] }]. Nothing is dropped silently. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  rejections!: Array<{ row: number; identifier: string | null; errors: string[] }>;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
