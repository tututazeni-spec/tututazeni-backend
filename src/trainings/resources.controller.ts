// src/trainings/resources.controller.ts
// docs/trainings-detalhado.md pt.8 — Recursos & Logística.
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TrainingResourceService } from './resources.service';
import {
  CreateTrainingResourceDto,
  UpdateTrainingResourceDto,
  TrainingResourceFilterDto,
  CreateResourceBookingDto,
  ResourceAvailabilityFilterDto,
} from './trainings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

const CAN_MANAGE_RESOURCES = [
  Role.ADMIN,
  Role.RH,
  Role.GESTOR,
  Role.INSTRUCTOR,
  Role.DIRECTOR,
  Role.LIDER,
];

@ApiTags('Training Resources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('training-resources')
export class TrainingResourceController {
  constructor(private readonly svc: TrainingResourceService) {}

  @Get('availability')
  @Roles(...CAN_MANAGE_RESOURCES)
  @ApiOperation({ summary: 'Verificar disponibilidade de um recurso/sala num intervalo' })
  availability(@Query() filters: ResourceAvailabilityFilterDto) {
    return this.svc.checkAvailability(filters.resourceId, filters.startAt, filters.endAt);
  }

  @Get()
  @Roles(...CAN_MANAGE_RESOURCES)
  @ApiOperation({ summary: 'Listar salas e recursos/equipamento' })
  findAll(@Query() filters: TrainingResourceFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get(':id')
  @Roles(...CAN_MANAGE_RESOURCES)
  @ApiOperation({ summary: 'Detalhe do recurso (reservas activas)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles(...CAN_MANAGE_RESOURCES)
  @ApiOperation({ summary: 'Nova sala / novo recurso' })
  create(@Body() dto: CreateTrainingResourceDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @Roles(...CAN_MANAGE_RESOURCES)
  @ApiOperation({ summary: 'Actualizar sala/recurso' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTrainingResourceDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles(...CAN_MANAGE_RESOURCES)
  @ApiOperation({ summary: 'Eliminar sala/recurso (sem reservas activas)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  @Get('bookings/training/:trainingId')
  @Roles(...CAN_MANAGE_RESOURCES)
  @ApiOperation({ summary: 'Reservas activas de uma turma/formação' })
  bookingsForTraining(@Param('trainingId', ParseIntPipe) trainingId: number) {
    return this.svc.listBookingsForTraining(trainingId);
  }

  @Post('bookings')
  @Roles(...CAN_MANAGE_RESOURCES)
  @ApiOperation({ summary: 'Reservar sala/recurso para uma turma/sessão' })
  reserve(@Body() dto: CreateResourceBookingDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.reserve(dto, user.id);
  }

  @Post('bookings/:id/release')
  @Roles(...CAN_MANAGE_RESOURCES)
  @ApiOperation({ summary: 'Libertar reserva' })
  @HttpCode(HttpStatus.OK)
  release(@Param('id', ParseIntPipe) id: number) {
    return this.svc.release(id);
  }
}
