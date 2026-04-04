import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DocumentRepositoryService } from './document-repository.service';
import { CreateDocumentDto, UpdateDocumentDto, DocumentFilterDto } from './document-repository.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Document Repository (Repositório de Documentos)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentRepositoryController {
  constructor(private readonly svc: DocumentRepositoryService) {}
 
  @Get() @ApiOperation({ summary: 'Listar documentos da empresa' })
  findAll(@Query() filters: DocumentFilterDto, @CurrentUser() user: any) {
    return this.svc.findAll(filters, user.id, user.departmentId);
  }
 
  @Get('stats') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Estatísticas do repositório' })
  stats() { return this.svc.getStats(); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe do documento' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Get(':id/download') @ApiOperation({ summary: 'Descarregar documento (regista download)' })
  download(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.download(id, user.id);
  }
 
  @Post() @Roles('ADMIN', 'RH', 'GESTOR') @ApiOperation({ summary: 'Publicar documento' })
  create(@CurrentUser() user: any, @Body() dto: CreateDocumentDto) {
    return this.svc.create(user.id, dto);
  }
 
  @Put(':id') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Actualizar documento' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDocumentDto) {
    return this.svc.update(id, dto);
  }
 
  @Patch(':id/archive') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Arquivar documento' })
  archive(@Param('id', ParseIntPipe) id: number) { return this.svc.archive(id); }
}
 

 
