import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.position.create({ data });
  }

  findAll() {
    return this.prisma.position.findMany();
  }
}
