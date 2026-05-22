// src/roles-permissions/roles-permissions.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesPermissionsService } from './roles-permissions.service';
import { RolesPermissionsController } from './roles-permissions.controller';

@Module({
  imports: [PrismaModule],
  providers: [RolesPermissionsService],
  controllers: [RolesPermissionsController],
  exports: [RolesPermissionsService],
})
export class RolesPermissionsModule {}
