import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AnyAuthenticated } from '../common/decorators/authz.decorators';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { AcceptLegalDto } from './legal.dto';
import { LegalService } from './legal.service';

@ApiTags('Legal')
@ApiBearerAuth()
@Controller('legal')
export class LegalController {
  constructor(private readonly svc: LegalService) {}

  @Get('status')
  @AnyAuthenticated()
  @ApiOperation({
    summary: 'Versões em vigor dos termos e da política de privacidade e o que falta aceitar',
  })
  status(@CurrentUser() user: CurrentUserData) {
    return this.svc.status(user.id);
  }

  @Post('accept')
  @HttpCode(200)
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Registar a aceitação das versões em vigor' })
  accept(@CurrentUser() user: CurrentUserData, @Body() dto: AcceptLegalDto, @Req() req: Request) {
    return this.svc.accept(user.id, dto, req.ip, req.headers['user-agent']);
  }

  @Get('acceptances')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Registo de aceitações (prova de consentimento)' })
  acceptances(
    @Query('docType') docType?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit = 100,
  ) {
    return this.svc.acceptances(docType, limit);
  }
}
