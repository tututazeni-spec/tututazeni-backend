import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  ContentLibraryService,
  CreateContentDto,
  UpdateContentDto,
  ContentFilterDto,
} from './content-library.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Content Library (Biblioteca de Conteúdos)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('content-library')
export class ContentLibraryController {
  constructor(private readonly svc: ContentLibraryService) {}
 
  @Get() @ApiOperation({ summary: 'Pesquisar biblioteca de conteúdos' })
  findAll(@Query() filters: ContentFilterDto) { return this.svc.findAll(filters); }
 
  @Get('recommended') @ApiOperation({ summary: 'Conteúdos recomendados para mim' })
  recommended(@CurrentUser() user: any) { return this.svc.getRecommended(user.id); }
 
  @Get('bookmarks') @ApiOperation({ summary: 'Meus conteúdos guardados' })
  bookmarks(@CurrentUser() user: any) { return this.svc.getMyBookmarks(user.id); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe do conteúdo' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post() @Roles('ADMIN', 'INSTRUCTOR', 'RH') @ApiOperation({ summary: 'Publicar conteúdo' })
  create(@CurrentUser() user: any, @Body() dto: CreateContentDto) {
    return this.svc.create(user.id, dto);
  }
 
  @Patch(':id/view') @ApiOperation({ summary: 'Registar visualização' })
  view(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.view(id, user.id);
  }
 
  @Patch(':id/bookmark') @ApiOperation({ summary: 'Guardar/remover dos guardados' })
  bookmark(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.bookmark(id, user.id);
  }
 
  @Put(':id') @Roles('ADMIN', 'INSTRUCTOR', 'RH') @ApiOperation({ summary: 'Actualizar conteúdo' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContentDto) {
    return this.svc.update(id, dto);
  }
}
 

