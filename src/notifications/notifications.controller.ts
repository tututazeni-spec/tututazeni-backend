// src/notifications/notifications.controller.ts
import {
  Controller,
  Get,
  Post,
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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import {
  CreateNotificationDto,
  BulkNotificationDto,
  NotificationFilterDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  UpdatePreferencesDto,
} from './notifications.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // ── As minhas notificações ────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'As minhas notificações (com agrupamento por data)' })
  my(@CurrentUser() user: any, @Query() filters: NotificationFilterDto) {
    return this.svc.getMyNotifications(user.id, filters);
  }

  @Get('my/unread-count')
  @ApiOperation({ summary: 'Contagem de não lidas (badge do sino)' })
  unreadCount(@CurrentUser() user: any) {
    return this.svc.getUnreadCount(user.id);
  }

  @Patch('my/:id/read')
  @ApiOperation({ summary: 'Marcar notificação como lida' })
  @HttpCode(HttpStatus.OK)
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.markAsRead(id, user.id);
  }

  @Patch('my/read-all')
  @ApiOperation({ summary: 'Marcar todas como lidas' })
  @HttpCode(HttpStatus.OK)
  readAll(@CurrentUser() user: any) {
    return this.svc.markAllAsRead(user.id);
  }

  @Patch('my/read-bulk')
  @ApiOperation({ summary: 'Marcar lista de IDs como lidas' })
  @HttpCode(HttpStatus.OK)
  @ApiBody({ schema: { properties: { ids: { type: 'array', items: { type: 'number' } } } } })
  readBulk(@CurrentUser() user: any, @Body() body: { ids: number[] }) {
    return this.svc.markBulkAsRead(user.id, body.ids);
  }

  @Patch('my/:id/archive')
  @ApiOperation({ summary: 'Arquivar notificação' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.archiveNotification(id, user.id);
  }

  // ── Preferências ──────────────────────────────────────────────────────────

  @Get('preferences')
  @ApiOperation({ summary: 'As minhas preferências de notificação' })
  getPrefs(@CurrentUser() user: any) {
    return this.svc.getPreferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Actualizar preferências (canais, horário silencioso, digest)' })
  @HttpCode(HttpStatus.OK)
  updatePrefs(@CurrentUser() user: any, @Body() dto: UpdatePreferencesDto) {
    return this.svc.updatePreferences(user.id, dto);
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  @Get('templates')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar templates de notificação' })
  getTemplates() {
    return this.svc.getTemplates();
  }

  @Post('templates')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar template' })
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.svc.createTemplate(dto);
  }

  @Patch('templates/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar template' })
  updateTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateDto) {
    return this.svc.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar template' })
  deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteTemplate(id);
  }

  // ── Envio (Admin/RH) ──────────────────────────────────────────────────────

  @Post('send')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Enviar notificação a um utilizador' })
  send(@Body() dto: CreateNotificationDto) {
    return this.svc.send(dto);
  }

  @Post('send-bulk')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Envio em massa (lista de userIds)' })
  sendBulk(@Body() dto: BulkNotificationDto) {
    return this.svc.sendBulk(dto);
  }

  @Post('send-all')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Enviar a todos os colaboradores activos' })
  @ApiBody({
    schema: {
      properties: {
        type: { type: 'string' },
        message: { type: 'string' },
        title: { type: 'string' },
      },
    },
  })
  sendAll(@Body() body: { type: string; message: string; title?: string }) {
    return this.svc.sendToAll(body.type, body.message, body.title);
  }

  // ── Logs / Stats (Admin) ──────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Todos os logs de notificações' })
  all(@Query() filters: NotificationFilterDto) {
    return this.svc.getAllLogs(filters);
  }

  @Get('stats')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Estatísticas (taxa leitura, por tipo, por categoria)' })
  stats() {
    return this.svc.getStats();
  }

  // ── Automation Rules ──────────────────────────────────────────────────────

  @Get('automation-rules')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Regras de automação' })
  rules() {
    return this.svc.getAutomationRules();
  }

  @Post('automation-rules')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar regra de automação' })
  createRule(@Body() body: { name: string; trigger: string; action: string; condition: string }) {
    return this.svc.createAutomationRule(body);
  }

  @Patch('automation-rules/:id/toggle')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Activar/desactivar regra de automação' })
  @HttpCode(HttpStatus.OK)
  toggleRule(@Param('id', ParseIntPipe) id: number) {
    return this.svc.toggleAutomationRule(id);
  }
}
