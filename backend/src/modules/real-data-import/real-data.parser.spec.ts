import { DatasetStatus, PainPointType } from '../../common/interfaces/enums';
import { RealDataParser } from './real-data.parser';

const parser = new RealDataParser();

const CSV_HEADER =
  'product_name,marketplace,product_url,observed_price,observed_at,source_url,source_name,product_id,category,brand,rating,review_count,supplier_cost,shipping_cost,marketplace_fee,product_weight,product_dimensions,competition_signal,cost_source_name,complaints';

const CSV_ROW =
  'Steel Spice Rack,amazon_in,https://www.amazon.in/dp/B0ABCDEFGH,₹1249,2026-09-28T11:00:00+05:30,https://www.amazon.in/dp/B0ABCDEFGH,vivek_listing_review,B0ABCDEFGH,kitchen-organization,RealBrand,4.1,860,420,95,180,1.8,30x20x25,34,indiamart quote 2026-09-28,lids leak:40';

describe('RealDataParser — CSV', () => {
  it('maps a complete real record', () => {
    const { records, malformed } = parser.parse(`${CSV_HEADER}\n${CSV_ROW}`, 'csv');

    expect(malformed).toEqual([]);
    expect(records).toHaveLength(1);

    const { product } = records[0];
    expect(product.name).toBe('Steel Spice Rack');
    expect(product.url).toBe('https://amazon.in/dp/B0ABCDEFGH');
    expect(product.externalId).toBe('B0ABCDEFGH');
    expect(product.sellingPrice).toBe(1249);
    expect(product.averageRating).toBe(4.1);
    expect(product.reviewCount).toBe(860);
    expect(product.competitorCount).toBe(34);
    expect(product.weightKg).toBe(1.8);
    expect(product.dimensions).toEqual({ lengthCm: 30, widthCm: 20, heightCm: 25 });
    expect(product.costs?.productCost).toBe(420);
    expect(product.costs?.marketplaceFeeOverride).toBe(180);
    expect(product.costs?.sourceName).toBe('indiamart quote 2026-09-28');
    expect(product.sourceName).toBe('vivek_listing_review');
    expect(product.collectedAt.toISOString()).toBe('2026-09-28T05:30:00.000Z');
  });

  it('never assigns VERIFIED at parse time, whatever the record claims', () => {
    const csv = `${CSV_HEADER},dataset_status\n${CSV_ROW},VERIFIED`;
    const { records } = parser.parse(csv, 'csv');

    expect(records[0].product.datasetStatus).toBe(DatasetStatus.UNVERIFIED);
    expect(records[0].verificationRequested).toBe(true);
  });

  it('records every supplied field with its raw value for the provenance ledger', () => {
    const { records } = parser.parse(`${CSV_HEADER}\n${CSV_ROW}`, 'csv');
    const byField = Object.fromEntries(records[0].observations.map((o) => [o.fieldName, o]));

    expect(byField.observed_price.rawValue).toBe('₹1249');
    expect(byField.observed_price.numericValue).toBe(1249);
    expect(byField.supplier_cost.numericValue).toBe(420);
    expect(byField.product_name.rawValue).toBe('Steel Spice Rack');
    expect(byField.source_name.rawValue).toBe('vivek_listing_review');
  });

  it('does not record an observation for a field that was not supplied', () => {
    const { records } = parser.parse(`${CSV_HEADER}\n${CSV_ROW}`, 'csv');
    const fields = records[0].observations.map((o) => o.fieldName);

    expect(fields).not.toContain('payment_fee');
    expect(fields).not.toContain('best_seller_rank');
  });

  it('reports an unparseable price as malformed rather than coercing it', () => {
    const csv = `${CSV_HEADER}\n${CSV_ROW.replace('₹1249', 'about nine hundred')}`;
    const { records, malformed } = parser.parse(csv, 'csv');

    expect(records).toHaveLength(0);
    expect(malformed[0].code).toBe('MALFORMED_RECORD');
    expect(malformed[0].errors[0]).toContain('observed_price');
    expect(malformed[0].record).toBe(2);
  });

  it('reports an unparseable observed_at as malformed', () => {
    const csv = `${CSV_HEADER}\n${CSV_ROW.replace('2026-09-28T11:00:00+05:30', 'last tuesday')}`;
    const { malformed } = parser.parse(csv, 'csv');

    expect(malformed[0].errors[0]).toContain('observed_at');
  });

  it('does not substitute product_url when source_url is absent', () => {
    // source_url is required; defaulting it would let a record pass without declaring
    // where the observation came from, so the field must stay empty for the validator.
    const header = CSV_HEADER.replace(',source_url', '');
    const row = CSV_ROW.replace(',https://www.amazon.in/dp/B0ABCDEFGH,vivek_listing_review', ',vivek_listing_review');
    const { records } = parser.parse(`${header}\n${row}`, 'csv');

    expect(records[0].product.sourceUrl).toBe('');
  });

  it('parses complaint themes with mention counts', () => {
    const { records } = parser.parse(`${CSV_HEADER}\n${CSV_ROW}`, 'csv');

    expect(records[0].product.painPoints).toEqual([
      expect.objectContaining({ type: PainPointType.COMPLAINT, theme: 'lids leak', mentionCount: 40 }),
    ]);
  });
});

