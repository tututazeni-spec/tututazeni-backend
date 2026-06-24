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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  UserFilterDto,
  BulkActionDto,
  InviteUserDto,
  UserChangePasswordDto,
} from './users.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  // ── Endpoints do utilizador autenticado ──────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Perfil do utilizador autenticado' })
  me(@CurrentUser() user: CurrentUserData) {
    return this.svc.findOne(user.id);
  }

  @Get('me/stats')
  @ApiOperation({ summary: 'Estatísticas de aprendizagem (utilizador autenticado)' })
  myStats(@CurrentUser() user: CurrentUserData) {
    return this.svc.getUserStats(user.id);
  }

  @Get('me/team')
  @ApiOperation({ summary: 'Equipa do utilizador autenticado (se for gestor)' })
  myTeam(@CurrentUser() user: CurrentUserData) {
    return this.svc.getTeam(user.id);
  }

  @Get('me/audit-logs')
  @ApiOperation({ summary: 'Logs de auditoria do utilizador autenticado' })
  myAuditLogs(@CurrentUser() user: CurrentUserData, @Query('page') page?: string) {
    return this.svc.getAuditLogs(user.id, page ? parseInt(page) : 1);
  }

  @Put('me/profile')
  @ApiOperation({ summary: 'Actualizar perfil do utilizador autenticado' })
  updateMyProfile(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateProfileDto) {
    return this.svc.upsertProfile(user.id, dto);
  }

  @Patch('me/password')
  @ApiOperation({ summary: 'Alterar password' })
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: CurrentUserData, @Body() dto: UserChangePasswordDto) {
    return this.svc.changePassword(user.id, dto);
  }

  // ── Listagem e directório ────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar utilizadores com filtros e paginação' })
  findAll(@Query() filters: UserFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('directory')
  @ApiOperation({ summary: 'Diretório interno (pesquisa de colaboradores)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  directory(@Query('search') search?: string, @Query('departmentId') departmentId?: string) {
    return this.svc.getDirectory(search, departmentId ? parseInt(departmentId) : undefined);
  }

  @Get('admin/dashboard')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard administrativo de utilizadores' })
  adminDashboard() {
    return this.svc.getAdminDashboard();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Perfil completo de um utilizador' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/stats')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Estatísticas de aprendizagem de um utilizador' })
  stats(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getUserStats(id);
  }

  @Get(':id/team')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Equipa de um gestor com progresso de aprendizagem' })
  team(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTeam(id);
  }

  @Get(':id/audit-logs')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Logs de auditoria de um utilizador' })
  auditLogs(@Param('id', ParseIntPipe) id: number, @Query('page') page?: string) {
    return this.svc.getAuditLogs(id, page ? parseInt(page) : 1);
  }

  // ── Gestão (Admin/RH) ────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar utilizador' })
  create(@CurrentUser() admin: CurrentUserData, @Body() dto: CreateUserDto) {
    return this.svc.create(dto);
  }

  @Post('invite')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Convidar utilizador por email' })
  invite(@Body() dto: InviteUserDto) {
    return this.svc.invite(dto);
  }

  @Post('bulk-import')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Importação em massa (com relatório de erros por linha)' })
  bulkImport(@Body() dto: CreateUserDto[]) {
    return this.svc.bulkImport(dto);
  }

  @Post('bulk-action')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Acção em massa (activate, deactivate, suspend, assign_course)' })
  @HttpCode(HttpStatus.OK)
  bulkAction(@Body() dto: BulkActionDto) {
    return this.svc.bulkAction(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar dados de um utilizador' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: CurrentUserData,
    @Body() dto: UpdateUserDto,
  ) {
    return this.svc.update(id, dto, admin.id);
  }

  @Patch(':id/activate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Activar conta de utilizador' })
  @HttpCode(HttpStatus.OK)
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.activate(id);
  }

  @Patch(':id/deactivate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Desactivar conta (soft — preserva dados)' })
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseIntPipe) id: number, @Body('reason') reason?: string) {
    return this.svc.deactivate(id, reason);
  }

  @Patch(':id/suspend')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Suspender conta de utilizador' })
  @HttpCode(HttpStatus.OK)
  suspend(@Param('id', ParseIntPipe) id: number, @Body('reason') reason: string) {
    return this.svc.suspend(id, reason);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Soft delete — desactiva e marca como saído' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
