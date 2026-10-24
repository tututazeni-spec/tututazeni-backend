// src/users/user-qualifications.controller.ts
// Habilitações, idiomas, certificações externas e experiência anterior do
// colaborador. Sem @Roles: a autorização é por dono / ADMIN / RH, aplicada no
// serviço (assertCanAccess).
import { AnyAuthenticated } from '../common/decorators/authz.decorators';
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
  @AnyAuthenticated()
  getProfile(@Param('userId', ParseIntPipe) userId: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.getProfile(userId, user);
  }

  @Post('qualifications')
  @ApiOperation({ summary: 'Adicionar habilitação académica' })
  @AnyAuthenticated()
  addQualification(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: QualificationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addQualification(userId, dto, user);
  }

  @Put('qualifications/:id')
  @ApiOperation({ summary: 'Actualizar habilitação académica' })
  @AnyAuthenticated()
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
  @AnyAuthenticated()
  removeQualification(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.removeQualification(userId, id, user);
  }

  @Post('languages')
  @ApiOperation({ summary: 'Adicionar ou actualizar idioma' })
  @AnyAuthenticated()
  addLanguage(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: LanguageDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addLanguage(userId, dto, user);
  }

  @Delete('languages/:id')
  @ApiOperation({ summary: 'Apagar idioma' })
  @AnyAuthenticated()
  removeLanguage(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.removeLanguage(userId, id, user);
  }

  @Post('certifications')
  @ApiOperation({ summary: 'Adicionar certificação ou licença externa' })
  @AnyAuthenticated()
  addCertification(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ExternalCertificationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addCertification(userId, dto, user);
  }

  @Put('certifications/:id')
  @ApiOperation({ summary: 'Actualizar certificação ou licença externa' })
  @AnyAuthenticated()
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
  @AnyAuthenticated()
  removeCertification(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.removeCertification(userId, id, user);
  }

  @Patch('experience')
  @ApiOperation({ summary: 'Definir anos de experiência profissional anterior' })
  @AnyAuthenticated()
  setExperience(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ExperienceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.setExperience(userId, dto.priorExperienceYears, user);
  }
}
