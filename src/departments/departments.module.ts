// src/departments/departments.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesPermissionsModule } from '../roles-permissions/roles-permissions.module';
import {
  DepartmentsService,
  UnitsService,
  PositionsService,
  CareersService,
} from './departments.service';
import {
  DepartmentsController,
  UnitsController,
  RolesController,
  PositionsController,
  CareersController,
} from './departments.controller';

@Module({
  // Fase D: RolesController é servido pelo RolesPermissionsService canónico
  // (via RolesPermissionsModule). departments.RolesService foi eliminado.
  imports: [PrismaModule, RolesPermissionsModule],
  providers: [DepartmentsService, UnitsService, PositionsService, CareersService],
  controllers: [
    DepartmentsController,
    UnitsController,
    RolesController,
    PositionsController,
    CareersController,
  ],
  exports: [DepartmentsService, UnitsService, PositionsService, CareersService],
})
export class DepartmentsModule {}
