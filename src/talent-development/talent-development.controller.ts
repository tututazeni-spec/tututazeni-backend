// src/talent-development/talent-development.controller.ts
import { Controller, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TalentDevelopmentService } from './talent-development.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Talent Development (Desenvolvimento de Talento)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RH', 'DIRECTOR', 'GESTOR')
@Controller('talent')
export class TalentDevelopmentController {
  constructor(private readonly svc: TalentDevelopmentService) {}
 
  @Get('pool') @ApiOperation({ summary: 'Pool de talento — todos os colaboradores com scores' })
  pool() { return this.svc.getTalentPool(); }
 
  @Get('high-potentials') @ApiOperation({ summary: 'Colaboradores de alto potencial' })
  highPotentials(@Query('limit') limit?: number) {
    return this.svc.getHighPotentials(limit ? +limit : 20);
  }
 
  @Get('matrix') @ApiOperation({ summary: 'Matriz de talento 9-box (performance vs competência)' })
  matrix() { return this.svc.getTalentMatrix(); }
 
  @Get('succession/:positionId') @ApiOperation({ summary: 'Candidatos à sucessão de uma posição' })
  succession(@Param('positionId', ParseIntPipe) id: number) {
    return this.svc.getSuccessionCandidates(id);
  }
 
  @Get('training-needs') @ApiOperation({ summary: 'Necessidades de formação por lacuna de competência' })
  trainingNeeds(@Query('departmentId') deptId?: number) {
    return this.svc.getTrainingNeeds(deptId ? +deptId : undefined);
  }
}
 
