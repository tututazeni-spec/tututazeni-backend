import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InstructorInviteAcceptController } from './instructor-invite-accept.controller';
import { InstructorInvitesController } from './instructor-invites.controller';
import { InstructorInvitesService } from './instructor-invites.service';

// PrismaModule, AuditModule e SessionRevocationModule são globais.
@Module({
  imports: [MailModule],
  controllers: [InstructorInvitesController, InstructorInviteAcceptController],
  providers: [InstructorInvitesService],
  exports: [InstructorInvitesService],
})
export class InstructorInvitesModule {}
