import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Post()
  log(@Body() body: any) {
    return this.service.logNotification(body);
  }

  @Get('user/:userId')
  find(@Param('userId') userId: string) {
    return this.service.findByUser(Number(userId));
  }
}
