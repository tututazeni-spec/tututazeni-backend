import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { AiTutorService } from './ai-tutor.service';

@Controller('ai-tutor')
export class AiTutorController {
  constructor(private readonly service: AiTutorService) {}

  @Post('start')
  startSession(
    @Body('userId') userId: number,
    @Body('courseId') courseId?: number,
    @Body('enrollmentId') enrollmentId?: number,
  ) {
    return this.service.startSession(userId, courseId, enrollmentId);
  }

  @Post('message/:sessionId')
  sendMessage(
    @Param('sessionId') sessionId: string,
    @Body('message') message: string,
  ) {
    return this.service.sendMessage(Number(sessionId), message);
  }

  @Get('history/:sessionId')
  getHistory(@Param('sessionId') sessionId: string) {
    return this.service.getSessionHistory(Number(sessionId));
  }
}