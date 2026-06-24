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
import { CurrentUser, Roles } from '../common/decorators';
import { CrmPartnersService } from './crm-partners.service';
import {
  CreatePartnerDto,
  UpdatePartnerDto,
  FilterPartnerDto,
  CreatePartnerInteractionDto,
  CreateMilestoneDto,
} from './dto';
import { Role } from '../auth/enums/role.enum';

@ApiTags('CRM — Parceiros')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/partners')
export class CrmPartnersController {
  constructor(private readonly service: CrmPartnersService) {}

  // ─── CRUD ────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar parceiro' })
  create(@Body() dto: CreatePartnerDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar parceiros (paginado)' })
  findAll(@Query() filters: FilterPartnerDto) {
    return this.service.findAll(filters);
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Dashboard CRM Parceiros' })
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('expiring-contracts')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Contratos a expirar nos próximos N dias' })
  getExpiringContracts(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.service.getExpiringContracts(days);
  }

  @Get('overdue-milestones')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Milestones em atraso' })
  getOverdueMilestones() {
    return this.service.getOverdueMilestones();
  }

  @Get('report')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Relatório por período' })
  getReport(@Query('start') start: string, @Query('end') end: string) {
    return this.service.getReport(new Date(start), new Date(end));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de parceiro' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar parceiro' })
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover parceiro (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.softDelete(id, user.id);
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  @Post(':id/interactions')
  @ApiOperation({ summary: 'Adicionar interacção' })
  addInteraction(
    @Param('id') id: string,
    @Body() dto: CreatePartnerInteractionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addInteraction(id, dto, user.id);
  }

  @Get(':id/interactions')
  @ApiOperation({ summary: 'Listar interacções do parceiro' })
  getInteractions(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getInteractions(id, page, limit);
  }

  // ─── MILESTONES ──────────────────────────────────────

  @Post(':id/milestones')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar milestone do parceiro' })
  addMilestone(@Param('id') id: string, @Body() dto: CreateMilestoneDto, @CurrentUser() user: any) {
    return this.service.addMilestone(id, dto, user.id);
  }

  @Put('milestones/:milestoneId/complete')
  @ApiOperation({ summary: 'Marcar milestone como concluído' })
  completeMilestone(@Param('milestoneId') milestoneId: string, @CurrentUser() user: any) {
    return this.service.completeMilestone(milestoneId, user.id);
  }
}
