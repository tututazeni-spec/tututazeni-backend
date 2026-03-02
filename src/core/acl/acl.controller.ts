import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { AclService } from './acl.service';

@Controller('acl')
export class AclController {
  constructor(private readonly aclService: AclService) {}

  @Post('role')
  createRole(@Body() body: { name: string; description?: string }) {
    return this.aclService.createRole(body.name, body.description);
  }

 @Post('permission')
createPermission(
  @Body()
  body: {
    roleId: number;
    name: string;
    action: string;
    subject: string;
  },
) {
  return this.aclService.createPermission(
    body.roleId,
    body.name,
    body.action,
    body.subject,
  );
}

  @Post('assign')
  assignRole(@Body() body: { userId: number; roleId: number }) {
    return this.aclService.assignRole(body.userId, body.roleId);
  }

  @Get('roles')
  listRoles() {
    return this.aclService.listRoles();
  }

  @Get('can/:userId/:action/:subject')
  can(
    @Param('userId') userId: string,
    @Param('action') action: string,
    @Param('subject') subject: string,
  ) {
    return this.aclService.can(Number(userId), action, subject);
  }
}