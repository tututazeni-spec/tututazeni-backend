import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { InstructorInvitesController } from './instructor-invites.controller';
import { InstructorInvitesService } from './instructor-invites.service';

// PrismaModule, AuditModule e SessionRevocationModule são globais.
@Module({
  imports: [MailModule],
  controllers: [InstructorInvitesController],
  providers: [InstructorInvitesService],
  exports: [InstructorInvitesService],
})
export class InstructorInvitesModule {}
