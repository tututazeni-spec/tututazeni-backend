import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { InstructorAccessExpiryService } from './instructor-access-expiry.service';
import { InstructorInviteAcceptController } from './instructor-invite-accept.controller';
import { InstructorInvitesController } from './instructor-invites.controller';
import { InstructorInvitesService } from './instructor-invites.service';

// PrismaModule, AuditModule e SessionRevocationModule são globais.
@Module({
  imports: [MailModule, SettingsModule],
  controllers: [InstructorInvitesController, InstructorInviteAcceptController],
  providers: [InstructorInvitesService, InstructorAccessExpiryService],
  exports: [InstructorInvitesService],
})
export class InstructorInvitesModule {}
