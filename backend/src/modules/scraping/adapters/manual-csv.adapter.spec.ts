import { DatasetStatus, PainPointType, RiskLevel } from '../../../common/interfaces/enums';
import { UnsupportedOperationError } from '../../../common/interfaces/product-source-adapter.interface';
import { ManualCsvAdapter } from './manual-csv.adapter';

const HEADER =
  'name,url,marketplace,external_id,category,selling_price,mrp,weight_kg,length_cm,width_cm,height_cm,review_count,average_rating,competitor_count,product_cost,shipping_cost,fragile,return_risk,colors,complaints,opportunities,source_url,collected_at,is_sample_data';

const adapter = new ManualCsvAdapter();

describe('ManualCsvAdapter.parseCsv', () => {
  it('maps a complete row into the normalized shape', () => {
    const csv = `${HEADER}
Packing Cubes,https://www.example.com/demo/cubes?ref=x,amazon_in,DEMO1,travel-accessories,₹1099,2499,0.55,40,30,12,4300,4.3,88,310,60,no,low,navy|grey,zipper breaks:150|mesh tears:95,Metal zip pulls,https://example.com/demo/cubes,2026-09-20T10:00:00+05:30,true`;

    const { products, malformed } = adapter.parseCsv(csv);

    expect(malformed).toEqual([]);
    expect(products).toHaveLength(1);

    const product = products[0];
    expect(product.name).toBe('Packing Cubes');
    expect(product.url).toBe('https://example.com/demo/cubes');
    expect(product.sellingPrice).toBe(1099);
    expect(product.mrp).toBe(2499);
    expect(product.discountPercentage).toBe(56.02);
    expect(product.currency).toBe('INR');
    expect(product.dimensions).toEqual({ lengthCm: 40, widthCm: 30, heightCm: 12 });
    expect(product.colors).toEqual(['navy', 'grey']);
    expect(product.fragile).toBe(false);
    expect(product.returnRisk).toBe(RiskLevel.LOW);
    expect(product.datasetStatus).toBe(DatasetStatus.SAMPLE);
    expect(product.costs?.productCost).toBe(310);
  });

  it('parses complaint themes with their mention counts and tags them by type', () => {
    const csv = `${HEADER}
Packing Cubes,https://example.com/demo/cubes,amazon_in,DEMO1,travel-accessories,1099,,,,,,,,,,,,,,zipper breaks:150|mesh tears,Metal zip pulls,https://example.com/demo/cubes,2026-09-20T10:00:00Z,true`;

    const [product] = adapter.parseCsv(csv).products;

    expect(product.painPoints).toEqual([
      { type: PainPointType.COMPLAINT, theme: 'zipper breaks', detail: null, mentionCount: 150, sourceName: 'manual_csv', sourceUrl: 'https://example.com/demo/cubes', confidenceScore: null },
      { type: PainPointType.COMPLAINT, theme: 'mesh tears', detail: null, mentionCount: null, sourceName: 'manual_csv', sourceUrl: 'https://example.com/demo/cubes', confidenceScore: null },
      { type: PainPointType.OPPORTUNITY, theme: 'Metal zip pulls', detail: null, mentionCount: null, sourceName: 'manual_csv', sourceUrl: 'https://example.com/demo/cubes', confidenceScore: null },
    ]);
  });

  it('leaves uncollected fields null instead of defaulting them', () => {
    const csv = `${HEADER}
Bare Row,https://example.com/demo/bare,meesho,,car-accessories,499,,,,,,,,,,,,,,,,https://example.com/demo/bare,2026-09-20T10:00:00Z,`;

    const [product] = adapter.parseCsv(csv).products;

    expect(product.weightKg).toBeNull();
    expect(product.dimensions).toBeNull();
    expect(product.reviewCount).toBeNull();
    expect(product.averageRating).toBeNull();
    expect(product.competitorCount).toBeNull();
    expect(product.costs).toBeNull();
    expect(product.fragile).toBeNull();
    expect(product.externalId).toBeNull();
    expect(product.painPoints).toEqual([]);
    expect(product.datasetStatus).toBe(DatasetStatus.UNVERIFIED);
  });

  it('reports malformed rows by line number instead of throwing or dropping them silently', () => {
    const csv = `${HEADER}
Good Row,https://example.com/demo/good,amazon_in,A1,car-accessories,499,,,,,,,,,,,,,,,,https://example.com/demo/good,2026-09-20T10:00:00Z,true
Bad Price,https://example.com/demo/bad,amazon_in,A2,car-accessories,not-a-number,,,,,,,,,,,,,,,,https://example.com/demo/bad,2026-09-20T10:00:00Z,true
,https://example.com/demo/noname,amazon_in,A3,car-accessories,499,,,,,,,,,,,,,,,,https://example.com/demo/noname,2026-09-20T10:00:00Z,true`;

    const { products, malformed } = adapter.parseCsv(csv);

    expect(products).toHaveLength(1);
    expect(malformed).toHaveLength(2);
    expect(malformed[0]).toMatchObject({ row: 3, identifier: 'Bad Price' });
    expect(malformed[0].errors[0]).toContain('selling_price');
    expect(malformed[1].row).toBe(4);
  });

  it('defaults the collection timestamp to now only when the column is absent', () => {
    const csv = `${HEADER}
No Timestamp,https://example.com/demo/nots,amazon_in,A9,car-accessories,499,,,,,,,,,,,,,,,,https://example.com/demo/nots,,true`;

    const [product] = adapter.parseCsv(csv).products;

    expect(product.collectedAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(product.collectedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('handles an empty file without crashing', () => {
    expect(adapter.parseCsv(HEADER)).toEqual({ products: [], malformed: [] });
  });
});

describe('ManualCsvAdapter capabilities', () => {
  it('declares that it cannot collect reviews or query a marketplace', () => {
    expect(adapter.capabilities.search).toBe(false);
    expect(adapter.capabilities.reviews).toBe(false);
  });

  it('throws on unsupported operations rather than returning empty results', async () => {
    await expect(adapter.searchProducts({ category: 'car-accessories' })).rejects.toBeInstanceOf(UnsupportedOperationError);
    await expect(adapter.getProductDetails('x')).rejects.toBeInstanceOf(UnsupportedOperationError);
    await expect(adapter.getPricing('x')).rejects.toBeInstanceOf(UnsupportedOperationError);
    await expect(adapter.getReviews('x')).rejects.toBeInstanceOf(UnsupportedOperationError);
    await expect(adapter.getCategories()).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
