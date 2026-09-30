import { DataSourceRecord } from './data-source.entity';
import { Marketplace } from './marketplace.entity';
import { MarketplaceFee } from './marketplace-fee.entity';
import { Product } from './product.entity';
import { ProductCost } from './product-cost.entity';
import { ProductFieldObservation } from './product-field-observation.entity';
import { ProductMetrics } from './product-metrics.entity';
import { ProductPainPoint } from './product-pain-point.entity';
import { ProductPrice } from './product-price.entity';
import { ProductScore } from './product-score.entity';
import { ScrapeRun } from './scrape-run.entity';

export {
  DataSourceRecord,
  Marketplace,
  MarketplaceFee,
  Product,
  ProductCost,
  ProductFieldObservation,
  ProductMetrics,
  ProductPainPoint,
  ProductPrice,
  ProductScore,
  ScrapeRun,
};

export const ALL_ENTITIES = [
  DataSourceRecord,
  Marketplace,
  MarketplaceFee,
  Product,
  ProductCost,
  ProductFieldObservation,
  ProductMetrics,
  ProductPainPoint,
  ProductPrice,
  ProductScore,
  ScrapeRun,
];
