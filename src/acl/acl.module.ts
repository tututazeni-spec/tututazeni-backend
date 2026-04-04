import { Module } from '@nestjs/common';
import { AclService } from './acl.service';
import { AclController } from './acl.controller';
@Module({ providers: [AclService], controllers: [AclController], exports: [AclService] })
export class AclModule {}
 
