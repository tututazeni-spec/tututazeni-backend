import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptLegalDto } from './legal.dto';
import {
  isDraftVersion,
  LEGAL_DOC_TYPES,
  LEGAL_VERSIONS,
  legalAcceptanceRequired,
  pendingDocuments,
} from './legal.versions';

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: number) {
    const accepted = await this.prisma.legalAcceptance.findMany({
      where: { userId },
      select: { docType: true, version: true, acceptedAt: true },
    });
    const pending = pendingDocuments(accepted);
    return {
      // O frontend só bloqueia o acesso quando isto é true (activado depois da revisão jurídica).
      required: legalAcceptanceRequired(),
      documents: LEGAL_DOC_TYPES.map(type => ({
        type,
        version: LEGAL_VERSIONS[type],
        draft: isDraftVersion(LEGAL_VERSIONS[type]),
        accepted: !pending.includes(type),
        acceptedAt:
          accepted.find(a => a.docType === type && a.version === LEGAL_VERSIONS[type])
            ?.acceptedAt ?? null,
      })),
      pending,
    };
  }

  async accept(
    userId: number,
    dto: AcceptLegalDto,
    ip: string | undefined,
    userAgent: string | undefined,
  ) {
    // Só se aceita a versão em vigor: impede registar aceitação de um texto que já foi substituído.
    for (const d of dto.documents) {
      if (LEGAL_VERSIONS[d.type] !== d.version) {
        throw new BadRequestException(
          `A versão "${d.version}" de ${d.type} já não está em vigor. Recarregue a página para ver a versão actual.`,
        );
      }
    }
    for (const d of dto.documents) {
      await this.prisma.legalAcceptance.upsert({
        where: { userId_docType_version: { userId, docType: d.type, version: d.version } },
        update: {},
        create: {
          userId,
          docType: d.type,
          version: d.version,
          ip: ip?.slice(0, 64) ?? null,
          userAgent: userAgent?.slice(0, 300) ?? null,
        },
      });
    }
    return this.status(userId);
  }

  // Prova de consentimento para o titular/auditoria: quem aceitou o quê e quando.
  async acceptances(docType: string | undefined, take = 100) {
    return this.prisma.legalAcceptance.findMany({
      where: docType ? { docType } : undefined,
      orderBy: { acceptedAt: 'desc' },
      take: Math.min(take, 500),
      select: {
        id: true,
        docType: true,
        version: true,
        acceptedAt: true,
        user: { select: { id: true, fullName: true } },
      },
    });
  }
}
