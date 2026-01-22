import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService) {}

  async submitTotalAmount(amount: number, workerId: number) {
    console.log('💰 Submitting total amount:', amount, 'for worker:', workerId);
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Delete today's previous cash submission to avoid duplicates
      await this.prisma.cashSubmission.deleteMany({
        where: {
          workerId,
          date: {
            gte: today,
            lt: tomorrow,
          },
        },
      });

      // Create new cash submission
      const cashSubmission = await this.prisma.cashSubmission.create({
        data: {
          workerId,
          amount,
          date: new Date(),
        },
      });

      console.log('✅ Cash submission saved:', cashSubmission);
      
      return {
        success: true,
        message: 'Amount submitted successfully',
        data: {
          amount,
          workerId,
          submittedAt: cashSubmission.date.toISOString(),
        },
      };
    } catch (error) {
      console.error('❌ Error saving cash submission:', error);
      throw error;
    }
  }

  async getTotalAmount(workerId: number) {
    console.log('💰 Getting total amount for worker:', workerId);
    
    try {
      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get today's cash submission (what worker actually submitted)
      const cashSubmission = await this.prisma.cashSubmission.findFirst({
        where: {
          workerId,
          date: {
            gte: today,
            lt: tomorrow,
          },
        },
        orderBy: {
          date: 'desc',
        },
      });

      if (cashSubmission) {
        console.log('💵 Found cash submission:', cashSubmission.amount);
        return {
          success: true,
          data: {
            id: cashSubmission.cashId,
            amount: cashSubmission.amount,
            workerId,
            date: cashSubmission.date.toISOString(),
          },
        };
      } else {
        // If no cash submitted yet, calculate from deliveries
        const deliveries = await this.prisma.delivery.findMany({
          where: {
            workerId,
            deliveryDate: {
              gte: today,
              lt: tomorrow,
            },
          },
          include: {
            items: true,
          },
        });

        const totalCash = deliveries.reduce((sum, delivery) => sum + delivery.totalAmount, 0);

        console.log('💵 No cash submission, calculated from', deliveries.length, 'deliveries:', totalCash);
        
        return {
          success: true,
          data: {
            id: 0,
            amount: totalCash,
            workerId,
            date: new Date().toISOString(),
          },
        };
      }
    } catch (error) {
      console.error('❌ Error getting total amount:', error);
      throw error;
    }
  }

  async processDelivery(deliveryDto: any, workerId: number) {
    console.log('📦 Processing delivery:', deliveryDto, 'for worker:', workerId);
    
    try {
      // Get the product ID from the inventory
      const inventory = await this.prisma.workerInventory.findUnique({
        where: { inventoryId: deliveryDto.inventoryId },
      });

      if (!inventory) {
        console.log('❌ Inventory not found:', deliveryDto.inventoryId);
        return {
          success: false,
          message: 'Inventory not found',
          isDuplicate: false,
        };
      }

      const productId = inventory.productId;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if delivery already exists for this customer/product/worker today
      const existingDelivery = await this.prisma.delivery.findFirst({
        where: {
          workerId,
          customerId: deliveryDto.customerId,
          deliveryDate: {
            gte: today,
          },
          items: {
            some: {
              productId,
            },
          },
        },
        include: { items: true },
      });

      if (existingDelivery) {
        console.log('ℹ️ Duplicate delivery detected, skipping');
        return {
          success: true,
          message: 'Delivery already recorded',
          isDuplicate: true,
        };
      }

      // Create or update delivery record
      let delivery = await this.prisma.delivery.findFirst({
        where: {
          workerId,
          customerId: deliveryDto.customerId,
          deliveryDate: {
            gte: today,
          },
        },
      });

      if (!delivery) {
        delivery = await this.prisma.delivery.create({
          data: {
            workerId,
            customerId: deliveryDto.customerId,
            totalAmount: deliveryDto.billAmount,
            isPaid: false,
          },
        });
      } else {
        // Update total amount
        delivery = await this.prisma.delivery.update({
          where: { deliveryId: delivery.deliveryId },
          data: {
            totalAmount: delivery.totalAmount + deliveryDto.billAmount,
          },
        });
      }

      // Create delivery item
      await this.prisma.deliveryItem.create({
        data: {
          deliveryId: delivery.deliveryId,
          productId,
          quantity: deliveryDto.deliveredQuantity,
          price: deliveryDto.billAmount,
        },
      });

      console.log('✅ Delivery processed successfully');
      
      return {
        success: true,
        message: 'Delivery processed successfully',
        isDuplicate: false,
        data: {
          deliveryId: delivery.deliveryId,
          customerId: deliveryDto.customerId,
          productId,
          deliveredQuantity: deliveryDto.deliveredQuantity,
          billAmount: deliveryDto.billAmount,
          workerId,
          processedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('❌ Error processing delivery:', error);
      throw error;
    }
  }

  async clearTodayData(workerId: number) {
    console.log('🗑️ Clearing today\'s data for worker:', workerId);
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Delete today's deliveries and their items
      const deletedDeliveries = await this.prisma.delivery.deleteMany({
        where: {
          workerId,
          deliveryDate: {
            gte: today,
            lt: tomorrow,
          },
        },
      });

      // Delete today's worker inventory
      const deletedInventory = await this.prisma.workerInventory.deleteMany({
        where: {
          workerId,
          date: {
            gte: today,
            lt: tomorrow,
          },
        },
      });

      console.log('✅ Cleared', deletedDeliveries.count, 'deliveries and', deletedInventory.count, 'inventory records');
      
      return {
        success: true,
        message: 'Today\'s data cleared successfully',
        data: {
          deliveriesDeleted: deletedDeliveries.count,
          inventoryDeleted: deletedInventory.count,
        },
      };
    } catch (error) {
      console.error('❌ Error clearing today\'s data:', error);
      throw error;
    }
  }
}
