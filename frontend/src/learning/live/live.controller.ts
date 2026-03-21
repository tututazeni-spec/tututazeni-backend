import { Controller, Post, Body, Param } from '@nestjs/common';
import { LiveService } from './live.service';

@Controller('live')
export class LiveController {
  constructor(private readonly service: LiveService) {}

  @Post('create')
  create(
    @Body('courseId') courseId: number,
    @Body('topic') topic: string,
    @Body('scheduledAt') scheduledAt: Date,
  ) {
    return this.service.createZoomMeeting(courseId, topic, scheduledAt);
  }

  @Post('attendance')
  attendance(
    @Body('liveClassId') liveClassId: number,
    @Body('userId') userId: number,
  ) {
    return this.service.registerAttendance(liveClassId, userId);
  }

  @Post('chat')
  chat(
    @Body('liveClassId') liveClassId: number,
    @Body('userId') userId: number,
    @Body('message') message: string,
  ) {
    return this.service.saveChatMessage(liveClassId, userId, message);
  }

  @Post('evaluation')
  evaluate(
    @Body('evaluationId') evaluationId: number,
    @Body('userId') userId: number,
    @Body('rating') rating: number,
    @Body('feedback') feedback?: string,
  ) {
    return this.service.submitEvaluation(evaluationId, userId, rating, feedback);
  }
}