import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { LearningPathsService } from './learningpaths.service';

@Controller('learningpaths')
export class LearningPathsController {
  constructor(private service: LearningPathsService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Post(':id/course/:courseId/:seq')
  addCourse(
    @Param('id') id: string,
    @Param('courseId') courseId: string,
    @Param('seq') seq: string,
  ) {
    return this.service.addCourse(Number(id), Number(courseId), Number(seq));
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}

