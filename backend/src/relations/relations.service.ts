import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RelationsService {
  constructor(private prisma: PrismaService) {}

  async getCustomerProducts() {
    console.log('🔗 Getting customer-product relations');
    
    const products = await this.prisma.product.findMany();
    const customers = await this.prisma.customer.findMany();

    // Create relations for all customers with all products
    const relations = [];
    let id = 1;
    
    for (const customer of customers) {
      for (const product of products) {
        relations.push({
          id: id++,
          customerId: customer.customerId,
          productId: product.productId,
          thruDate: null, // null means active relation
        });
      }
    }

    return {
      success: true,
      data: relations,
    };
  }
}
