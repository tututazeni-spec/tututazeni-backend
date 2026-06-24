// src/micro-learning/micro-learning.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MicroLearningService } from './micro-learning.service';
import {
  CreateMicroLearningDto,
  UpdateMicroLearningDto,
  MicroLearningFilterDto,
  CreatePlaylistDto,
  DispatchMicroLearningDto,
  MicroLearningUpdateProgressDto,
  MicroLearningSubmitQuizDto,
  InteractDto,
} from './micro-learning.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Micro-Learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('micro-learning')
export class MicroLearningController {
  constructor(private readonly svc: MicroLearningService) {}

  // ── Admin Dashboard ───────────────────────────────────────────────────────

  @Get('admin/dashboard')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard admin (métricas, top conteúdo, streaks)' })
  adminDashboard() {
    return this.svc.getAdminDashboard();
  }

  // ── Catálogo (Admin) ──────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Listar todo o conteúdo com filtros (admin)' })
  findAll(@Query() filters: MicroLearningFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do conteúdo' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/stats')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Analytics do conteúdo (conclusão, quiz, likes)' })
  stats(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getContentStats(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar micro-learning' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateMicroLearningDto) {
    return this.svc.create(dto, user.id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar micro-learning' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMicroLearningDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/publish')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Publicar conteúdo (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publish(id);
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Arquivar conteúdo' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.svc.archive(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar conteúdo (só DRAFT)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Feed do Utilizador ────────────────────────────────────────────────────

  @Get('feed/me')
  @ApiOperation({ summary: 'Feed personalizado do utilizador autenticado' })
  myFeed(@CurrentUser() user: CurrentUserData, @Query() filters: MicroLearningFilterDto) {
    return this.svc.getMyFeed(user.id, filters);
  }

  @Get('saved/me')
  @ApiOperation({ summary: 'Conteúdos guardados (saved) pelo utilizador' })
  mySaved(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMySaved(user.id);
  }

  @Get('dashboard/me')
  @ApiOperation({ summary: 'Dashboard pessoal (streak, XP, histórico)' })
  myDashboard(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyDashboard(user.id);
  }

  // ── Progresso ─────────────────────────────────────────────────────────────

  @Post('progress')
  @ApiOperation({ summary: 'Actualizar progresso de um conteúdo' })
  @HttpCode(HttpStatus.OK)
  updateProgress(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: MicroLearningUpdateProgressDto,
  ) {
    return this.svc.updateProgress(user.id, dto);
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────

  @Post('quiz/submit')
  @ApiOperation({ summary: 'Submeter respostas de quiz' })
  @HttpCode(HttpStatus.OK)
  submitQuiz(@CurrentUser() user: CurrentUserData, @Body() dto: MicroLearningSubmitQuizDto) {
    return this.svc.submitQuiz(user.id, dto);
  }

  // ── Interações ────────────────────────────────────────────────────────────

  @Post('interact')
  @ApiOperation({ summary: 'Like / Save / Skip (toggle)' })
  @HttpCode(HttpStatus.OK)
  interact(@CurrentUser() user: CurrentUserData, @Body() dto: InteractDto) {
    return this.svc.interact(user.id, dto);
  }

  // ── Playlists ─────────────────────────────────────────────────────────────

  @Get('playlists/all')
  @ApiOperation({ summary: 'Listar todas as playlists' })
  getPlaylists() {
    return this.svc.getPlaylists();
  }

  @Get('playlists/:id')
  @ApiOperation({ summary: 'Detalhe de uma playlist' })
  getPlaylist(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPlaylist(id);
  }

  @Post('playlists')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar playlist de micro-learning' })
  createPlaylist(@CurrentUser() user: CurrentUserData, @Body() dto: CreatePlaylistDto) {
    return this.svc.createPlaylist(dto, user.id);
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────

  @Post('dispatch')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Distribuir conteúdo a utilizadores específicos' })
  dispatch(@Body() dto: DispatchMicroLearningDto) {
    return this.svc.dispatch(dto);
  }

  @Post(':id/dispatch-all')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Distribuir a todos os utilizadores activos' })
  dispatchAll(@Param('id', ParseIntPipe) id: number) {
    return this.svc.dispatchToAll(id);
  }
}
