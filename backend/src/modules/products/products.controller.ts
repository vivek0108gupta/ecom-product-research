import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ConfigFilesService } from '../../config/config-files.service';
import { QueryProductsDto } from './dto/query-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly configFiles: ConfigFilesService,
  ) {}

  @Get()
  findRanked(@Query() query: QueryProductsDto) {
    return this.products.findRanked(query);
  }

  @Get('categories')
  categories() {
    return this.configFiles.getCategories();
  }

  /** Side-by-side comparison of up to 5 products. */
  @Get('compare')
  async compare(@Query('ids') ids: string) {
    const list = (ids ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 5);
    return Promise.all(list.map((id) => this.products.findOneDetailed(id)));
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findOneDetailed(id);
  }
}
