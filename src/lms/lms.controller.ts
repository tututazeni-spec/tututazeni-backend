import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { LmsService } from './lms.service';
import {
  LmsCreateLearningPathDto,
  LmsUpdateLearningPathDto,
  CreateLiveSessionDto,
  AttendanceFeedbackDto,
  FilterPathDto,
} from './dto';
import { Role } from '../auth/enums/role.enum';

@ApiTags('LMS — Aprendizagem')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lms')
export class LmsController {
  constructor(private readonly service: LmsService) {}

  // ─── PERCURSOS ───────────────────────────────────────

  @Post('paths')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar percurso de aprendizagem' })
  createPath(@Body() dto: LmsCreateLearningPathDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createPath(dto, user.id);
  }

  @Get('paths')
  @ApiOperation({ summary: 'Listar percursos (paginado)' })
  findAllPaths(@Query() filters: FilterPathDto) {
    return this.service.findAllPaths(filters);
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Dashboard do LMS' })
  getDashboard() {
    return this.service.getLmsDashboard();
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Recomendações personalizadas' })
  getRecommendations(@CurrentUser() user: CurrentUserData) {
    return this.service.getRecommendations(user.id);
  }

  @Get('my-paths')
  @ApiOperation({ summary: 'Meus percursos' })
  getMyPaths(@CurrentUser() user: CurrentUserData) {
    return this.service.getMyPaths(user.id);
  }

  @Get('my-analytics')
  @ApiOperation({ summary: 'As minhas estatísticas de aprendizagem' })
  getMyAnalytics(@CurrentUser() user: CurrentUserData) {
    return this.service.getMyAnalytics(user.id);
  }

  @Get('paths/:id')
  @ApiOperation({ summary: 'Detalhe de percurso' })
  findPathById(@Param('id') id: string) {
    return this.service.findPathById(id);
  }

  @Put('paths/:id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar percurso' })
  updatePath(
    @Param('id') id: string,
    @Body() dto: LmsUpdateLearningPathDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updatePath(id, dto, user.id);
  }

  @Delete('paths/:id')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover percurso' })
  removePath(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.softDeletePath(id, user.id);
  }

  @Post('paths/:id/enroll')
  @ApiOperation({ summary: 'Inscrever-me no percurso' })
  enrollInPath(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.enrollInPath(id, user.id);
  }

  @Put('paths/:id/progress')
  @ApiOperation({ summary: 'Marcar curso do percurso como concluído' })
  updateProgress(
    @Param('id') id: string,
    @Body('completedCourseId') completedCourseId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updatePathProgress(id, completedCourseId, user.id);
  }

  // ─── SESSÕES AO VIVO ─────────────────────────────────

  @Post('sessions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar sessão ao vivo' })
  createSession(@Body() dto: CreateLiveSessionDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createSession(dto, user.id);
  }

  @Get('sessions/upcoming')
  @ApiOperation({ summary: 'Próximas sessões ao vivo' })
  findUpcomingSessions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.findUpcomingSessions(page, limit);
  }

  @Post('sessions/:id/register')
  @ApiOperation({ summary: 'Inscrever-me na sessão' })
  registerForSession(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.registerForSession(id, user.id);
  }

  @Put('sessions/:id/attend')
  @ApiOperation({ summary: 'Marcar presença' })
  markAttendance(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.markAttendance(id, user.id);
  }

  @Put('sessions/:id/feedback')
  @ApiOperation({ summary: 'Avaliar sessão' })
  submitFeedback(
    @Param('id') id: string,
    @Body() dto: AttendanceFeedbackDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.submitSessionFeedback(id, dto, user.id);
  }
}
