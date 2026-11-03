// src/recycle-bin/recycle-bin.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { RecycleBinService, RecycleKind } from './recycle-bin.service';

@ApiTags('Recycle Bin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recycle-bin')
export class RecycleBinController {
  constructor(private readonly svc: RecycleBinService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Itens apagados nos últimos 30 dias (conteúdos e documentos)' })
  list() {
    return this.svc.list();
  }

  @Post(':kind/:id/restore')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Restaurar um item da reciclagem' })
  restore(@Param('kind') kind: string, @Param('id', ParseIntPipe) id: number) {
    const k = kind.toUpperCase();
    if (k !== 'CONTENT' && k !== 'DOCUMENT') throw new BadRequestException('Tipo inválido');
    return this.svc.restore(k as RecycleKind, id);
  }
}
