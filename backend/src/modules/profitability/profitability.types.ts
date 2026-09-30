/** All amounts INR per unit. */
export interface CostInputs {
  productCost: number | null;
  shippingCost: number | null;
  packagingCost: number | null;
  marketplaceFee: number | null;
  paymentFee: number | null;
  advertisingCost: number | null;
  returnAllowance: number | null;
  otherCosts: number | null;
}

export interface AppliedFee {
  feeType: string;
  /** Percentage value as configured, when the fee is percentage-based. */
  percentage: number | null;
  /** Resolved INR amount for this product's selling price. */
  amountInr: number;
  source: string;
  effectiveDate: string;
  category: string;
}

export interface ProfitabilityResult {
  sellingPrice: number;
  /** Everything deducted from the selling price, itemized. */
  costBreakdown: Required<Record<keyof CostInputs, number>>;
  /** Cost fields that had no data and were therefore treated as 0 in the arithmetic. */
  missingCostFields: Array<keyof CostInputs>;
  appliedFees: AppliedFee[];
  totalCost: number;
  /** Cost of goods landed in hand: product + shipping + packaging. Excludes selling fees and ads. */
  estimatedLandedCost: number;
  profitPerUnit: number;
  profitMarginPercentage: number;
  /** Return on the cash actually put into the unit (landed cost), not on revenue. */
  roiPercentage: number | null;
  /**
   * False when a required input (selling price or product cost) was missing.
   * A result flagged unreliable must be displayed as "Data unavailable", not as a number.
   */
  isReliable: boolean;
  reliabilityNotes: string[];
}
