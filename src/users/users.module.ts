import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { EmailProcessor } from '../queue/processors/email.processor';

@Module({
  imports: [PrismaModule, MailModule, BullModule.registerQueue({ name: 'email' })],
  providers: [UsersService, EmailProcessor],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
