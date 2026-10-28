import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnyAuthenticated } from '../common/decorators/authz.decorators';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { ProductExperienceService } from './product-experience.service';
import { SubmitFeedbackDto, SubmitNpsDto, TrackEventDto } from './product-experience.dto';

@ApiTags('Product experience')
@ApiBearerAuth()
@Controller('product-experience')
export class ProductExperienceController {
  constructor(private readonly svc: ProductExperienceService) {}

  @Get('getting-started')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Checklist de primeiros passos (calculado a partir de dados reais)' })
  gettingStarted(@CurrentUser() user: CurrentUserData) {
    return this.svc.gettingStarted(user.id, user.role?.name ?? null);
  }

  @Post('getting-started/dismiss')
  @HttpCode(200)
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Esconder o checklist de primeiros passos' })
  dismiss(@CurrentUser() user: CurrentUserData) {
    return this.svc.dismissGettingStarted(user.id);
  }

  @Post('feedback')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Enviar ideia, problema ou elogio' })
  feedback(@CurrentUser() user: CurrentUserData, @Body() dto: SubmitFeedbackDto) {
    return this.svc.submitFeedback(user.id, dto);
  }

  @Get('nps/eligibility')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Deve mostrar-se a sondagem NPS a este utilizador?' })
  npsEligibility(@CurrentUser() user: CurrentUserData) {
    return this.svc.npsEligibility(user.id);
  }

  @Post('nps')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Responder à sondagem NPS' })
  nps(@CurrentUser() user: CurrentUserData, @Body() dto: SubmitNpsDto) {
    return this.svc.submitNps(user.id, dto);
  }

  @Post('track')
  @HttpCode(200)
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Registar um evento de utilização (ecrã visto / funcionalidade usada)' })
  track(@CurrentUser() user: CurrentUserData, @Body() dto: TrackEventDto) {
    return this.svc.track(user.id, dto);
  }

  @Get('summary')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Análise de utilização, NPS e feedback' })
  summary(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.svc.summary(Math.min(Math.max(days, 1), 365));
  }

  @Get('feedback')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Lista de feedback recebido' })
  list(
    @Query('kind') kind?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.svc.listFeedback(kind, limit);
  }
}
