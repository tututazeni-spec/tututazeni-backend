// src/acl/acl.module.ts
// Fase D: shell — as rotas /acl/* são servidas pelo RolesPermissionsService
// canónico. Não há mais AclService.
import { Module } from '@nestjs/common';
import { RolesPermissionsModule } from '../roles-permissions/roles-permissions.module';
import { AclController } from './acl.controller';

@Module({
  imports: [RolesPermissionsModule],
  controllers: [AclController],
})
export class AclModule {}
