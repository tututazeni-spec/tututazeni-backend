import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../common/decorators';
import { MetricsTokenGuard } from './metrics-token.guard';

// @Public salta o JwtAuthGuard global; @SkipThrottle evita rate-limit dos scrapes;
// MetricsTokenGuard faz a autorização própria por token.
@Controller('metrics')
@Public()
@SkipThrottle()
@UseGuards(MetricsTokenGuard)
export class MetricsController extends PrometheusController {
  @Get()
  async index(@Res({ passthrough: true }) response: Response): Promise<string> {
    return super.index(response);
  }
}
