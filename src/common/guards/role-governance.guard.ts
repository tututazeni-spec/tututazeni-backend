import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Menor privilégio na gestão de papéis: quem não é ADMIN (ex.: RH) gere papéis comuns, mas
 * não pode (1) tocar no papel ADMIN, (2) alterar o seu próprio papel/permissões, nem
 * (3) atribuir um papel a si próprio. Sem isto, RH fazia-se ADMIN em segundos.
 * Aplica-se a pedidos que alteram estado; leituras passam.
 */
@Injectable()
export class RoleGovernanceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.method === 'GET' || req.method === 'HEAD') return true;
    const actor = req.user as { id: number; roleId?: number | null; role?: { name?: string } };
    if (!actor || actor.role?.name === 'ADMIN') return true;

    const roleId = toInt(req.params?.roleId ?? req.params?.id ?? req.body?.roleId);
    if (roleId != null) {
      const role = await this.prisma.role.findUnique({ where: { id: roleId } });
      if (role?.name === 'ADMIN') {
        throw new ForbiddenException('Só um administrador pode gerir o perfil ADMIN');
      }
      if (actor.roleId != null && roleId === actor.roleId) {
        throw new ForbiddenException('Não podes alterar o teu próprio perfil de acesso');
      }
    }

    const targetUserIds = [
      req.params?.userId,
      req.body?.userId,
      ...(Array.isArray(req.body?.userIds) ? req.body.userIds : []),
    ]
      .map(toInt)
      .filter((n): n is number => n != null);
    if (targetUserIds.includes(actor.id)) {
      throw new ForbiddenException('Não podes atribuir-te um perfil a ti próprio');
    }
    return true;
  }
}

function toInt(v: unknown): number | null {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
}
