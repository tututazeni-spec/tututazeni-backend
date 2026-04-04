import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UpdateProfileDto, UserFilterDto } from './users.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}
 
  @Get()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar todos os utilizadores' })
  findAll(@Query() filters: UserFilterDto) {
    return this.svc.findAll(filters);
  }
 
  @Get('me/stats')
  @ApiOperation({ summary: 'Estatísticas do utilizador autenticado' })
  myStats(@CurrentUser() user: any) {
    return this.svc.getUserStats(user.id);
  }
 
  @Get(':id')
  @ApiOperation({ summary: 'Buscar utilizador por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }
 
  @Get(':id/stats')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Estatísticas de um utilizador' })
  stats(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getUserStats(id);
  }
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar utilizador' })
  create(@Body() dto: CreateUserDto) {
    return this.svc.create(dto);
  }
 
  @Post('bulk-import')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Importação em massa de utilizadores' })
  bulkImport(@Body() dto: CreateUserDto[]) {
    return this.svc.bulkImport(dto);
  }
 
  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar utilizador' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.svc.update(id, dto);
  }
 
  @Put('me/profile')
  @ApiOperation({ summary: 'Atualizar perfil do utilizador autenticado' })
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.svc.upsertProfile(user.id, dto);
  }
 
  @Patch(':id/activate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Ativar utilizador' })
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.activate(id);
  }
 
  @Patch(':id/deactivate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Desativar utilizador' })
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deactivate(id);
  }
 
  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover utilizador' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
