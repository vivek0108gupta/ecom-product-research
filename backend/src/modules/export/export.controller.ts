import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { QueryProductsDto } from '../products/dto/query-products.dto';
import { ExportService } from './export.service';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(@Query() query: QueryProductsDto, @Res() res: Response): Promise<void> {
    const csv = await this.exportService.toCsv(query);
    const filename = `product-opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('json')
  json(@Query() query: QueryProductsDto) {
    return this.exportService.getRows(query);
  }
}
