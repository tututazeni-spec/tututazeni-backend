// src/avatar-training/avatar-training.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { AUTHENTICATED_ROLES } from '../auth/enums/role.enum';
import { isPrivileged } from '../common/authz/ownership';
import { AvatarTrainingService } from './avatar-training.service';
import { AvatarTrainingProgramsService } from './avatar-training-programs.service';
import { AvatarTrainingAttemptsService } from './avatar-training-attempts.service';
import { AvatarTrainingProvidersService } from './avatar-training-providers.service';
import { AvatarTrainingAiTutorService } from './avatar-training-ai-tutor.service';
import { AvatarTrainingDevelopmentService } from './avatar-training-development.service';
import {
  AddKnowledgeSourceDto,
  AskTutorDto,
  AssignAvatarSessionDto,
  AvatarFilterDto,
  AvatarProgramFilterDto,
  AvatarProgressFilterDto,
  AvatarTrainingProviderService,
  CaptionsQueryDto,
  LinkAvatarSessionDto,
  RecommendationsQueryDto,
  AvatarSessionFilterDto,
  CreateAvatarProgramDto,
  CreateAvatarSessionDto,
  CreateTrainingAvatarDto,
  RecordInteractionDto,
  ReviewAttemptDto,
  SetAvatarStatusDto,
  SetMediaPreferencesDto,
  SynthesizeSpeechDto,
  StartAttemptDto,
  SubmitAttemptDto,
  UpdateAvatarProgramDto,
  UpdateAvatarSessionDto,
  UpdateTrainingAvatarDto,
  UpsertProviderConfigDto,
  UsageSummaryQueryDto,
  UpsertSessionAssessmentDto,
} from './dto/avatar-training.dto';
import {
  AVATAR_ADMIN_ROLES,
  AVATAR_ASSIGN_ROLES,
  AVATAR_AUTHOR_ROLES,
} from './avatar-training.helpers';

@ApiTags('Avatar Training')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('avatar-training')
export class AvatarTrainingController {
  constructor(
    private readonly avatars: AvatarTrainingService,
    private readonly programs: AvatarTrainingProgramsService,
    private readonly attempts: AvatarTrainingAttemptsService,
    private readonly aiTutor: AvatarTrainingAiTutorService,
    private readonly providers: AvatarTrainingProvidersService,
    private readonly development: AvatarTrainingDevelopmentService,
  ) {}

  // ── Avatares (fase 1) ──────────────────────────────────────────────────────

  @Get('avatars')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Listar avatares (formandos só vêem os activos)' })
  listAvatars(@CurrentUser() user: CurrentUserData, @Query() filters: AvatarFilterDto) {
    return this.avatars.listAvatars(filters, !isPrivileged(user, AVATAR_AUTHOR_ROLES));
  }

