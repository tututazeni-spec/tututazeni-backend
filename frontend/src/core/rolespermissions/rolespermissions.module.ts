import { Module } from '@nestjs/common';
import { RolesPermissionsService } from './rolespermissions.service';
import { RolesPermissionsController } from './rolespermissions.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [RolesPermissionsService],
  controllers: [RolesPermissionsController],
})
export class RolesPermissionsModule {}
