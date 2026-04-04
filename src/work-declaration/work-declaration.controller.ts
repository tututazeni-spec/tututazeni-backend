import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WorkDeclarationService } from './work-declaration.service';
import { RequestDeclarationDto, DeclarationFilterDto } from './work-declaration.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Work Declaration (Declarações de Trabalho)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('declarations')
export class WorkDeclarationController {
  constructor(private readonly svc: WorkDeclarationService) {}
 
  @Get() @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Listar todas as declarações' })
  findAll(@Query() filters: DeclarationFilterDto) { return this.svc.findAll(filters); }
 
  @Get('my') @ApiOperation({ summary: 'Minhas declarações' })
  myDeclarations(@CurrentUser() user: any) { return this.svc.getMyDeclarations(user.id); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe da declaração' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post() @ApiOperation({ summary: 'Solicitar declaração de trabalho' })
  request(@CurrentUser() user: any, @Body() dto: RequestDeclarationDto) {
    return this.svc.request(user.id, dto);
  }
 
  @Patch(':id/generate') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Gerar conteúdo da declaração' })
  generate(@Param('id', ParseIntPipe) id: number) { return this.svc.generate(id); }
 
  @Patch(':id/issue') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Marcar declaração como emitida' })
  issue(@Param('id', ParseIntPipe) id: number) { return this.svc.issue(id); }
}
 