  @Post('avatars')
  @Roles(...AVATAR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar avatar (nasce em teste)' })
  createAvatar(@CurrentUser() user: CurrentUserData, @Body() dto: CreateTrainingAvatarDto) {
    return this.avatars.createAvatar(user.id, dto);
  }

  @Get('avatars/:id')
  @Roles(...AVATAR_AUTHOR_ROLES)
  getAvatar(@Param('id', ParseIntPipe) id: number) {
    return this.avatars.getAvatar(id);
  }

  @Patch('avatars/:id')
  @Roles(...AVATAR_ADMIN_ROLES)
  updateAvatar(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTrainingAvatarDto,
  ) {
    return this.avatars.updateAvatar(user.id, id, dto);
  }

  @Post('avatars/:id/test')
  @HttpCode(HttpStatus.OK)
  @Roles(...AVATAR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Testar a configuração do avatar' })
  testAvatar(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.avatars.testAvatar(user.id, id);
  }

  @Post('avatars/:id/status')
  @HttpCode(HttpStatus.OK)
  @Roles(...AVATAR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Activar, desactivar ou arquivar (activar exige teste prévio)' })
  setAvatarStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAvatarStatusDto,
  ) {
    return this.avatars.setStatus(user.id, id, dto.status);
  }

  // ── Formações ──────────────────────────────────────────────────────────────

  @Get('programs')
  @Roles(...AUTHENTICATED_ROLES)
  listPrograms(@CurrentUser() user: CurrentUserData, @Query() filters: AvatarProgramFilterDto) {
    return this.programs.listPrograms(user, filters);
  }

  @Post('programs')
  @Roles(...AVATAR_AUTHOR_ROLES)
  createProgram(@CurrentUser() user: CurrentUserData, @Body() dto: CreateAvatarProgramDto) {
    return this.programs.createProgram(user.id, dto);
  }

  @Get('programs/:id')
  @Roles(...AUTHENTICATED_ROLES)
  getProgram(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.programs.getProgram(user, id);
  }

  @Patch('programs/:id')
  @Roles(...AVATAR_AUTHOR_ROLES)
  updateProgram(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAvatarProgramDto,
  ) {
    return this.programs.updateProgram(user, id, dto);
  }

  @Post('programs/:id/submit-review')
  @HttpCode(HttpStatus.OK)
  @Roles(...AVATAR_AUTHOR_ROLES)
  submitForReview(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.programs.submitForReview(user, id);
  }

  @Post('programs/:id/publish')
  @HttpCode(HttpStatus.OK)
  @Roles(...AVATAR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Publicar formação aprovada (e as suas sessões)' })
  publishProgram(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.programs.publishProgram(user, id);
  }

  @Post('programs/:id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(...AVATAR_AUTHOR_ROLES)
  archiveProgram(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.programs.archiveProgram(user, id);
  }

  // ── Sessões ────────────────────────────────────────────────────────────────

  @Get('sessions')
  @Roles(...AUTHENTICATED_ROLES)
  listSessions(@CurrentUser() user: CurrentUserData, @Query() filters: AvatarSessionFilterDto) {
    return this.programs.listSessions(user, filters);
  }

  @Post('sessions')
  @Roles(...AVATAR_AUTHOR_ROLES)
  createSession(@CurrentUser() user: CurrentUserData, @Body() dto: CreateAvatarSessionDto) {
    return this.programs.createSession(user, dto);
  }

  @Get('sessions/:id')
  @Roles(...AUTHENTICATED_ROLES)
  getSession(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.programs.getSession(user, id);
  }

  @Patch('sessions/:id')
  @Roles(...AVATAR_AUTHOR_ROLES)
  updateSession(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAvatarSessionDto,
  ) {
    return this.programs.updateSession(user, id, dto);
  }

  @Put('sessions/:id/assessment')
  @Roles(...AVATAR_AUTHOR_ROLES)
  @ApiOperation({ summary: 'Rubrica, nota mínima, tentativas e ligação a Assessments' })
  upsertAssessment(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertSessionAssessmentDto,
  ) {
    return this.programs.upsertAssessment(user, id, dto);
  }

  @Post('sessions/:id/sources')
  @Roles(...AVATAR_AUTHOR_ROLES)
  @ApiOperation({ summary: 'Associar fonte aprovada (curso, lição, documento, biblioteca)' })
  addSource(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddKnowledgeSourceDto,
  ) {
    return this.programs.addSource(user, id, dto);
  }

  @Delete('sessions/:id/sources/:sourceId')
  @Roles(...AVATAR_AUTHOR_ROLES)
  removeSource(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Param('sourceId', ParseIntPipe) sourceId: number,
  ) {
    return this.programs.removeSource(user, id, sourceId);
  }

  @Post('sessions/:id/assign')
  @HttpCode(HttpStatus.OK)
  @Roles(...AVATAR_ASSIGN_ROLES)
  assign(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignAvatarSessionDto,
  ) {
    return this.programs.assign(user, id, dto);
  }

  @Post('sessions/:id/start')
  @HttpCode(HttpStatus.OK)
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Iniciar (ou retomar) tentativa — devolve o estado da sala' })
  start(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StartAttemptDto,
  ) {
    return this.attempts.start(user, id, dto);
  }

  // ── Atribuições, progresso e histórico ─────────────────────────────────────

  @Get('my/assignments')
  @Roles(...AUTHENTICATED_ROLES)
  myAssignments(@CurrentUser() user: CurrentUserData) {
    return this.attempts.myAssignments(user);
  }

  @Delete('assignments/:id')
  @Roles(...AVATAR_ASSIGN_ROLES)
  cancelAssignment(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.programs.cancelAssignment(user, id);
  }

  @Get('progress')
  @Roles(...AUTHENTICATED_ROLES)
  progress(@CurrentUser() user: CurrentUserData, @Query() filters: AvatarProgressFilterDto) {
    return this.attempts.progress(user, filters);
  }

  @Get('history')
  @Roles(...AUTHENTICATED_ROLES)
  history(@CurrentUser() user: CurrentUserData, @Query('userId') userId?: string) {
    return this.attempts.history(user, userId ? Number(userId) : undefined);
  }

  // ── Tentativas (sala virtual) ──────────────────────────────────────────────

  @Get('attempts/:id/room')
  @Roles(...AUTHENTICATED_ROLES)
  room(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.attempts.room(id, user);
  }

  @Post('attempts/:id/interactions')
  @Roles(...AUTHENTICATED_ROLES)
  record(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordInteractionDto,
  ) {
    return this.attempts.record(user, id, dto);
  }

  // ── AI-Tutor (fase 4) ──────────────────────────────────────────────────────

  @Get('ai-tutor/status')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Estado do AI-Tutor (sem segredos)' })
  tutorStatus() {
    return this.aiTutor.status();
  }

  @Post('attempts/:id/tutor')
  @HttpCode(HttpStatus.OK)
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Perguntar ao AI-Tutor sem sair da sala' })
  askTutor(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AskTutorDto,
  ) {
    return this.aiTutor.ask(user, id, dto);
  }

  @Get('attempts/:id/tutor')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Conversa com o AI-Tutor nesta tentativa' })
  tutorTranscript(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.aiTutor.transcript(user, id);
  }

  // ── Voz e vídeo (fase 5) ───────────────────────────────────────────────────

  @Get('providers/health')
  @Roles(...AVATAR_AUTHOR_ROLES)
  @ApiOperation({ summary: 'Estado dos fornecedores de voz/vídeo (sem segredos)' })
  providersHealth() {
    return this.providers.health();
  }

  @Get('providers/usage')
  @Roles(...AVATAR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Consumo, custo estimado e incidentes de voz/vídeo' })
  providersUsage(@Query() q: UsageSummaryQueryDto) {
    return this.providers.usageSummary(q.from, q.to);
  }

  @Put('providers/:provider/:serviceType')
  @Roles(...AVATAR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Estado, tarifa e limites de um fornecedor (não aceita segredos)' })
  upsertProviderConfig(
    @CurrentUser() user: CurrentUserData,
    @Param('provider') provider: string,
    @Param('serviceType', new ParseEnumPipe(AvatarTrainingProviderService))
    serviceType: AvatarTrainingProviderService,
    @Body() dto: UpsertProviderConfigDto,
  ) {
    return this.providers.upsertConfig(user.id, provider, serviceType, dto);
  }

  @Post('attempts/:id/media')
  @HttpCode(HttpStatus.OK)
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Activar/desactivar voz (aviso obrigatório) e legendas' })
  setMedia(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetMediaPreferencesDto,
  ) {
    return this.providers.setMedia(user, id, dto);
  }

  @Get('attempts/:id/captions')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Texto e legendas sincronizadas de uma etapa ou resposta do tutor' })
  captions(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Query() q: CaptionsQueryDto,
  ) {
    return this.providers.captions(user, id, q);
  }

  @Post('attempts/:id/speech')
  @HttpCode(HttpStatus.OK)
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Áudio sintetizado (proxy — chave só no backend, com limites)' })
  async speech(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SynthesizeSpeechDto,
    @Res() res: Response,
  ) {
    const audio = await this.providers.synthesize(user, id, dto);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audio.length,
      'Cache-Control': 'private, no-store',
    });
    res.end(audio);
  }

  @Post('attempts/:id/pause')
  @HttpCode(HttpStatus.OK)
  @Roles(...AUTHENTICATED_ROLES)
  pause(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.attempts.pause(user, id);
  }

  @Post('attempts/:id/resume')
  @HttpCode(HttpStatus.OK)
  @Roles(...AUTHENTICATED_ROLES)
  resume(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.attempts.resume(user, id);
  }

  @Post('attempts/:id/abandon')
  @HttpCode(HttpStatus.OK)
  @Roles(...AUTHENTICATED_ROLES)
  abandon(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.attempts.abandon(user, id);
  }

  @Post('attempts/:id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles(...AUTHENTICATED_ROLES)
  submit(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.attempts.submit(user, id, dto);
  }

  @Post('attempts/:id/review')
  @HttpCode(HttpStatus.OK)
  @Roles(...AVATAR_AUTHOR_ROLES)
  @ApiOperation({ summary: 'Revisão humana da rubrica (simulações)' })
  review(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewAttemptDto,
  ) {
    return this.attempts.review(user, id, dto);
  }

  @Post('attempts/:id/complete')
  @HttpCode(HttpStatus.OK)
  @Roles(...AUTHENTICATED_ROLES)
  complete(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.attempts.complete(user, id);
  }

  @Get('attempts/:id/results')
  @Roles(...AUTHENTICATED_ROLES)
  results(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.attempts.results(user, id);
  }

  // ── Desenvolvimento (fase 6) ───────────────────────────────────────────────

  @Get('attempts/:id/competencies')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Competências demonstradas numa tentativa' })
  attemptCompetencies(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.development.attemptCompetencies(user, id);
  }

  @Get('competencies')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Competências demonstradas por um utilizador (próprio ou da equipa)' })
  userCompetencies(@CurrentUser() user: CurrentUserData, @Query() query: RecommendationsQueryDto) {
    return this.development.userCompetencies(user, query.userId);
  }

  @Get('recommendations')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Formações recomendadas: lacunas, PDI em aberto e onboarding' })
  recommendations(@CurrentUser() user: CurrentUserData, @Query() query: RecommendationsQueryDto) {
    return this.development.recommendations(user, query.userId);
  }

  @Post('pdi-actions/:actionId/assign')
  @HttpCode(HttpStatus.OK)
  @Roles(...AVATAR_ASSIGN_ROLES)
  @ApiOperation({
    summary: 'Ligar uma acção de PDI a uma sessão; concluir a sessão conclui a acção',
  })
  assignPdiAction(
    @CurrentUser() user: CurrentUserData,
    @Param('actionId', ParseIntPipe) actionId: number,
    @Body() dto: LinkAvatarSessionDto,
  ) {
    return this.development.assignForPdiAction(user, actionId, dto.sessionId);
  }

  @Post('onboarding-tasks/:taskId/assign')
  @HttpCode(HttpStatus.OK)
  @Roles(...AVATAR_ASSIGN_ROLES)
  @ApiOperation({ summary: 'Ligar uma tarefa de onboarding a uma sessão com avatar' })
  assignOnboardingTask(
    @CurrentUser() user: CurrentUserData,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: LinkAvatarSessionDto,
  ) {
    return this.development.assignForOnboardingTask(user, taskId, dto.sessionId);
  }
}
