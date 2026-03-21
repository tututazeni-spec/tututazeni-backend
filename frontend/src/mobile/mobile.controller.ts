import { Controller, Post, Body, Param, Patch, Get } from '@nestjs/common';
import { MobileService } from './mobile.service';

@Controller('mobile')
export class MobileController {
  constructor(private mobileService: MobileService) {}

  @Post('session')
  registerSession(
    @Body('userId') userId: number,
    @Body('deviceId') deviceId: string,
    @Body('platform') platform: string,
    @Body('pushToken') pushToken?: string,
  ) {
    return this.mobileService.registerSession(userId, deviceId, platform, pushToken);
  }

  @Patch('session/:id/push-token')
  updatePushToken(@Param('id') id: number, @Body('pushToken') pushToken: string) {
    return this.mobileService.updatePushToken(id, pushToken);
  }

  @Post('sync-log')
  logSync(@Body('userId') userId: number, @Body('entity') entity: string, @Body('status') status: 'SUCCESS' | 'FAILED') {
    return this.mobileService.logSync(userId, entity, status);
  }

  @Get('dashboard/:userId')
  getDashboard(@Param('userId') userId: number) {
    return this.mobileService.getUserMobileDashboard(userId);
  }
}