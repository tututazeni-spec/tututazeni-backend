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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { LibraryService } from './library.service';
import {
  CreateCollectionDto,
  CreateItemDto,
  UpdateItemDto,
  FilterItemDto,
  CreateRatingDto,
  CreateCommentDto,
} from './dto';

@ApiTags('Biblioteca Digital')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('library')
export class LibraryController {
  constructor(private readonly service: LibraryService) {}

  // ─── COLECÇÕES ───────────────────────────────────────

  @Post('collections')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar colecção' })
  createCollection(@Body() dto: CreateCollectionDto, @CurrentUser() user: any) {
    return this.service.createCollection(dto, user.id);
  }

  @Get('collections')
  @ApiOperation({ summary: 'Listar colecções' })
  findAllCollections() {
    return this.service.findAllCollections();
  }

  // ─── DASHBOARD ───────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard da Biblioteca' })
  getDashboard() {
    return this.service.getDashboard();
  }

  // ─── ITENS ───────────────────────────────────────────

  @Post('items')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Adicionar item à biblioteca' })
  createItem(@Body() dto: CreateItemDto, @CurrentUser() user: any) {
    return this.service.createItem(dto, user.id);
  }

  @Get('items')
  @ApiOperation({ summary: 'Listar itens (paginado)' })
  findAllItems(@Query() filters: FilterItemDto) {
    return this.service.findAllItems(filters);
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Detalhe de item' })
  findItemById(@Param('id') id: string) {
    return this.service.findItemById(id);
  }

  @Put('items/:id')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Actualizar item' })
  updateItem(@Param('id') id: string, @Body() dto: UpdateItemDto, @CurrentUser() user: any) {
    return this.service.updateItem(id, dto, user.id);
  }

  @Delete('items/:id')
  @Roles('ADMIN', 'RH')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover item (soft delete)' })
  removeItem(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.softDeleteItem(id, user.id);
  }

  @Put('items/:id/approve')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Aprovar item' })
  approveItem(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.approveItem(id, user.id);
  }

  // ─── VISUALIZAÇÃO E DOWNLOAD ─────────────────────────

  @Post('items/:id/view')
  @ApiOperation({ summary: 'Registar visualização' })
  view(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.view(id, user.id);
  }

  @Post('items/:id/download')
  @ApiOperation({ summary: 'Registar download e obter URL' })
  download(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.download(id, user.id);
  }

  // ─── AVALIAÇÕES ──────────────────────────────────────

  @Post('items/:id/rate')
  @ApiOperation({ summary: 'Avaliar item (1-5)' })
  rateItem(@Param('id') id: string, @Body() dto: CreateRatingDto, @CurrentUser() user: any) {
    return this.service.rateItem(id, dto, user.id);
  }

  // ─── COMENTÁRIOS ─────────────────────────────────────

  @Post('items/:id/comments')
  @ApiOperation({ summary: 'Comentar item' })
  addComment(@Param('id') id: string, @Body() dto: CreateCommentDto, @CurrentUser() user: any) {
    return this.service.addComment(id, dto, user.id);
  }

  @Delete('comments/:commentId')
  @ApiOperation({ summary: 'Remover comentário' })
  @HttpCode(HttpStatus.OK)
  deleteComment(@Param('commentId') commentId: string, @CurrentUser() user: any) {
    return this.service.deleteComment(commentId, user.id);
  }
}
