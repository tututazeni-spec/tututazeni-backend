import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { HistoryService } from './history.service';
import { Prisma } from '@prisma/client';

@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  // 📌 Criar registro
  @Post()
  create(@Body() data: Prisma.HistoryRecordCreateInput) {
    return this.historyService.createRecord(data);
  }

  // 👤 Histórico por usuário
  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.historyService.findByUser(Number(userId));
  }

  // 🏢 Histórico por departamento
  @Get('department/:departmentId')
  findByDepartment(@Param('departmentId') departmentId: string) {
    return this.historyService.findByDepartment(Number(departmentId));
  }

  // 📚 Histórico global
  @Get()
  findAll() {
    return this.historyService.findAll();
  }

  // 🗑 Remover registro
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.historyService.delete(Number(id));
  }
}