import { 
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import {
  CreateCourseDto, UpdateCourseDto,
  CourseFilterDto, CourseFeedbackDto,
} from './courses.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Courses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly svc: CoursesService) {}
 
  @Get()
  @ApiOperation({ summary: 'Listar cursos' })
  findAll(@Query() filters: CourseFilterDto) {
    return this.svc.findAll(filters);
  }
 
  @Get('categories')
  @ApiOperation({ summary: 'Listar categorias disponíveis' })
  categories() {
    return this.svc.getCategories();
  }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do curso' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }
 
  @Get(':id/analytics')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Analytics do curso' })
  analytics(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getCourseAnalytics(id);
  }
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar curso' })
  create(@Body() dto: CreateCourseDto) {
    return this.svc.create(dto);
  }
 
  @Post(':id/feedback')
  @ApiOperation({ summary: 'Submeter feedback do curso' })
  feedback(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: CourseFeedbackDto,
  ) {
    return this.svc.addFeedback(id, user.id, dto);
  }
 
  @Post(':id/competencies/:competencyId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Associar competência ao curso' })
  addCompetency(
    @Param('id', ParseIntPipe) id: number,
    @Param('competencyId', ParseIntPipe) cId: number,
  ) {
    return this.svc.addCompetency(id, cId);
  }
 
  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar curso' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover curso' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}