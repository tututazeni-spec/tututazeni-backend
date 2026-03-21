import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { PerformanceService } from './performance.service';

@Controller('performance')
export class PerformanceController {
  constructor(private service: PerformanceService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Get('user/:userId')
  find(@Param('userId') userId: string) {
    return this.service.findByUser(Number(userId));
  }
}

