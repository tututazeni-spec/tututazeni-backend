// src/acl/acl.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AclService }  from './acl.service';
import { AclController } from './acl.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [AclService],
  controllers: [AclController],
  exports:     [AclService],
})
export class AclModule {}
