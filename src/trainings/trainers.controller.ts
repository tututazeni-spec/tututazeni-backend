// src/trainings/trainers.controller.ts
// docs/trainings-detalhado.md pt.7 — Formadores.
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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TrainerService } from './trainers.service';
import {
  CreateTrainingInstructorDto,
  UpdateTrainingInstructorDto,
  TrainingInstructorFilterDto,
} from './trainings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

// Mesmos papéis que podem gerir formações — a gestão do registo de
// formadores é uma extensão da gestão de Trainings, não um domínio à parte.
const CAN_MANAGE_TRAINERS = [
  Role.ADMIN,
  Role.RH,
  Role.GESTOR,
  Role.INSTRUCTOR,
  Role.DIRECTOR,
  Role.LIDER,
];

@ApiTags('Training Trainers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('training-trainers')
export class TrainerController {
  constructor(private readonly svc: TrainerService) {}

  @Get()
  @Roles(...CAN_MANAGE_TRAINERS)
  @ApiOperation({ summary: 'Listar formadores (internos e externos)' })
  findAll(@Query() filters: TrainingInstructorFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get(':id')
  @Roles(...CAN_MANAGE_TRAINERS)
  @ApiOperation({ summary: 'Detalhe do formador (formações/sessões atribuídas, avaliação média)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles(...CAN_MANAGE_TRAINERS)
  @ApiOperation({ summary: 'Novo formador' })
  create(@Body() dto: CreateTrainingInstructorDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @Roles(...CAN_MANAGE_TRAINERS)
  @ApiOperation({ summary: 'Actualizar formador' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTrainingInstructorDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles(...CAN_MANAGE_TRAINERS)
  @ApiOperation({ summary: 'Eliminar formador (sem formações atribuídas)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
