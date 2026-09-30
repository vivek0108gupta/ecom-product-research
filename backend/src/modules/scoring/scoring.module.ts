import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../../database/entities/product.entity';
import { ProductScore } from '../../database/entities/product-score.entity';
import { ProfitabilityModule } from '../profitability/profitability.module';
import { ScoringController } from './scoring.controller';
import { ScoringService } from './scoring.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductScore]), ProfitabilityModule],
  controllers: [ScoringController],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
