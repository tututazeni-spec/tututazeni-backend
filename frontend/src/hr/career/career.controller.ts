import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CareerService } from './career.service';

@Controller('career')
export class CareerController {
  constructor(private readonly service: CareerService) {}

  @Post('position')
  createPosition(@Body() data: Prisma.CareerPositionCreateInput) {
    return this.service.createPosition(data);
  }

  @Post('competency')
  createCompetency(@Body() data: Prisma.CompetencyCreateInput) {
    return this.service.createCompetency(data);
  }

  @Post('position-competency')
  addCompetency(@Body() data: Prisma.PositionCompetencyCreateInput) {
    return this.service.addCompetencyToPosition(data);
  }

  @Post('assign')
  assignPosition(@Body() data: Prisma.UserCareerCreateInput) {
    return this.service.assignPositionToUser(data);
  }

  @Get('user/:userId')
  getUserCareer(@Param('userId') userId: string) {
    return this.service.getUserCareerHistory(Number(userId));
  }

  @Get('positions')
  listPositions() {
    return this.service.listPositions();
  }
}