describe('RealDataParser — JSON', () => {
  const jsonRecord = {
    product_name: 'Steel Spice Rack',
    marketplace: 'amazon_in',
    product_url: 'https://www.amazon.in/dp/B0ABCDEFGH',
    observed_price: 1249,
    observed_at: '2026-09-28T11:00:00+05:30',
    source_url: 'https://www.amazon.in/dp/B0ABCDEFGH',
    source_name: 'vivek_listing_review',
    category: 'kitchen-organization',
    rating: 4.1,
    review_count: 860,
    competition_signal: 34,
    supplier_cost: 420,
    product_dimensions: { lengthCm: 30, widthCm: 20, heightCm: 25 },
  };

  it('accepts a bare array', () => {
    const { records, malformed } = parser.parse(JSON.stringify([jsonRecord]), 'json');

    expect(malformed).toEqual([]);
    expect(records[0].product.sellingPrice).toBe(1249);
    expect(records[0].product.dimensions).toEqual({ lengthCm: 30, widthCm: 20, heightCm: 25 });
  });

  it('accepts a { records: [...] } envelope', () => {
    const { records } = parser.parse(JSON.stringify({ records: [jsonRecord] }), 'json');
    expect(records).toHaveLength(1);
  });

  it('accepts camelCase keys from JSON clients', () => {
    const camel = {
      productName: 'Steel Spice Rack',
      marketplace: 'amazon_in',
      productUrl: 'https://www.amazon.in/dp/B0ABCDEFGH',
      observedPrice: 1249,
      observedAt: '2026-09-28T11:00:00+05:30',
      sourceUrl: 'https://www.amazon.in/dp/B0ABCDEFGH',
      sourceName: 'vivek_listing_review',
    };
    const { records } = parser.parse(JSON.stringify([camel]), 'json');

    expect(records[0].product.name).toBe('Steel Spice Rack');
    expect(records[0].product.sellingPrice).toBe(1249);
  });

  it('numbers JSON records from 1, not 2 like a CSV with a header', () => {
    const { records } = parser.parse(JSON.stringify([jsonRecord, jsonRecord]), 'json');

    expect(records.map((r) => r.record)).toEqual([1, 2]);
  });

  it('throws a clear error for invalid JSON', () => {
    expect(() => parser.parse('{not json', 'json')).toThrow(/not valid JSON/);
  });

  it('throws when the payload is not an array of records', () => {
    expect(() => parser.parse(JSON.stringify({ foo: 'bar' }), 'json')).toThrow(/must be an array of records/);
  });
});

describe('RealDataParser — dimensions', () => {
  const withDimensions = (value: string) =>
    parser.parse(`${CSV_HEADER}\n${CSV_ROW.replace('30x20x25', value)}`, 'csv').records[0].product.dimensions;

  it.each(['30x20x25', '30 x 20 x 25', '30×20×25', '30x20x25 cm'])('parses %s', (value) => {
    expect(withDimensions(value)).toEqual({ lengthCm: 30, widthCm: 20, heightCm: 25 });
  });

  it('returns null rather than guessing from an incomplete value', () => {
    expect(withDimensions('30x20')).toBeNull();
    expect(withDimensions('big')).toBeNull();
  });
});
