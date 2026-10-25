import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { UsersService } from './users.service';
import { AvatarRefInterceptor } from './avatar-ref.interceptor';
import { UsersController } from './users.controller';
import { UserQualificationsService } from './user-qualifications.service';
import { UserQualificationsController } from './user-qualifications.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { PasswordResetService } from '../auth/password-reset.service';
import { EmailProcessor } from '../queue/processors/email.processor';
// UsersModule único junta UsersController (/users), EmployeesController
// (/employees) e RolesPermissionsController (/roles-permissions) — ex-
// EmployeesModule e ex-RolesPermissionsModule, fundidos aqui como "Utilizadores".
import { EmployeesModule } from '../employees/employees.module';
import { RolesPermissionsModule } from '../roles-permissions/roles-permissions.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    BullModule.registerQueue({ name: 'email' }),
    EmployeesModule,
    RolesPermissionsModule,
    SettingsModule,
  ],
  providers: [
    UsersService,
    UserQualificationsService,
    EmailProcessor,
    PasswordResetService,
    { provide: APP_INTERCEPTOR, useClass: AvatarRefInterceptor },
  ],
  controllers: [UsersController, UserQualificationsController],
  exports: [UsersService, EmployeesModule, RolesPermissionsModule],
})
export class UsersModule {}
