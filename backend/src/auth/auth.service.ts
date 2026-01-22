import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async workerLogin(phoneNumber: string, password: string) {
    console.log('🔍 Login attempt with phone:', phoneNumber);
    
    // Find worker by phone number
    const worker = await this.prisma.worker.findFirst({
      where: { phoneNumber },
      include: { user: true },
    });

    console.log('📋 Worker found:', worker ? 'Yes' : 'No');

    if (!worker || !worker.user) {
      console.log('❌ No worker found with phone:', phoneNumber);
      throw new Error('Invalid credentials');
    }

    console.log('🔐 Comparing password...');
    const isValid = await bcrypt.compare(password, worker.user.passwordHash);
    console.log('✅ Password valid:', isValid);

    if (!isValid) {
      console.log('❌ Invalid password');
      throw new Error('Invalid credentials');
    }

    console.log('✅ Login successful for worker:', worker.workerId);
    return {
      token: 'dummy-token-' + worker.workerId,
      userType: 'worker',
      worker: {
        workerId: worker.workerId,
        firstName: worker.firstName,
        lastName: worker.lastName,
        phoneNumber: worker.phoneNumber,
      },
    };
  }
}
