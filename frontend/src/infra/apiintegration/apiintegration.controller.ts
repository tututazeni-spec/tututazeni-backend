import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiIntegrationService } from './apiintegration.service';

@Controller('integrations')
export class ApiIntegrationController {
  constructor(private service: ApiIntegrationService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.createIntegration(body);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
