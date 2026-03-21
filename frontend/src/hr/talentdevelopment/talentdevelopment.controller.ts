import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { TalentDevelopmentService } from './talentdevelopment.service';

@Controller('talent-development')
export class TalentDevelopmentController {
  constructor(private readonly service: TalentDevelopmentService) {}

  @Post('competency')
  createCompetency(@Body() body: any) {
    return this.service.createCompetency(body);
  }

  @Get('competencies')
  getCompetencies() {
    return this.service.getCompetencies();
  }

  @Post('assign')
  assignCompetency(@Body() body: any) {
    return this.service.assignCompetencyToUser(body);
  }

  @Get('user/:id')
  getUserCompetencies(@Param('id') id: string) {
    return this.service.getUserCompetencies(Number(id));
  }

  @Post('plan')
  createPlan(@Body() body: any) {
    return this.service.createDevelopmentPlan(body);
  }

  @Get('plans/:id')
  getPlans(@Param('id') id: string) {
    return this.service.getDevelopmentPlans(Number(id));
  }
}