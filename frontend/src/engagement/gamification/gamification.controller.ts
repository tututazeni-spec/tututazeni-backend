import { Controller, Post, Param, Get } from '@nestjs/common';
import { GamificationService } from './gamification.service';

@Controller('gamification')
export class GamificationController {
  constructor(private service: GamificationService) {}

  @Post('add/:userId/:points')
  add(
    @Param('userId') userId: string,
    @Param('points') points: string,
  ) {
    return this.service.addPoints(Number(userId), Number(points));
  }

  @Get('ranking')
  ranking() {
    return this.service.ranking();
  }
}

