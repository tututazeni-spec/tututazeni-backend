import { Controller, Post, Body, Param, Patch, Get, ParseIntPipe } from '@nestjs/common';
import { MobileService } from './mobile.service';
import { CurrentUser, CurrentUserData } from '../common/decorators';

@Controller('mobile')
export class MobileController {
  constructor(private mobileService: MobileService) {}

  @Post('session')
  registerSession(
    @Body('deviceId') deviceId: string,
    @Body('platform') platform: string,
    @CurrentUser() user: CurrentUserData,
    @Body('pushToken') pushToken?: string,
  ) {
    return this.mobileService.registerSession(user.id, deviceId, platform, pushToken);
  }

  @Patch('session/:id/push-token')
  updatePushToken(
    @Param('id', ParseIntPipe) id: number,
    @Body('pushToken') pushToken: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.mobileService.updatePushToken(id, pushToken, user.id);
  }

  @Post('sync-log')
  logSync(
    @Body('entity') entity: string,
    @Body('status') status: 'SUCCESS' | 'FAILED',
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.mobileService.logSync(user.id, entity, status);
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: CurrentUserData) {
    return this.mobileService.getUserMobileDashboard(user.id);
  }
}
