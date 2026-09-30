import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolve } from 'path';
import { configuration } from './config/configuration';
import { ConfigFilesModule } from './config/config-files.module';
import { DataSourcesModule } from './modules/data-sources/data-sources.module';
import { ALL_ENTITIES } from './database/entities';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ExportModule } from './modules/export/export.module';
import { KeepaModule } from './modules/keepa/keepa.module';
import { MarketplacesModule } from './modules/marketplaces/marketplaces.module';
import { ProductsModule } from './modules/products/products.module';
import { ProfitabilityModule } from './modules/profitability/profitability.module';
import { RealDataImportModule } from './modules/real-data-import/real-data-import.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { ScrapingModule } from './modules/scraping/scraping.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')],
    }),
    ConfigFilesModule,
    DataSourcesModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: ALL_ENTITIES,
        migrations: [resolve(__dirname, 'database/migrations/*.{ts,js}')],
        migrationsRun: true,
        synchronize: false,
        logging: ['error', 'warn'],
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    ProfitabilityModule,
    ScoringModule,
    ProductsModule,
    MarketplacesModule,
    ScrapingModule,
    KeepaModule,
    RealDataImportModule,
    AnalyticsModule,
    ExportModule,
  ],
})
export class AppModule {}
