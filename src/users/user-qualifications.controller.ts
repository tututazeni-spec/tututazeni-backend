// src/users/user-qualifications.controller.ts
// Habilitações, idiomas, certificações externas e experiência anterior do
// colaborador. Sem @Roles: a autorização é por dono / ADMIN / RH, aplicada no
// serviço (assertCanAccess).
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserData } from '../common/decorators';
import { UserQualificationsService } from './user-qualifications.service';
import {
  ExperienceDto,
  ExternalCertificationDto,
  LanguageDto,
  QualificationDto,
} from './user-qualifications.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users/:userId')
export class UserQualificationsController {
  constructor(private readonly svc: UserQualificationsService) {}

  @Get('qualifications')
  @ApiOperation({ summary: 'Perfil de qualificações (habilitações, idiomas, certificações)' })
  getProfile(@Param('userId', ParseIntPipe) userId: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.getProfile(userId, user);
  }

  @Post('qualifications')
  @ApiOperation({ summary: 'Adicionar habilitação académica' })
  addQualification(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: QualificationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addQualification(userId, dto, user);
  }

  @Put('qualifications/:id')
  @ApiOperation({ summary: 'Actualizar habilitação académica' })
  updateQualification(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: QualificationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.updateQualification(userId, id, dto, user);
  }

  @Delete('qualifications/:id')
  @ApiOperation({ summary: 'Apagar habilitação académica' })
  removeQualification(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.removeQualification(userId, id, user);
  }

  @Post('languages')
  @ApiOperation({ summary: 'Adicionar ou actualizar idioma' })
  addLanguage(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: LanguageDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addLanguage(userId, dto, user);
  }

  @Delete('languages/:id')
  @ApiOperation({ summary: 'Apagar idioma' })
  removeLanguage(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.removeLanguage(userId, id, user);
  }

  @Post('certifications')
  @ApiOperation({ summary: 'Adicionar certificação ou licença externa' })
  addCertification(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ExternalCertificationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addCertification(userId, dto, user);
  }

  @Put('certifications/:id')
  @ApiOperation({ summary: 'Actualizar certificação ou licença externa' })
  updateCertification(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExternalCertificationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.updateCertification(userId, id, dto, user);
  }

  @Delete('certifications/:id')
  @ApiOperation({ summary: 'Apagar certificação ou licença externa' })
  removeCertification(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.removeCertification(userId, id, user);
  }

  @Patch('experience')
  @ApiOperation({ summary: 'Definir anos de experiência profissional anterior' })
  setExperience(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ExperienceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.setExperience(userId, dto.priorExperienceYears, user);
  }
}
