import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DailyActivityModule } from './daily-activity/daily-activity.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RelationsModule } from './relations/relations.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    WorkersModule,
    ProductsModule,
    DailyActivityModule,
    RelationsModule,
    DeliveriesModule,
  ],
})
export class AppModule {}
