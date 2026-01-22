import { Controller, Get } from '@nestjs/common';
import { RelationsService } from './relations.service';

@Controller('api/relations')
export class RelationsController {
  constructor(private relationsService: RelationsService) {}

  @Get('customer-products')
  async getCustomerProducts() {
    return await this.relationsService.getCustomerProducts();
  }
}
