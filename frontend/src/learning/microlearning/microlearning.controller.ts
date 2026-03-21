import { Controller, Post, Body, Param, Patch } from '@nestjs/common';
import { MicroLearningService } from './microlearning.service';

@Controller('micro-learning')
export class MicroLearningController {
  constructor(private service: MicroLearningService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Post(':id/dispatch/:userId')
  dispatch(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.service.dispatchToUser(Number(id), Number(userId));
  }

  @Patch('view/:dispatchId')
  markViewed(@Param('dispatchId') dispatchId: string) {
    return this.service.markAsViewed(Number(dispatchId));
  }
}

