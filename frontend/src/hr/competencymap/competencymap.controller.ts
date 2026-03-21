import { Controller, Post, Body, Param } from '@nestjs/common';
import { CompetencyMapService } from './competencymap.service';

@Controller('competencies')
export class CompetencyMapController {
  constructor(private service: CompetencyMapService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.createCompetency(body);
  }

  @Post(':courseId/:competencyId')
  assign(
    @Param('courseId') courseId: string,
    @Param('competencyId') competencyId: string,
  ) {
    return this.service.assignToCourse(
      Number(courseId),
      Number(competencyId),
    );
  }
}
