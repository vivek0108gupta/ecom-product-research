import { resolve } from 'path';

const repoRoot = resolve(__dirname, '../../..');

export const configuration = () => ({
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'ecom',
    password: process.env.DB_PASSWORD ?? 'ecom',
    name: process.env.DB_NAME ?? 'ecom_research',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  configPaths: {
    scoring: process.env.SCORING_CONFIG_PATH
      ? resolve(process.cwd(), process.env.SCORING_CONFIG_PATH)
      : resolve(repoRoot, 'config/scoring-weights.json'),
    categories: process.env.CATEGORIES_CONFIG_PATH
      ? resolve(process.cwd(), process.env.CATEGORIES_CONFIG_PATH)
      : resolve(repoRoot, 'config/categories.json'),
    marketplaceFees: resolve(repoRoot, 'config/marketplace-fees.seed.json'),
    dataSources: process.env.DATA_SOURCES_CONFIG_PATH
      ? resolve(process.cwd(), process.env.DATA_SOURCES_CONFIG_PATH)
      : resolve(repoRoot, 'config/data-sources.json'),
  },
});

export type AppConfig = ReturnType<typeof configuration>;
