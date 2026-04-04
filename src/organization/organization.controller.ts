// src/organization/organization.controller.ts
import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
 
@ApiTags('Organization (Estrutura Organizacional)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly svc: OrganizationService) {}
 
  @Get('chart') @ApiOperation({ summary: 'Organograma completo da empresa' })
  chart() { return this.svc.getOrgChart(); }
 
  @Get('stats') @ApiOperation({ summary: 'Estatísticas da estrutura organizacional' })
  stats() { return this.svc.getStats(); }
 
  @Get('departments/:id') @ApiOperation({ summary: 'Detalhe de um departamento com colaboradores' })
  dept(@Param('id', ParseIntPipe) id: number) { return this.svc.getDepartmentDetails(id); }
}
 
