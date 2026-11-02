import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { InstructorInvitesService } from './instructor-invites.service';
import { CreateInstructorInviteDto, ExtendAccessDto } from './instructor-invites.dto';

@ApiTags('instructor-invites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('instructor-invites')
export class InstructorInvitesController {
  constructor(private readonly svc: InstructorInvitesService) {}

  @Post()
  @ApiOperation({ summary: 'Convidar instrutor externo (link único e temporário)' })
  create(@Body() dto: CreateInstructorInviteDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar convites de instrutores externos' })
  list() {
    return this.svc.list();
  }

  @Post(':id/revoke')
  @HttpCode(200)
  async revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserData) {
    await this.svc.revoke(id, user.id);
    return { message: 'Convite revogado' };
  }

  @Post(':id/resend')
  @HttpCode(200)
  resend(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserData) {
    return this.svc.resend(id, user.id);
  }

  @Patch('users/:userId/extend')
  extend(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ExtendAccessDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.extendAccess(userId, dto.accessDays, user.id);
  }

  @Post('users/:userId/deactivate')
  @HttpCode(200)
  async deactivate(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.svc.deactivate(userId, user.id);
    return { message: 'Acesso desativado' };
  }
}
