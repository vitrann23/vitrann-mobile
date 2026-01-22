import { Body, Controller, Get, Headers, Post, Put } from '@nestjs/common';
import { DailyActivityService } from './daily-activity.service';

@Controller('api/daily-activity-ci')
export class DailyActivityController {
  constructor(private dailyActivityService: DailyActivityService) {}

  @Get('my-customers')
  async getMyCustomers(@Headers('authorization') auth: string) {
    // Extract workerId from dummy token (format: "Bearer dummy-token-1")
    const workerId = auth?.split('-').pop() ? parseInt(auth.split('-').pop() || '1') : 1;
    console.log('📥 Get my customers request for worker:', workerId);
    return await this.dailyActivityService.getMyCustomers(workerId);
  }

  @Get('my-inventory')
  async getMyInventory(@Headers('authorization') auth: string) {
    // Extract workerId from dummy token
    const workerId = auth?.split('-').pop() ? parseInt(auth.split('-').pop() || '1') : 1;
    console.log('📥 Get my inventory request for worker:', workerId);
    return await this.dailyActivityService.getMyInventory(workerId);
  }
}

// Separate controller for different route prefix
@Controller('api/daily-activity-wi')
export class DailyActivityWiController {
  constructor(private dailyActivityService: DailyActivityService) {}

  @Post('pick-quantities')
  async pickQuantities(
    @Body() body: { 
      workerId: number; 
      pickItems: Array<{ productId: number; totalPickedQuantity: number }> 
    }
  ) {
    console.log('📥 Received pick quantities request:', body);
    return await this.dailyActivityService.submitPickQuantities(body.workerId, body.pickItems);
  }

  @Put('remaining-quantities')
  async updateRemainingQuantities(
    @Body() body: { 
      remainingItems: Array<{ inventoryId: number; remainingQuantity: number }> 
    }
  ) {
    console.log('📥 Received remaining quantities update:', body);
    return await this.dailyActivityService.updateRemainingQuantities(body.remainingItems);
  }
}
