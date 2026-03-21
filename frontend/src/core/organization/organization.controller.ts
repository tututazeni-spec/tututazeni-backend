import { Controller, Post, Body } from '@nestjs/common';
import { OrganizationService } from './organization.service';

@Controller('organization')
export class OrganizationController {
  constructor(private service: OrganizationService) {}

  @Post('department')
  createDepartment(@Body() body: any) {
    return this.service.createDepartment(body);
  }

  @Post('unit')
  createUnit(@Body() body: any) {
    return this.service.createUnit(body);
  }
}
