import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { authThrottleLimit, deviceContext } from '../auth/auth.controller';
import { InstructorInvitesService } from './instructor-invites.service';
import { AcceptInstructorInviteDto } from './instructor-invites.dto';

const AUTH_THROTTLE = { default: { limit: authThrottleLimit(), ttl: 60000 } };

@ApiTags('auth')
@Controller('auth/instructor-invite')
export class InstructorInviteAcceptController {
  constructor(private readonly svc: InstructorInvitesService) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('accept')
  @ApiOperation({ summary: 'Aceitar convite de instrutor externo e definir a palavra-passe' })
  accept(
    @Body() dto: AcceptInstructorInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = deviceContext(req, res);
    return this.svc.acceptInvite(dto.token, dto.password, ctx.deviceId, ctx);
  }
}
