import { Controller, Get, UseGuards } from '@nestjs/common';
import { LeaderService } from './leader.service';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { CurrentUser } from '../../core/auth/user.decorator';

@Controller('leader')
@UseGuards(JwtAuthGuard)
export class LeaderController {
  constructor(private service: LeaderService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: any) {
    return this.service.getDashboard(user.sub);
  }
}
