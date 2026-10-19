import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../auth/enums/role.enum';

export type CertificateScope = { kind: 'ALL' } | { kind: 'TEAM'; userIds: number[] };

export interface ScopeActor {
  id: number;
  role?: { name: string } | null;
}

const SEE_ALL: string[] = [Role.ADMIN, Role.RH, Role.AUDITOR];
const SEE_TEAM: string[] = [Role.GESTOR, Role.LIDER, Role.DIRECTOR];

/**
 * Âmbito de dados dos certificados: tudo (ADMIN/RH/AUDITOR), a equipa directa
 * (GESTOR/LIDER/DIRECTOR — `User.managerId`, como em enrollments.service.ts) ou
 * nada. É sempre aplicado no backend, nunca só escondido na interface.
 */
@Injectable()
export class CertificateScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveScope(actor: ScopeActor): Promise<CertificateScope> {
    const role = actor.role?.name;
    if (role && SEE_ALL.includes(role)) return { kind: 'ALL' };
    if (role && SEE_TEAM.includes(role)) {
      const team = await this.prisma.user.findMany({
        where: { managerId: actor.id },
        select: { id: true },
      });
      return { kind: 'TEAM', userIds: team.map(u => u.id) };
    }
    throw new ForbiddenException('Sem acesso à gestão de certificados');
  }
}
