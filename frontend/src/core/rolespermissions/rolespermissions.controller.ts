import { Controller, Post, Body, Param } from '@nestjs/common';
import { RolesPermissionsService } from './rolespermissions.service';

@Controller('roles')
export class RolesPermissionsController {
  constructor(private service: RolesPermissionsService) {}

  @Post()
  createRole(@Body() body: any) {
    return this.service.createRole(body);
  }

  @Post('permission')
  createPermission(@Body() body: any) {
    return this.service.createPermission(body);
  }

  @Post(':roleId/permission/:permissionId')
  assign(
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.service.assignPermission(Number(roleId), Number(permissionId));
  }
}