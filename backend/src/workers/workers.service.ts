import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkersService {
  constructor(private prisma: PrismaService) {}

  async getWorkerInventory(workerId: number) {
    const inventory = await this.prisma.workerInventory.findMany({
      where: { workerId },
      include: {
        product: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return inventory;
  }
}
