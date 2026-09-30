import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeType, PERCENTAGE_FEE_TYPES } from '../../common/interfaces/enums';
import { MarketplaceFee } from '../../database/entities/marketplace-fee.entity';
import { ProductCost } from '../../database/entities/product-cost.entity';
import { calculateProfitability } from './profit-calculator';
import { AppliedFee, CostInputs, ProfitabilityResult } from './profitability.types';

const round2 = (value: number): number => Math.round(value * 100) / 100;

@Injectable()
export class ProfitabilityService {
  constructor(
    @InjectRepository(MarketplaceFee) private readonly feeRepo: Repository<MarketplaceFee>,
  ) {}

  /**
   * Resolves the fee schedule in force for a marketplace/category: for each fee type,
   * the row with the latest effectiveDate that is not in the future. Category-specific
   * rows beat the 'default' row. Returns [] when nothing matches — we never guess a rate.
   */
  async resolveFees(marketplaceId: string, category: string, sellingPrice: number): Promise<AppliedFee[]> {
    const rows = await this.feeRepo
      .createQueryBuilder('fee')
      .where('fee.marketplace_id = :marketplaceId', { marketplaceId })
      .andWhere('fee.category IN (:...categories)', { categories: [category, 'default'] })
      .andWhere('fee.effectiveDate <= CURRENT_DATE')
      .orderBy('fee.effectiveDate', 'DESC')
      .getMany();

    const bestPerType = new Map<string, MarketplaceFee>();
    for (const row of rows) {
      const existing = bestPerType.get(row.feeType);
      if (!existing) {
        bestPerType.set(row.feeType, row);
        continue;
      }
      const existingIsDefault = existing.category === 'default';
      const rowIsSpecific = row.category !== 'default';
      if (existingIsDefault && rowIsSpecific) {
        bestPerType.set(row.feeType, row);
      }
    }

    return [...bestPerType.values()].map((row) => {
      const value = Number.parseFloat(row.feeValue);
      const isPercentage = PERCENTAGE_FEE_TYPES.has(row.feeType);
      return {
        feeType: row.feeType,
        percentage: isPercentage ? value : null,
        amountInr: round2(isPercentage ? (sellingPrice * value) / 100 : value),
        source: row.source,
        effectiveDate: row.effectiveDate,
        category: row.category,
      };
    });
  }

  /**
   * Full profitability for one product: resolves marketplace fees from the fee table,
   * layers on the product's own cost record, then runs the pure calculator.
   * Explicit per-product overrides always win over the resolved schedule.
   */
  async calculateForProduct(params: {
    marketplaceId: string;
    category: string;
    sellingPrice: number | null;
    cost: ProductCost | null;
  }): Promise<ProfitabilityResult | null> {
    const { marketplaceId, category, sellingPrice, cost } = params;
    if (sellingPrice === null) {
      return null;
    }

    const appliedFees = await this.resolveFees(marketplaceId, category, sellingPrice);

    const gatewayFees = appliedFees.filter((fee) => fee.feeType === FeeType.PAYMENT_GATEWAY_PERCENTAGE);
    const sellingFees = appliedFees.filter((fee) => fee.feeType !== FeeType.PAYMENT_GATEWAY_PERCENTAGE);

    const sumOf = (fees: AppliedFee[]): number | null =>
      fees.length === 0 ? null : round2(fees.reduce((sum, fee) => sum + fee.amountInr, 0));

    const costInputs: CostInputs = {
      productCost: cost?.productCost ?? null,
      shippingCost: cost?.shippingCost ?? null,
      packagingCost: cost?.packagingCost ?? null,
      marketplaceFee: cost?.marketplaceFeeOverride ?? sumOf(sellingFees),
      paymentFee: cost?.paymentFee ?? sumOf(gatewayFees),
      advertisingCost: cost?.advertisingCost ?? null,
      returnAllowance: cost?.returnAllowance ?? null,
      otherCosts: cost?.otherCosts ?? null,
    };

    return calculateProfitability(sellingPrice, costInputs, appliedFees);
  }
}
