import { Module } from '@nestjs/common';
import { DailyActivityController, DailyActivityWiController } from './daily-activity.controller';
import { DailyActivityService } from './daily-activity.service';

@Module({
  controllers: [DailyActivityController, DailyActivityWiController],
  providers: [DailyActivityService],
})
export class DailyActivityModule {}
