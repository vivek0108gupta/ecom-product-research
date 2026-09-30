import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigFilesService } from '../../config/config-files.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

describe('ProductsController', () => {
  let controller: ProductsController;
  const findRanked = jest.fn();
  const findOneDetailed = jest.fn();

  beforeEach(async () => {
    findRanked.mockReset();
    findOneDetailed.mockReset();

    const moduleRef = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: { findRanked, findOneDetailed } },
        { provide: ConfigFilesService, useValue: { getCategories: () => [{ slug: 'car-accessories', label: 'Car Accessories' }] } },
      ],
    }).compile();

    controller = moduleRef.get(ProductsController);
  });

  it('passes filters through to the service and returns the ranked payload', async () => {
    findRanked.mockResolvedValue({ total: 1, rows: [{ rank: 1, name: 'Packing Cubes' }] });

    const result = await controller.findRanked({ category: ['travel-accessories'], scoreMin: 70 });

    expect(findRanked).toHaveBeenCalledWith({ category: ['travel-accessories'], scoreMin: 70 });
    expect(result.total).toBe(1);
  });

  it('serves the configured category list', () => {
    expect(controller.categories()).toEqual([{ slug: 'car-accessories', label: 'Car Accessories' }]);
  });

  it('propagates a not-found for an unknown product', async () => {
    findOneDetailed.mockRejectedValue(new NotFoundException());

    await expect(controller.findOne('4b1c6e2e-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('compare', () => {
    beforeEach(() => findOneDetailed.mockImplementation(async (id: string) => ({ id })));

    it('returns one detail payload per requested id', async () => {
      const result = await controller.compare('id-1,id-2,id-3');

      expect(result).toHaveLength(3);
      expect(findOneDetailed).toHaveBeenCalledTimes(3);
    });

    it('caps the comparison at 5 products', async () => {
      const result = await controller.compare('a,b,c,d,e,f,g');

      expect(result).toHaveLength(5);
    });

    it('ignores empty and whitespace-only ids', async () => {
      const result = await controller.compare('a, ,,b');

      expect(result).toHaveLength(2);
    });

    it('returns nothing for an empty query', async () => {
      expect(await controller.compare('')).toEqual([]);
    });
  });
});
