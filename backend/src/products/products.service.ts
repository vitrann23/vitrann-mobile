import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async getAllProducts() {
    return await this.prisma.product.findMany({
      orderBy: { productName: 'asc' },
    });
  }

  async getProductsWithLatestInventory() {
    const products = await this.prisma.product.findMany({
      orderBy: { productName: 'asc' },
    });

    // Transform to match frontend expectations
    // For morning stock, we just need product info - no inventory lookup needed
    return products.map(product => ({
      productId: product.productId,
      productName: product.productName,
      currentProductPrice: product.price.toString(),
      lastProductPrice: product.price.toString(),
      imageUrl: product.imageUrl || '',
      description: '',
      storeId: '1',
      inventory: {
        inventoryId: product.productId, // Use productId as placeholder
        date: new Date().toISOString(),
      },
    }));
  }
}
