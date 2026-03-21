import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { RoiImpactService } from './roiimpact.service';

@Controller('roi-impact')
export class RoiImpactController {
  constructor(private service: RoiImpactService) {}

  @Post('metric')
  register(@Body() body: any) {
    return this.service.registerMetric(body);
  }

  @Get('unit/:unitId')
  getMetrics(@Param('unitId') unitId: string) {
    return this.service.getUnitMetrics(Number(unitId));
  }
}

