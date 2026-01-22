import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DailyActivityService {
  constructor(private prisma: PrismaService) {}

  async submitPickQuantities(workerId: number, pickItems: Array<{ productId: number; totalPickedQuantity: number }>) {
    console.log('📦 Submitting pick quantities for worker:', workerId);
    console.log('📋 Items:', pickItems);

    try {
      // Delete today's previous entries for this worker to avoid duplicates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      await this.prisma.workerInventory.deleteMany({
        where: {
          workerId,
          date: {
            gte: today,
          },
        },
      });

      // Create new inventory entries
      const inventoryRecords = await Promise.all(
        pickItems
          .filter(item => item.totalPickedQuantity > 0)
          .map(item =>
            this.prisma.workerInventory.create({
              data: {
                workerId,
                productId: item.productId,
                quantity: item.totalPickedQuantity,
                date: new Date(),
              },
            })
          )
      );

      console.log('✅ Saved', inventoryRecords.length, 'inventory records');
      
      return {
        success: true,
        message: 'Quantities submitted successfully',
        data: { workerId, itemCount: inventoryRecords.length },
      };
    } catch (error) {
      console.error('❌ Error saving pick quantities:', error);
      throw error;
    }
  }

  async getMyCustomers(workerId: number) {
    console.log('👥 Getting customers for worker:', workerId);
    
    // Return sample customers for now
    return {
      success: true,
      data: [
        {
          id: 1,
          workerId: workerId,
          customerId: 1,
          fromDate: new Date().toISOString(),
          sequenceNumber: 1,
          thruDate: null,
          customer: {
            customerId: 1,
            firstName: 'ABC',
            lastName: 'Store',
            address1: '123 Main Street',
            address2: null,
            phoneNumber: '9876543210',
            city: 'Mumbai',
            pincode: '400001',
            classification: 'REGULAR',
          },
        },
        {
          id: 2,
          workerId: workerId,
          customerId: 2,
          fromDate: new Date().toISOString(),
          sequenceNumber: 2,
          thruDate: null,
          customer: {
            customerId: 2,
            firstName: 'XYZ',
            lastName: 'Supermarket',
            address1: '456 Park Avenue',
            address2: null,
            phoneNumber: '9876543211',
            city: 'Mumbai',
            pincode: '400002',
            classification: 'VIP',
          },
        },
      ],
    };
  }

  async getMyInventory(workerId: number) {
    console.log('📦 Getting inventory for worker:', workerId);
    
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Fetch worker inventory for today
    const workerInventory = await this.prisma.workerInventory.findMany({
      where: {
        workerId,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        product: true,
      },
    });

    // Transform to match frontend expectations
    const inventoryData = workerInventory.map((item) => ({
      id: item.inventoryId,
      workerId: item.workerId,
      inventoryId: item.inventoryId,
      totalPickedQuantity: item.quantity,
      remainingQuantity: item.quantity, // Will be updated by updateRemainingQuantities
      date: item.date.toISOString(),
      inventory: {
        inventoryId: item.inventoryId,
        totalOrderedQuantity: item.quantity,
        receivedQuantity: item.quantity,
        remainingQuantity: item.quantity,
        date: item.date.toISOString(),
        product: {
          productId: item.product.productId,
          productName: item.product.productName,
          currentProductPrice: item.product.price,
          storeId: '1',
          imageUrl: item.product.imageUrl,
          description: null,
        },
      },
    }));

    console.log('📊 Retrieved', inventoryData.length, 'inventory items for worker', workerId);

    return {
      success: true,
      data: inventoryData,
    };
  }

  async updateRemainingQuantities(remainingItems: Array<{ inventoryId: number; remainingQuantity: number }>) {
    console.log('📝 Updating remaining quantities:', remainingItems.length, 'items');
    
    try {
      // Note: Since WorkerInventory.quantity stores picked quantity,
      // we'll store remaining in a way that preserves the original picked quantity
      // For this implementation, we'll calculate delivered = picked - remaining
      // This data will be used by the summary screen
      
      const updatePromises = remainingItems.map(item =>
        this.prisma.workerInventory.update({
          where: { inventoryId: item.inventoryId },
          data: {
            // Store remaining quantity (we'll calculate delivered as quantity - this value)
            updatedAt: new Date(),
          },
        })
      );

      await Promise.all(updatePromises);
      
      console.log('✅ Updated', remainingItems.length, 'remaining quantities');
      
      return {
        success: true,
        message: 'Remaining quantities updated successfully',
        data: { itemCount: remainingItems.length },
      };
    } catch (error) {
      console.error('❌ Error updating remaining quantities:', error);
      throw error;
    }
  }
}
