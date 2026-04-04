import {
  Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto, BulkNotificationDto, NotificationFilterDto } from './notifications.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}
 
  @Get()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Todos os logs de notificações' })
  all(@Query() filters: NotificationFilterDto) { return this.svc.getAllLogs(filters); }
 
  @Get('stats')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Estatísticas de notificações' })
  stats() { return this.svc.getStats(); }
 
  @Get('my')
  @ApiOperation({ summary: 'Minhas notificações' })
  my(@CurrentUser() user: any, @Query() filters: NotificationFilterDto) {
    return this.svc.getMyNotifications(user.id, filters);
  }
 
  @Get('automation-rules')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Regras de automação' })
  rules() { return this.svc.getAutomationRules(); }
 
  @Post('send')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Enviar notificação a utilizador' })
  send(@Body() dto: CreateNotificationDto) { return this.svc.send(dto); }
 
  @Post('send-bulk')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Envio em massa de notificações' })
  sendBulk(@Body() dto: BulkNotificationDto) { return this.svc.sendBulk(dto); }
 
  @Post('send-all')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Enviar notificação a todos os utilizadores ativos' })
  sendAll(@Body() body: { type: string; message: string }) {
    return this.svc.sendToAll(body.type, body.message);
  }
 
  @Post('automation-rules')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar regra de automação' })
  createRule(@Body() body: { name: string; trigger: string; action: string; condition: string }) {
    return this.svc.createAutomationRule(body);
  }
 
  @Patch('automation-rules/:id/toggle')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Ativar/desativar regra de automação' })
  toggleRule(@Param('id', ParseIntPipe) id: number) { return this.svc.toggleAutomationRule(id); }
}
 
