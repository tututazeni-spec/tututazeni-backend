import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { EmailProcessor } from '../queue/processors/email.processor';
// UsersModule único junta UsersController (/users), EmployeesController
// (/employees) e RolesPermissionsController (/roles-permissions) — ex-
// EmployeesModule e ex-RolesPermissionsModule, fundidos aqui como "Utilizadores".
import { EmployeesModule } from '../employees/employees.module';
import { RolesPermissionsModule } from '../roles-permissions/roles-permissions.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    BullModule.registerQueue({ name: 'email' }),
    EmployeesModule,
    RolesPermissionsModule,
  ],
  providers: [UsersService, EmailProcessor],
  controllers: [UsersController],
  exports: [UsersService, EmployeesModule, RolesPermissionsModule],
})
export class UsersModule {}
