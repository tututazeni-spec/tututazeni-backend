import { Module } from '@nestjs/common';
import { AclService } from './acl.service';
import { AclController } from './acl.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [AclController],
  providers: [AclService, PrismaService],
  exports: [AclService],
})
export class AclModule {}