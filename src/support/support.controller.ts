import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnyAuthenticated } from '../common/decorators/authz.decorators';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { SupportService } from './support.service';
import {
  CreateTicketDto,
  ReplyTicketDto,
  TicketQueryDto,
  UpdateTicketStatusDto,
} from './support.dto';

@ApiTags('Support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly svc: SupportService) {}

  @Get('channels')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Canais de suporte, horário e tempos de primeira resposta' })
  channels() {
    return this.svc.channels();
  }

  @Post('tickets')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Abrir um pedido de suporte' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateTicketDto) {
    return this.svc.create(user, dto);
  }

  @Get('tickets/my')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Os meus pedidos' })
  mine(@CurrentUser() user: CurrentUserData, @Query() q: TicketQueryDto) {
    return this.svc.mine(user, q);
  }

  @Get('tickets/summary')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Indicadores da fila: atrasos e cumprimento do tempo de resposta' })
  summary() {
    return this.svc.summary();
  }

  @Get('tickets')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Fila de suporte (ordenada pelo prazo de primeira resposta)' })
  queue(@Query() q: TicketQueryDto) {
    return this.svc.queue(q);
  }

  @Get('tickets/:id')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Detalhe do pedido e conversa (dono ou suporte)' })
  get(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.svc.get(user, id);
  }

  @Post('tickets/:id/messages')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Responder a um pedido (dono ou suporte)' })
  reply(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.svc.reply(user, id, dto);
  }

  @Patch('tickets/:id/status')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Alterar o estado do pedido' })
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTicketStatusDto) {
    return this.svc.setStatus(id, dto.status);
  }
}
