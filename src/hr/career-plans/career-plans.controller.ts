import { Controller, Get, Param } from '@nestjs/common';
import { CareerPlansService } from './career-plans.service';

@Controller('career-plans')
export class CareerPlansController {
  constructor(private readonly service: CareerPlansService) {}

  @Get()
  getAllCareerPlans() {
    return this.service.getAllCareerPlans();
  }

  @Get('employee/:employeeId')
  getCareerPlansByEmployee(@Param('employeeId') employeeId: string) {
    return this.service.getCareerPlansByEmployee(employeeId);
  }

  @Get('feedback360/:employeeId')
  getFeedback360(@Param('employeeId') employeeId: string) {
    return this.service.getFeedback360ForEmployee(employeeId);
  }

  @Get('feedback360/:employeeId/summary')
  getFeedback360Summary(@Param('employeeId') employeeId: string) {
    return this.service.getFeedback360Summary(employeeId);
  }
}