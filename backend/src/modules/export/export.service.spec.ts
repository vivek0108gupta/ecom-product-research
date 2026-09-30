import { DatasetStatus, ScoreStatus } from '../../common/interfaces/enums';
import { ProductsService, RankedProductRow } from '../products/products.service';
import { ExportService } from './export.service';

const row = (overrides: Partial<RankedProductRow> = {}): RankedProductRow => ({
  rank: 1,
  productId: 'p1',
  name: 'Packing Cubes Set of 6',
  url: 'https://example.com/demo/cubes',
  marketplace: 'Amazon India',
  category: 'travel-accessories',
  brand: 'DemoTravel',
  sellingPrice: 1099,
  estimatedLandedCost: 392,
  profitPerUnit: 352.15,
  profitMarginPercentage: 32.04,
  demandScore: 81.62,
  competitionOpportunityScore: 77.85,
  differentiationScore: 60,
  shippingSimplicityScore: 100,
  customerPainOpportunityScore: 45,
  bundleExpansionScore: 65,
  riskScore: 10,
  riskReasons: ['Seasonal demand'],
  finalScore: 70.65,
  classification: 'A',
  dataCompleteness: 1,
  datasetStatus: DatasetStatus.SAMPLE,
  scoreStatus: ScoreStatus.COMPLETE,
  missingCriticalFields: [],
  sourceName: 'manual_csv',
  sourceUrl: 'https://example.com/demo/cubes',
  collectedAt: new Date('2026-09-20T04:30:00Z'),
  computedAt: new Date('2026-09-29T15:05:00Z'),
  ...overrides,
});

const serviceWith = (rows: RankedProductRow[]): ExportService =>
  new ExportService({ findAllForExport: async () => rows } as unknown as ProductsService);

describe('ExportService.toCsv', () => {
  it('emits a header plus one line per product', async () => {
    const csv = await serviceWith([row()]).toCsv({});
    const lines = csv.split('\r\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Rank,Product,URL,Marketplace');
    expect(lines[1]).toContain('Packing Cubes Set of 6');
    expect(lines[1]).toContain('70.65');
  });

  it('writes "Data unavailable" for missing values rather than 0 or a blank cell', async () => {
    const csv = await serviceWith([row({ profitPerUnit: null, profitMarginPercentage: null, demandScore: null })]).toCsv({});

    expect(csv).toContain('Data unavailable');
    expect(csv.split('\r\n')[1]).not.toMatch(/,0,/);
  });

  it('quotes fields containing commas and escapes embedded quotes', async () => {
    const csv = await serviceWith([row({ name: 'Cubes, Set of 6 with "mesh" top' })]).toCsv({});

    expect(csv).toContain('"Cubes, Set of 6 with ""mesh"" top"');
  });

  it('writes timestamps in ISO form so freshness is unambiguous', async () => {
    const csv = await serviceWith([row()]).toCsv({});

    expect(csv).toContain('2026-09-20T04:30:00.000Z');
    expect(csv).toContain('2026-09-29T15:05:00.000Z');
  });

  it('labels SAMPLE rows and carries the demo disclaimer into the export', async () => {
    const csv = await serviceWith([row({ datasetStatus: DatasetStatus.SAMPLE })]).toCsv({});
    const [header, line] = csv.split('\r\n');

    expect(header).toContain('Dataset Status');
    expect(header).toContain('Disclaimer');
    expect(line).toContain('SAMPLE');
    expect(line).toContain('DEMO DATA');
    // The only place those words may appear for a SAMPLE row is inside the denial itself.
    expect(line).toContain('not a validated, profitable or recommended product');
    expect(line.replace('not a validated, profitable or recommended product', '')).not.toMatch(
      /recommended|validated|best/i,
    );
  });

  it('exports score status and names the missing critical fields', async () => {
    const csv = await serviceWith([
      row({ scoreStatus: ScoreStatus.INCOMPLETE, finalScore: null, missingCriticalFields: ['Supplier/product cost per unit (INR)'] }),
    ]).toCsv({});
    const line = csv.split('\r\n')[1];

    expect(line).toContain('INCOMPLETE');
    expect(line).toContain('Supplier/product cost per unit (INR)');
  });

  it("writes 'None' rather than a blank when nothing is missing", async () => {
    const csv = await serviceWith([row({ missingCriticalFields: [] })]).toCsv({});
    expect(csv.split('\r\n')[1]).toContain('None');
  });

  it('marks an UNVERIFIED row as needing confirmation, not as a recommendation', async () => {
    const csv = await serviceWith([row({ datasetStatus: DatasetStatus.UNVERIFIED })]).toCsv({});
    const line = csv.split('\r\n')[1];

    expect(line).toContain('UNVERIFIED');
    expect(line).toContain('not independently re-checked');
  });

  it('produces a header-only file when nothing matches the filters', async () => {
    const csv = await serviceWith([]).toCsv({});
    expect(csv.split('\r\n')).toHaveLength(1);
  });
});
