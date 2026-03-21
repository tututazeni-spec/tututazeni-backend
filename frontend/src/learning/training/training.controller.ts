import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TrainingService } from './training.service';

@Controller('trainings')
export class TrainingController {
  constructor(private readonly service: TrainingService) {}

  @Post()
  createTraining(@Body() data: Prisma.TrainingCreateInput) {
    return this.service.createTraining(data);
  }

  @Get()
  findAllTrainings() {
    return this.service.findAllTrainings();
  }

  @Get(':id')
  findTraining(@Param('id') id: string) {
    return this.service.findTraining(Number(id));
  }

  @Post('sessions')
  createSession(@Body() data: Prisma.TrainingSessionCreateInput) {
    return this.service.createSession(data);
  }

  @Get(':trainingId/sessions')
  findSessionsByTraining(@Param('trainingId') trainingId: string) {
    return this.service.findSessionsByTraining(Number(trainingId));
  }

  @Post('participants')
  addParticipant(@Body() data: Prisma.TrainingParticipantCreateInput) {
    return this.service.addParticipant(data);
  }

  @Patch('participants/:id')
  updateParticipantStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.service.updateParticipantStatus(Number(id), status);
  }
}