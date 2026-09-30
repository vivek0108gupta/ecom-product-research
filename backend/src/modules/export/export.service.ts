import { Injectable } from '@nestjs/common';
import { QueryProductsDto } from '../products/dto/query-products.dto';
import { disclaimerFor } from '../analytics/analytics.service';
import { ProductsService, RankedProductRow } from '../products/products.service';

/** Column order of the export, matching the spec's required export fields. */
const COLUMNS: Array<{ key: keyof ExportRow; header: string }> = [
  { key: 'rank', header: 'Rank' },
  { key: 'product', header: 'Product' },
  { key: 'url', header: 'URL' },
  { key: 'marketplace', header: 'Marketplace' },
  { key: 'category', header: 'Category' },
  { key: 'price', header: 'Price (INR)' },
  { key: 'estimatedCost', header: 'Estimated Cost (INR)' },
  { key: 'estimatedProfit', header: 'Estimated Profit (INR)' },
  { key: 'margin', header: 'Margin %' },
  { key: 'demandScore', header: 'Demand Score' },
  { key: 'competitionOpportunityScore', header: 'Competition Opportunity Score' },
  { key: 'differentiationScore', header: 'Differentiation Score' },
  { key: 'riskScore', header: 'Risk Score' },
  { key: 'finalScore', header: 'Final Score' },
  { key: 'classification', header: 'Classification' },
  { key: 'dataCompleteness', header: 'Data Completeness' },
  { key: 'datasetStatus', header: 'Dataset Status' },
  { key: 'scoreStatus', header: 'Score Status' },
  { key: 'missingCriticalFields', header: 'Missing Critical Fields' },
  { key: 'disclaimer', header: 'Disclaimer' },
  { key: 'sourceName', header: 'Source' },
  { key: 'sourceUrl', header: 'Source URL' },
  { key: 'collectedAt', header: 'Collected At' },
  { key: 'scoreComputedAt', header: 'Score Computed At' },
];

interface ExportRow {
  rank: number;
  product: string;
  url: string;
  marketplace: string;
  category: string;
  price: number | null;
  estimatedCost: number | null;
  estimatedProfit: number | null;
  margin: number | null;
  demandScore: number | null;
  competitionOpportunityScore: number | null;
  differentiationScore: number | null;
  riskScore: number | null;
  finalScore: number | null;
  classification: string | null;
  dataCompleteness: number | null;
  datasetStatus: string;
  scoreStatus: string | null;
  missingCriticalFields: string;
  disclaimer: string;
  sourceName: string;
  sourceUrl: string;
  collectedAt: string;
  scoreComputedAt: string | null;
}

@Injectable()
export class ExportService {
  constructor(private readonly products: ProductsService) {}

  async getRows(query: QueryProductsDto): Promise<ExportRow[]> {
    const ranked = await this.products.findAllForExport(query);
    return ranked.map((row) => this.toExportRow(row));
  }

  /**
   * RFC 4180 CSV. Missing values are written as the literal 'Data unavailable' rather
   * than 0 or an empty cell, so a reader can't mistake "not collected" for "zero".
   */
  async toCsv(query: QueryProductsDto): Promise<string> {
    const rows = await this.getRows(query);
    const header = COLUMNS.map((column) => escapeCsv(column.header)).join(',');
    const lines = rows.map((row) => COLUMNS.map((column) => escapeCsv(formatValue(row[column.key]))).join(','));
    return [header, ...lines].join('\r\n');
  }

  private toExportRow(row: RankedProductRow): ExportRow {
    return {
      rank: row.rank,
      product: row.name,
      url: row.url,
      marketplace: row.marketplace,
      category: row.category,
      price: row.sellingPrice,
      estimatedCost: row.estimatedLandedCost,
      estimatedProfit: row.profitPerUnit,
      margin: row.profitMarginPercentage,
      demandScore: row.demandScore,
      competitionOpportunityScore: row.competitionOpportunityScore,
      differentiationScore: row.differentiationScore,
      riskScore: row.riskScore,
      finalScore: row.finalScore,
      classification: row.classification,
      dataCompleteness: row.dataCompleteness,
      datasetStatus: row.datasetStatus,
      scoreStatus: row.scoreStatus,
      missingCriticalFields: row.missingCriticalFields.length > 0 ? row.missingCriticalFields.join('; ') : 'None',
      disclaimer: disclaimerFor(row.datasetStatus, row.scoreStatus),
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      collectedAt: new Date(row.collectedAt).toISOString(),
      scoreComputedAt: row.computedAt ? new Date(row.computedAt).toISOString() : null,
    };
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'Data unavailable';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
