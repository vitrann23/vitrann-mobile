import { Body, Controller, Delete, Get, Headers, Post } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';

@Controller('api/deliveries')
export class DeliveriesController {
  constructor(private deliveriesService: DeliveriesService) {}

  @Get('total-amount')
  async getTotalAmount(@Headers('authorization') auth: string) {
    // Extract workerId from dummy token
    const workerId = auth?.split('-').pop() ? parseInt(auth.split('-').pop() || '1') : 1;
    console.log('📥 Get total amount request for worker:', workerId);
    return await this.deliveriesService.getTotalAmount(workerId);
  }

  @Post('total-amount')
  async submitTotalAmount(
    @Body() body: { amount: number },
    @Headers('authorization') auth: string
  ) {
    // Extract workerId from dummy token
    const workerId = auth?.split('-').pop() ? parseInt(auth.split('-').pop() || '1') : 1;
    console.log('📥 Received total amount submission:', body.amount, 'from worker:', workerId);
    return await this.deliveriesService.submitTotalAmount(body.amount, workerId);
  }

  @Post('process')
  async processDelivery(
    @Body() deliveryDto: any,
    @Headers('authorization') auth: string
  ) {
    // Extract workerId from dummy token
    const workerId = auth?.split('-').pop() ? parseInt(auth.split('-').pop() || '1') : 1;
    console.log('📥 Received delivery processing request:', deliveryDto, 'from worker:', workerId);
    return await this.deliveriesService.processDelivery(deliveryDto, workerId);
  }

  @Delete('clear-today')
  async clearTodayData(@Headers('authorization') auth: string) {
    // Extract workerId from dummy token
    const workerId = auth?.split('-').pop() ? parseInt(auth.split('-').pop() || '1') : 1;
    console.log('🗑️ Clear today\'s data request for worker:', workerId);
    return await this.deliveriesService.clearTodayData(workerId);
  }
}
