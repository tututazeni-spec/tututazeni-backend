// src/instructor/instructor.module.ts
import { Module } from '@nestjs/common';
import { InstructorService }    from './instructor.service';
import { InstructorController } from './instructor.controller';
import { PrismaModule }         from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  providers:   [InstructorService],
  controllers: [InstructorController],
  exports:     [InstructorService],
})
export class InstructorModule {}
 
