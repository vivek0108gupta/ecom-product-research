import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [ProductsModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
