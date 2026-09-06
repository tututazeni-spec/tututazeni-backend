import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

/**
 * Helpers puros de render/snapshot de `Declaration`, partilhados entre
 * `WorkDeclarationService`, `LegacyDocumentDeclarationsService` e o script de
 * backfill (`prisma/backfill-declaration-requests.ts`). Não dependem de Nest DI —
 * recebem um cliente Prisma (o `PrismaService` estende `PrismaClient`, logo serve).
 */

export interface DeclarationEmployeeSnapshot {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string;
  admissionDate: Date | null;
  nationalId: string | null;
}

type PrismaLike = Pick<PrismaClient, 'user'>;

/**
 * Snapshot dos dados do colaborador no momento da emissão. Campo obrigatório
 * (`employeeSnapshot Json`) em `Declaration`.
 */
export async function buildEmployeeSnapshotData(
  prisma: PrismaLike,
  employeeId: number,
): Promise<DeclarationEmployeeSnapshot> {
  const employee = await prisma.user.findFirst({
    where: { id: employeeId },
    include: { department: true, position: true },
  });
  if (!employee) throw new NotFoundException('Colaborador não encontrado.');
  return {
    id: employee.id,
    name: employee.fullName,
    email: employee.email,
    role: employee.position?.name ?? '',
    department: employee.department?.name ?? '',
    admissionDate: employee.hireDate ?? null,
    nationalId: employee.nif ?? null,
  };
}

const TITLES: Record<string, Record<string, string>> = {
  EMPLOYMENT: {
    PT: 'Declaração de Vínculo Empregatício',
    EN: 'Employment Declaration',
    FR: "Déclaration d'Emploi",
  },
  TRAINING: {
    PT: 'Declaração de Participação em Formação',
    EN: 'Training Participation Declaration',
    FR: 'Déclaration de Formation',
  },
  ATTENDANCE: {
    PT: 'Declaração de Frequência',
    EN: 'Attendance Declaration',
    FR: 'Déclaration de Présence',
  },
  PERFORMANCE: {
    PT: 'Declaração de Desempenho',
    EN: 'Performance Declaration',
    FR: 'Déclaration de Performance',
  },
  BANKING: {
    PT: 'Declaração para Fins Bancários',
    EN: 'Banking Purpose Declaration',
    FR: 'Déclaration Bancaire',
  },
  LEGAL: {
    PT: 'Declaração para Fins Legais',
    EN: 'Legal Declaration',
    FR: 'Déclaration Légale',
  },
  ACADEMIC: {
    PT: 'Declaração para Fins Académicos',
    EN: 'Academic Declaration',
    FR: 'Déclaration Académique',
  },
};

/** Título por omissão de uma `Declaration` (campo obrigatório `title`). */
export function generateDeclarationTitle(
  type: string,
  templateName: string,
  locale?: string,
): string {
  return TITLES[type]?.[locale ?? 'PT'] ?? templateName;
}
