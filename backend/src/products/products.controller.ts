import { Controller, Get } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('api/products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  async getAll() {
    const products = await this.productsService.getAllProducts();
    return { success: true, data: products };
  }

  @Get('products-with-latest-inventory')
  async getProductsWithInventory() {
    const products = await this.productsService.getProductsWithLatestInventory();
    return { success: true, data: products };
  }
}
