import { Controller, Get, Param } from '@nestjs/common';
import { WorkersService } from './workers.service';

@Controller('api/workers')
export class WorkersController {
  constructor(private workersService: WorkersService) {}

  @Get(':id/inventory')
  async getInventory(@Param('id') id: string) {
    const inventory = await this.workersService.getWorkerInventory(+id);
    return { success: true, data: inventory };
  }
}
