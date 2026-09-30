import { calculateProfitability } from './profit-calculator';
import { CostInputs } from './profitability.types';

const costs = (overrides: Partial<CostInputs> = {}): CostInputs => ({
  productCost: null,
  shippingCost: null,
  packagingCost: null,
  marketplaceFee: null,
  paymentFee: null,
  advertisingCost: null,
  returnAllowance: null,
  otherCosts: null,
  ...overrides,
});

describe('calculateProfitability', () => {
  it('computes profit, margin and ROI from a complete cost set', () => {
    const result = calculateProfitability(
      1000,
      costs({
        productCost: 300,
        shippingCost: 70,
        packagingCost: 30,
        marketplaceFee: 150,
        paymentFee: 20,
        advertisingCost: 100,
        returnAllowance: 30,
        otherCosts: 10,
      }),
    )!;

    expect(result.totalCost).toBe(710);
    expect(result.profitPerUnit).toBe(290);
    expect(result.profitMarginPercentage).toBe(29);
    // ROI is on landed cost (300 + 70 + 30 = 400), not on total cost or revenue.
    expect(result.estimatedLandedCost).toBe(400);
    expect(result.roiPercentage).toBe(72.5);
    expect(result.isReliable).toBe(true);
    expect(result.missingCostFields).toEqual([]);
  });

  it('returns null when there is no usable selling price', () => {
    expect(calculateProfitability(null, costs({ productCost: 100 }))).toBeNull();
    expect(calculateProfitability(0, costs({ productCost: 100 }))).toBeNull();
    expect(calculateProfitability(-50, costs({ productCost: 100 }))).toBeNull();
  });

  it('marks the result unreliable when no product cost was collected', () => {
    const result = calculateProfitability(500, costs({ shippingCost: 50 }))!;

    expect(result.isReliable).toBe(false);
    expect(result.reliabilityNotes.some((note) => note.includes('No supplier/product cost'))).toBe(true);
  });

  it('records which costs were missing rather than hiding that they were treated as zero', () => {
    const result = calculateProfitability(500, costs({ productCost: 200, shippingCost: 50 }))!;

    expect(result.missingCostFields).toEqual([
      'packagingCost',
      'marketplaceFee',
      'paymentFee',
      'advertisingCost',
      'returnAllowance',
      'otherCosts',
    ]);
    expect(result.costBreakdown.packagingCost).toBe(0);
    expect(result.profitPerUnit).toBe(250);
  });

  it('reports a negative margin instead of clamping it', () => {
    const result = calculateProfitability(300, costs({ productCost: 400, shippingCost: 50 }))!;

    expect(result.profitPerUnit).toBe(-150);
    expect(result.profitMarginPercentage).toBe(-50);
    expect(result.roiPercentage).toBeCloseTo(-33.33, 1);
  });

  it('returns a null ROI when landed cost is zero rather than dividing by zero', () => {
    const result = calculateProfitability(500, costs({ productCost: 0, advertisingCost: 100 }))!;

    expect(result.roiPercentage).toBeNull();
    expect(result.profitPerUnit).toBe(400);
  });

  it('notes when no marketplace fee schedule was matched', () => {
    const result = calculateProfitability(1000, costs({ productCost: 400 }), [])!;

    expect(result.reliabilityNotes.some((note) => note.includes('No marketplace fee schedule'))).toBe(true);
  });

  it('keeps the applied fee schedule attached to the result for traceability', () => {
    const result = calculateProfitability(1000, costs({ productCost: 400, marketplaceFee: 150 }), [
      { feeType: 'referral_percentage', percentage: 15, amountInr: 150, source: 'seller fee page', effectiveDate: '2026-01-01', category: 'default' },
    ])!;

    expect(result.appliedFees).toHaveLength(1);
    expect(result.appliedFees[0].source).toBe('seller fee page');
    expect(result.costBreakdown.marketplaceFee).toBe(150);
  });
});
