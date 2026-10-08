// ─── src/leave-management/leave-settings.controller.ts ───────────────────────
// docs/Modulo_Leave.md §10 — Configurações. Tem de ser registado ANTES de
// LeaveManagementController: `/leave/settings` colidiria com `/leave/:id`.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { LeaveSettingsService } from './leave-settings.service';
import { LeaveRemindersService } from './leave-reminders.service';
import {
  CreateLeaveDelegationDto,
  CreateLeaveHolidayDto,
  HolidayFilterDto,
  SettingsHistoryFilterDto,
  UpdateLeaveHolidayDto,
  UpdateLeaveSettingsDto,
} from './leave-settings.dto';

const APPROVER_ROLES = [Role.ADMIN, Role.RH, Role.GESTOR, Role.DIRECTOR, Role.LIDER];

@ApiTags('Leave Management — Configurações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave/settings')
export class LeaveSettingsController {
  constructor(
    private readonly svc: LeaveSettingsService,
    private readonly reminders: LeaveRemindersService,
  ) {}

  @Get()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary: 'Configurações em vigor, próxima versão agendada e valores por omissão',
  })
  overview() {
    return this.svc.overview();
  }

  @Patch()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Gravar nova versão das configurações (com data de entrada em vigor)' })
  update(@Body() dto: UpdateLeaveSettingsDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.update(dto, user.id);
  }

  @Get('history')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Histórico de alterações às configurações' })
  history(@Query() q: SettingsHistoryFilterDto) {
    return this.svc.history(q.limit ?? 50);
  }

  @Get('holidays')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Feriados efectivos do ano (base + personalizados) por localização' })
  holidays(@Query() q: HolidayFilterDto) {
    return this.svc.listHolidays(q.year ?? new Date().getFullYear(), q.location);
  }

  @Get('locations')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Localizações de trabalho existentes' })
  locations() {
    return this.svc.listLocations();
  }

  @Post('holidays')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adicionar feriado (ou suprimir um de base com active=false)' })
  createHoliday(@Body() dto: CreateLeaveHolidayDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createHoliday(dto, user.id);
  }

  @Patch('holidays/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar feriado' })
  updateHoliday(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeaveHolidayDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.updateHoliday(id, dto, user.id);
  }

  @Delete('holidays/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover feriado' })
  deleteHoliday(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.deleteHoliday(id, user.id);
  }

  @Get('delegations')
  @Roles(...APPROVER_ROLES)
  @ApiOperation({ summary: 'Delegações de aprovação (as minhas; ADMIN/RH vêem todas)' })
  delegations(@CurrentUser() user: CurrentUserData, @Query('all') all?: string) {
    return this.svc.listDelegations(user, all !== 'true');
  }

  @Post('delegations')
  @Roles(...APPROVER_ROLES)
  @ApiOperation({ summary: 'Delegar aprovações num substituto durante um período' })
  createDelegation(@Body() dto: CreateLeaveDelegationDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createDelegation(dto, user);
  }

  @Delete('delegations/:id')
  @Roles(...APPROVER_ROLES)
  @ApiOperation({ summary: 'Revogar delegação' })
  revokeDelegation(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.revokeDelegation(id, user);
  }

  @Post('reminders/run')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Executar já os lembretes/escalonamentos de aprovações em atraso' })
  runReminders() {
    return this.reminders.remindOverdueApprovals();
  }
}
