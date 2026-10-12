// src/career/position-requirements.controller.ts
// Requisitos estruturados por cargo (habilitações, experiência, idiomas,
// certificações). Competências técnicas/comportamentais continuam em
// /competencies/map/position.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { PositionRequirementsService } from './position-requirements.service';
import {
  CreatePositionRequirementDto,
  UpdatePositionRequirementDto,
} from './position-requirements.dto';

@ApiTags('Career')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('career/positions/:positionId/requirements')
export class PositionRequirementsController {
  constructor(private readonly svc: PositionRequirementsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar requisitos estruturados do cargo' })
  list(@Param('positionId', ParseIntPipe) positionId: number) {
    return this.svc.list(positionId);
  }

  @Post()
  // Só ADMIN/RH: escrever requisitos + simulador permitia a um GESTOR sondar o
  // perfil de qualquer colaborador (criar "Inglês C2" e ver MET/NOT_MET).
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adicionar requisito ao cargo' })
  create(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Body() dto: CreatePositionRequirementDto,
  ) {
    return this.svc.create(positionId, dto);
  }

  @Put(':reqId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar requisito do cargo' })
  update(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Param('reqId', ParseIntPipe) reqId: number,
    @Body() dto: UpdatePositionRequirementDto,
  ) {
    return this.svc.update(positionId, reqId, dto);
  }

  @Delete(':reqId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Apagar requisito do cargo' })
  remove(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Param('reqId', ParseIntPipe) reqId: number,
  ) {
    return this.svc.remove(positionId, reqId);
  }
}
