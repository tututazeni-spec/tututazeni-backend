import { AnyAuthenticated } from '../common/decorators/authz.decorators';
import { Controller, Post, Body, Param, Patch, Get, ParseIntPipe } from '@nestjs/common';
import { MobileService } from './mobile.service';
import { CurrentUser, CurrentUserData } from '../common/decorators';
import { RegisterSessionDto, UpdatePushTokenDto, LogSyncDto } from './mobile.dto';

@Controller('mobile')
export class MobileController {
  constructor(private mobileService: MobileService) {}

  @Post('session')
  @AnyAuthenticated()
  registerSession(@Body() dto: RegisterSessionDto, @CurrentUser() user: CurrentUserData) {
    return this.mobileService.registerSession(user.id, dto.deviceId, dto.platform, dto.pushToken);
  }

  @Patch('session/:id/push-token')
  @AnyAuthenticated()
  updatePushToken(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePushTokenDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.mobileService.updatePushToken(id, dto.pushToken, user.id);
  }

  @Post('sync-log')
  @AnyAuthenticated()
  logSync(@Body() dto: LogSyncDto, @CurrentUser() user: CurrentUserData) {
    return this.mobileService.logSync(user.id, dto.entity, dto.status);
  }

  @Get('dashboard')
  @AnyAuthenticated()
  getDashboard(@CurrentUser() user: CurrentUserData) {
    return this.mobileService.getUserMobileDashboard(user.id);
  }
}
