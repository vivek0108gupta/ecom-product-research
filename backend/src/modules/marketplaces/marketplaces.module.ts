import { Controller, Get, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Marketplace } from '../../database/entities/marketplace.entity';
import { MarketplaceFee } from '../../database/entities/marketplace-fee.entity';

@Controller('marketplaces')
export class MarketplacesController {
  constructor(
    @InjectRepository(Marketplace) private readonly marketplaceRepo: Repository<Marketplace>,
    @InjectRepository(MarketplaceFee) private readonly feeRepo: Repository<MarketplaceFee>,
  ) {}

  @Get()
  list() {
    return this.marketplaceRepo.find({ order: { name: 'ASC' } });
  }

  /** The fee assumptions currently in force, with the source and effective date of each. */
  @Get('fees')
  fees() {
    return this.feeRepo.find({ relations: { marketplace: true }, order: { effectiveDate: 'DESC' } });
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Marketplace, MarketplaceFee])],
  controllers: [MarketplacesController],
})
export class MarketplacesModule {}
