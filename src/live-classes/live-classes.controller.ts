import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LiveClassesService } from './live-classes.service';
import {
  CreateLiveClassDto,
  UpdateLiveClassDto,
  LiveChatMessageDto,
  PostClassResponseDto,
  LiveClassFilterDto,
} from './live-classes.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Live Classes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('live-classes')
export class LiveClassesController {
  constructor(private readonly svc: LiveClassesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar aulas ao vivo' })
  findAll(@Query() filters: LiveClassFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Próximas aulas agendadas' })
  upcoming() {
    return this.svc.getUpcoming();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da aula' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Mensagens do chat ao vivo' })
  messages(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.svc.getMessages(id, page, limit);
  }

  @Get(':id/attendance-report')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Relatório de presença' })
  attendanceReport(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAttendanceReport(id);
  }

  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar aula ao vivo' })
  create(@Body() dto: CreateLiveClassDto) {
    return this.svc.create(dto);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Entrar na aula' })
  join(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.joinClass(id, user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Sair da aula' })
  leave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.leaveClass(id, user.id);
  }

  @Post(':id/message')
  @ApiOperation({ summary: 'Enviar mensagem no chat' })
  sendMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: LiveChatMessageDto,
  ) {
    return this.svc.sendMessage(id, user.id, dto);
  }

  @Post(':id/post-evaluation')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar avaliação pós-aula' })
  createPostEval(@Param('id', ParseIntPipe) id: number) {
    return this.svc.createPostEvaluation(id);
  }

  @Post('post-evaluation/respond')
  @ApiOperation({ summary: 'Submeter resposta à avaliação pós-aula' })
  postResponse(@CurrentUser() user: any, @Body() dto: PostClassResponseDto) {
    return this.svc.submitPostResponse(user.id, dto);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar aula' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLiveClassDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover aula' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
