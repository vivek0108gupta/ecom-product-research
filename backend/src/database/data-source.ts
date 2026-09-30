import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';

loadEnv({ path: resolve(__dirname, '../../../.env') });

/** Used by the TypeORM CLI for migrations and by the seed script. */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'ecom',
  password: process.env.DB_PASSWORD ?? 'ecom',
  database: process.env.DB_NAME ?? 'ecom_research',
  entities: ALL_ENTITIES,
  migrations: [resolve(__dirname, 'migrations/*.{ts,js}')],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});
