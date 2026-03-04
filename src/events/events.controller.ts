import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';

import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { FilterEventsDto } from './dto/filter-events.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // 🔎 Filtrar eventos
  @Post('filter')
  filterEvents(@Body() filter: FilterEventsDto) {
    return this.eventsService.findAll(filter);
  }

  // 📌 Listar todos (ou com filtro via query)
  @Get()
  findAll(@Query() filter: FilterEventsDto) {
    return this.eventsService.findAll(filter);
  }

  // 📌 Buscar por ID
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(Number(id));
  }

  // ✏️ Atualizar
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.eventsService.updateEvent(Number(id), dto);
  }

  // ❌ Deletar
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.eventsService.deleteEvent(Number(id));
  }
}