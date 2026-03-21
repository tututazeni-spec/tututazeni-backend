import { Controller, Get, Post } from '@nestjs/common';
import { ScalabilityService } from './scalability.service';

@Controller('scalability')
export class ScalabilityController {
  constructor(private readonly service: ScalabilityService) {}

  @Get('total-users')
  totalUsers() {
    return this.service.totalUsers();
  }

  @Get('active-users')
  activeUsers() {
    return this.service.activeUsers();
  }

  @Get('top-courses')
  topCourses() {
    return this.service.topCoursesByReach();
  }

  @Post('snapshot')
  createSnapshot() {
    return this.service.createSnapshot();
  }

  @Get('snapshots')
  snapshots() {
    return this.service.getSnapshots();
  }
}