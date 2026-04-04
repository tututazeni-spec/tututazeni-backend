import { Controller, Get, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditFilterDto } from './audit.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('audit')
export class AuditController {
  constructor(private readonly svc: AuditService) {}
 
  @Get()
  @ApiOperation({ summary: 'Listar logs de auditoria' })
  findAll(@Query() filters: AuditFilterDto) { return this.svc.findAll(filters); }
 
  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas de auditoria' })
  stats() { return this.svc.getStats(); }
 
  @Get('history')
  @ApiOperation({ summary: 'Histórico de ações' })
  history(@Query('userId') userId?: number) { return this.svc.getHistoryRecords(userId); }
 
  @Get('history/user/:userId')
  @ApiOperation({ summary: 'Histórico de ações de utilizador' })
  userHistory(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getHistoryRecords(userId);
  }
}
 
