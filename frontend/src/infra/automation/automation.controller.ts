import { Controller, Post, Body, Get } from '@nestjs/common';
import { AutomationService } from './automation.service';

@Controller('automation')
export class AutomationController {
  constructor(private service: AutomationService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.createRule(body);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
