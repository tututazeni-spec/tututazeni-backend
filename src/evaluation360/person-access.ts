import { NotFoundException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import { isPrivileged } from '../common/authz/ownership';

interface CallerLike {
  id: number;
  role?: { name: string } | null;
}

const FULL_ACCESS_ROLES = [Role.ADMIN, Role.RH, Role.AUDITOR, Role.DIRECTOR];

/**
 * Feedback recebido e progresso de avaliação são dados de uma pessoa: só ela, os papéis de
 * gestão de pessoas/auditoria e o chefe direto os podem ver; os restantes recebem 404 (não
 * revela que existe). `getManagerId` só é chamado se as regras baratas não decidirem.
 */
export async function assertCanViewPerson(
  personId: string,
  caller: CallerLike,
  getManagerId: (personId: string) => Promise<number | null | undefined>,
): Promise<void> {
  if (String(caller.id) === String(personId)) return;
  if (isPrivileged(caller, FULL_ACCESS_ROLES)) return;
  const managerId = await getManagerId(personId);
  if (managerId != null && String(managerId) === String(caller.id)) return;
  throw new NotFoundException('Recurso não encontrado');
}
