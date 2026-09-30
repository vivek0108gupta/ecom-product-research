import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceFee } from '../../database/entities/marketplace-fee.entity';
import { ProfitabilityService } from './profitability.service';

@Module({
  imports: [TypeOrmModule.forFeature([MarketplaceFee])],
  providers: [ProfitabilityService],
  exports: [ProfitabilityService],
})
export class ProfitabilityModule {}
