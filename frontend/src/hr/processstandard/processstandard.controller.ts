import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ProcessStandardService } from './processstandard.service';
import { Prisma } from '@prisma/client';

@Controller('process-standards')
export class ProcessStandardController {
  constructor(private readonly service: ProcessStandardService) {}

  @Post()
  createProcess(@Body() data: Prisma.ProcessStandardCreateInput) {
    return this.service.createProcess(data);
  }

  @Get()
  findAllProcesses() {
    return this.service.findAllProcesses();
  }

  @Get(':id')
  findProcess(@Param('id') id: string) {
    return this.service.findProcess(Number(id));
  }

  @Post('steps')
  createStep(@Body() data: Prisma.ProcessStepCreateInput) {
    return this.service.createStep(data);
  }

  @Patch('steps/:id')
  updateStep(@Param('id') id: string, @Body() data: Prisma.ProcessStepUpdateInput) {
    return this.service.updateStep(Number(id), data);
  }

  @Get(':processId/steps')
  findStepsByProcess(@Param('processId') processId: string) {
    return this.service.findStepsByProcess(Number(processId));
  }
}