import { Module } from '@nestjs/common';
import { PrismaModule }    from '../prisma/prisma.module';
import {
  DepartmentsService, UnitsService, RolesService,
  PositionsService, CareersService,
} from './departments.service';
import {
  DepartmentsController, UnitsController, RolesController,
  PositionsController, CareersController,
} from './departments.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [DepartmentsService, UnitsService, RolesService, PositionsService, CareersService],
  controllers: [DepartmentsController, UnitsController, RolesController, PositionsController, CareersController],
  exports:     [DepartmentsService, UnitsService, RolesService, PositionsService, CareersService],
})
export class DepartmentsModule {}
