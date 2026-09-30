import { AppliedFee, CostInputs, ProfitabilityResult } from './profitability.types';

const COST_FIELDS: Array<keyof CostInputs> = [
  'productCost',
  'shippingCost',
  'packagingCost',
  'marketplaceFee',
  'paymentFee',
  'advertisingCost',
  'returnAllowance',
  'otherCosts',
];

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Pure profitability arithmetic — no database, no config lookups, fully unit-testable.
 *
 *   profit_per_unit  = selling_price - (all cost components)
 *   profit_margin_%  = profit_per_unit / selling_price * 100
 *   roi_%            = profit_per_unit / estimated_landed_cost * 100
 *
 * A null cost contributes 0 to the arithmetic but is recorded in `missingCostFields`
 * so the UI can show which parts of the picture are incomplete instead of implying
 * the cost is genuinely zero. Missing product cost or selling price marks the whole
 * result unreliable.
 */
export function calculateProfitability(
  sellingPrice: number | null,
  costs: CostInputs,
  appliedFees: AppliedFee[] = [],
): ProfitabilityResult | null {
  if (sellingPrice === null || !Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    return null;
  }

  const missingCostFields = COST_FIELDS.filter((field) => costs[field] === null || costs[field] === undefined);

  const costBreakdown = COST_FIELDS.reduce(
    (acc, field) => {
      acc[field] = round2(costs[field] ?? 0);
      return acc;
    },
    {} as Required<Record<keyof CostInputs, number>>,
  );

  const totalCost = round2(Object.values(costBreakdown).reduce((sum, value) => sum + value, 0));
  const estimatedLandedCost = round2(costBreakdown.productCost + costBreakdown.shippingCost + costBreakdown.packagingCost);
  const profitPerUnit = round2(sellingPrice - totalCost);
  const profitMarginPercentage = round2((profitPerUnit / sellingPrice) * 100);
  const roiPercentage = estimatedLandedCost > 0 ? round2((profitPerUnit / estimatedLandedCost) * 100) : null;

  const reliabilityNotes: string[] = [];
  if (costs.productCost === null) {
    reliabilityNotes.push('No supplier/product cost on record — profit is not meaningful until one is supplied.');
  }
  if (missingCostFields.length > 0) {
    reliabilityNotes.push(`Treated as zero because no value was collected: ${missingCostFields.join(', ')}.`);
  }
  if (appliedFees.length === 0 && costs.marketplaceFee === null) {
    reliabilityNotes.push('No marketplace fee schedule matched this marketplace/category.');
  }

  return {
    sellingPrice: round2(sellingPrice),
    costBreakdown,
    missingCostFields,
    appliedFees,
    totalCost,
    estimatedLandedCost,
    profitPerUnit,
    profitMarginPercentage,
    roiPercentage,
    isReliable: costs.productCost !== null,
    reliabilityNotes,
  };
}
