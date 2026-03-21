import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common';
import { LeadershipService } from './leadership.service';

@Controller('leadership')
export class LeadershipController {
  constructor(private readonly service: LeadershipService) {}

  @Post('program')
  createProgram(@Body() body: any) {
    return this.service.createProgram(body);
  }

  @Get('programs')
  getPrograms() {
    return this.service.getPrograms();
  }

  @Post('enroll')
  enroll(@Body() body: any) {
    return this.service.enrollParticipant(body);
  }

  @Patch('progress/:userId/:programId')
  updateProgress(
    @Param('userId') userId: string,
    @Param('programId') programId: string,
    @Body('progress') progress: number,
  ) {
    return this.service.updateProgress(
      Number(userId),
      Number(programId),
      progress,
    );
  }

  @Get('participants/:programId')
  getParticipants(@Param('programId') programId: string) {
    return this.service.getParticipants(Number(programId));
  }
}