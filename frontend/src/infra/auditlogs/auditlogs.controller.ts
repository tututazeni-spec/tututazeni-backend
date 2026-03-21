import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { AuditLogsService } from './auditlogs.service';

@Controller('audit')
export class AuditLogsController {
  constructor(private service: AuditLogsService) {}

  @Post()
  log(@Body() body: any) {
    return this.service.log(body);
  }

  @Get('user/:userId')
  find(@Param('userId') userId: string) {
    return this.service.findByUser(Number(userId));
  }
}
