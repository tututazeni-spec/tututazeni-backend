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
import { CrmBeneficiariesService } from './crm-beneficiaries.service';
import {
  CreateBeneficiaryDto,
  UpdateBeneficiaryDto,
  FilterBeneficiaryDto,
  CreateInteractionDto,
  CreateNeedDto,
} from './dto';

@ApiTags('CRM — Beneficiários')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/beneficiaries')
export class CrmBeneficiariesController {
  constructor(private readonly service: CrmBeneficiariesService) {}

  // ─── CRUD ────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar beneficiário' })
  create(@Body() dto: CreateBeneficiaryDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar beneficiários (paginado)' })
  findAll(@Query() filters: FilterBeneficiaryDto) {
    return this.service.findAll(filters);
  }

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard do CRM de beneficiários' })
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('follow-ups')
  @ApiOperation({ summary: 'Follow-ups pendentes do utilizador' })
  getFollowUps(
    @CurrentUser() user: any,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.service.getFollowUps(user.id, days);
  }

  @Get('report')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Relatório por período' })
  getReport(@Query('start') start: string, @Query('end') end: string) {
    return this.service.getReport(new Date(start), new Date(end));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de beneficiário' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Actualizar beneficiário' })
  update(@Param('id') id: string, @Body() dto: UpdateBeneficiaryDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover beneficiário (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.softDelete(id, user.id);
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  @Post(':id/interactions')
  @ApiOperation({ summary: 'Adicionar interacção' })
  addInteraction(
    @Param('id') id: string,
    @Body() dto: CreateInteractionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addInteraction(id, dto, user.id);
  }

  @Get(':id/interactions')
  @ApiOperation({ summary: 'Listar interacções do beneficiário' })
  getInteractions(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getInteractions(id, page, limit);
  }

  // ─── NECESSIDADES ────────────────────────────────────

  @Post(':id/needs')
  @ApiOperation({ summary: 'Registar necessidade' })
  addNeed(@Param('id') id: string, @Body() dto: CreateNeedDto, @CurrentUser() user: any) {
    return this.service.addNeed(id, dto, user.id);
  }

  @Put('needs/:needId/resolve')
  @ApiOperation({ summary: 'Resolver necessidade' })
  resolveNeed(@Param('needId') needId: string, @CurrentUser() user: any) {
    return this.service.resolveNeed(needId, user.id);
  }
}
