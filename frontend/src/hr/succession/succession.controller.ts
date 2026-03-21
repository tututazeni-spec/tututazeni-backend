import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { SuccessionService } from './succession.service';

@Controller('succession')
export class SuccessionController {
  constructor(private service: SuccessionService) {}

  @Post()
  add(@Body() body: any) {
    return this.service.addCandidate(body);
  }

  @Get('position/:positionId')
  find(@Param('positionId') positionId: string) {
    return this.service.findByPosition(Number(positionId));
  }
}
