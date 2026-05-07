// src/micro-learning/micro-learning.controller.ts
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { MicroLearningService } from './micro-learning.service';
import {
  CreateMicroLearningDto, UpdateMicroLearningDto, MicroLearningFilterDto,
  CreatePlaylistDto, UpdatePlaylistDto,
  DispatchMicroLearningDto, UpdateProgressDto,
  SubmitQuizDto, InteractDto,
} from './micro-learning.dto';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Micro-Learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('micro-learning')
export class MicroLearningController {
  constructor(private readonly svc: MicroLearningService) {}

  // ── Admin Dashboard ───────────────────────────────────────────────────────

  @Get('admin/dashboard')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard admin (métricas, top conteúdo, streaks)' })
  adminDashboard() { return this.svc.getAdminDashboard(); }

  // ── Catálogo (Admin) ──────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar todo o conteúdo com filtros (admin)' })
  findAll(@Query() filters: MicroLearningFilterDto) { return this.svc.findAll(filters); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do conteúdo' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Get(':id/stats')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Analytics do conteúdo (conclusão, quiz, likes)' })
  stats(@Param('id', ParseIntPipe) id: number) { return this.svc.getContentStats(id); }

  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar micro-learning' })
  create(@CurrentUser() user: any, @Body() dto: CreateMicroLearningDto) {
    return this.svc.create(dto, user.id);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar micro-learning' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMicroLearningDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/publish')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Publicar conteúdo (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) { return this.svc.publish(id); }

  @Patch(':id/archive')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Arquivar conteúdo' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) { return this.svc.archive(id); }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar conteúdo (só DRAFT)' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }

  // ── Feed do Utilizador ────────────────────────────────────────────────────

  @Get('feed/me')
  @ApiOperation({ summary: 'Feed personalizado do utilizador autenticado' })
  myFeed(@CurrentUser() user: any, @Query() filters: MicroLearningFilterDto) {
    return this.svc.getMyFeed(user.id, filters);
  }

  @Get('saved/me')
  @ApiOperation({ summary: 'Conteúdos guardados (saved) pelo utilizador' })
  mySaved(@CurrentUser() user: any) { return this.svc.getMySaved(user.id); }

  @Get('dashboard/me')
  @ApiOperation({ summary: 'Dashboard pessoal (streak, XP, histórico)' })
  myDashboard(@CurrentUser() user: any) { return this.svc.getMyDashboard(user.id); }

  // ── Progresso ─────────────────────────────────────────────────────────────

  @Post('progress')
  @ApiOperation({ summary: 'Actualizar progresso de um conteúdo' })
  @HttpCode(HttpStatus.OK)
  updateProgress(@CurrentUser() user: any, @Body() dto: UpdateProgressDto) {
    return this.svc.updateProgress(user.id, dto);
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────

  @Post('quiz/submit')
  @ApiOperation({ summary: 'Submeter respostas de quiz' })
  @HttpCode(HttpStatus.OK)
  submitQuiz(@CurrentUser() user: any, @Body() dto: SubmitQuizDto) {
    return this.svc.submitQuiz(user.id, dto);
  }

  // ── Interações ────────────────────────────────────────────────────────────

  @Post('interact')
  @ApiOperation({ summary: 'Like / Save / Skip (toggle)' })
  @HttpCode(HttpStatus.OK)
  interact(@CurrentUser() user: any, @Body() dto: InteractDto) {
    return this.svc.interact(user.id, dto);
  }

  // ── Playlists ─────────────────────────────────────────────────────────────

  @Get('playlists/all')
  @ApiOperation({ summary: 'Listar todas as playlists' })
  getPlaylists() { return this.svc.getPlaylists(); }

  @Get('playlists/:id')
  @ApiOperation({ summary: 'Detalhe de uma playlist' })
  getPlaylist(@Param('id', ParseIntPipe) id: number) { return this.svc.getPlaylist(id); }

  @Post('playlists')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar playlist de micro-learning' })
  createPlaylist(@CurrentUser() user: any, @Body() dto: CreatePlaylistDto) {
    return this.svc.createPlaylist(dto, user.id);
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────

  @Post('dispatch')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Distribuir conteúdo a utilizadores específicos' })
  dispatch(@Body() dto: DispatchMicroLearningDto) { return this.svc.dispatch(dto); }

  @Post(':id/dispatch-all')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Distribuir a todos os utilizadores activos' })
  dispatchAll(@Param('id', ParseIntPipe) id: number) { return this.svc.dispatchToAll(id); }
}