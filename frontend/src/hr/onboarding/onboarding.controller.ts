import { Controller, Post, Body, Get } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(private service: OnboardingService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.createPlan(body);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
