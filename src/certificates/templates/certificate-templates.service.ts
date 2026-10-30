import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CertificateAssetKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { BUILTIN_TEMPLATES } from './builtin-templates';
import { CertificateAssetsService } from './certificate-assets.service';
import { renderConfigPdf } from './template-render';
import { TemplateConfig, validateTemplateConfig } from './template-config';

const MAX_SAVE_ATTEMPTS = 3;
const DEFAULT_TEMPLATE_ID = BUILTIN_TEMPLATES[0].id;

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  layoutKey: string;
  currentVersion: number;
  colors: TemplateConfig['colors'];
  updatedAt: Date;
  /** Modelo em uso na plataforma: usado nas emissões sem modelo próprio na regra. */
  inUse: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  config: TemplateConfig;
  versions: {
    version: number;
    createdAt: Date;
    createdByName: string | null;
    restoredFromVersion: number | null;
  }[];
}

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  layoutKey: string | null;
  config: string | null;
  currentVersion: number;
  updatedAt: Date;
  isDefault?: boolean;
}

const ASSET_FIELDS: [keyof TemplateConfig['assets'], CertificateAssetKind][] = [
  ['logoId', 'LOGO'],
  ['backgroundId', 'BACKGROUND'],
  ['signatureId', 'SIGNATURE'],
];

/** Dados de exemplo da pré-visualização (nada disto é gravado). */
const SAMPLE_VALUES = {
  nome_completo: 'Maria da Conceição Almeida',
  nome_curso: 'Gestão de Equipas de Alto Desempenho',
  nome_formacao: 'Gestão de Equipas de Alto Desempenho',
  nome_empresa: 'INNOVA',
  nome_instrutor: 'Dr. Carlos Mendes',
  carga_horaria: '40 h',
  nota_final: '87%',
  data_emissao: '20/10/2026',
  data_validade: '20/10/2028',
  codigo_certificado: 'ABCD1234EFGH5678',
};
const SAMPLE_URL = 'https://exemplo.innova/verify/ABCD1234EFGH5678';

/**
 * Os nove modelos de sistema: configuração JSON versionada. Cada gravação cria uma
 * versão imutável; um certificado emitido guarda a versão usada no seu snapshot.
 */
@Injectable()
export class CertificateTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assets: CertificateAssetsService,
  ) {}

  /** Garante os 9 modelos de sistema. Idempotente e seguro com pedidos concorrentes. */
  private async ensureSystem(): Promise<void> {
    const existing = await this.prisma.certificateTemplate.count({ where: { isSystem: true } });
    if (existing >= BUILTIN_TEMPLATES.length) return;
    await this.prisma.certificateTemplate.createMany({
      data: BUILTIN_TEMPLATES.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        type: 'COURSE' as const,
        html: '',
        isSystem: true,
        layoutKey: t.config.layoutKey,
        config: JSON.stringify(t.config),
        currentVersion: 1,
        createdById: null as number,
      })),
      skipDuplicates: true,
    });
    await this.prisma.certificateTemplateVersion.createMany({
      data: BUILTIN_TEMPLATES.map(t => ({
        templateId: t.id,
        version: 1,
        config: JSON.stringify(t.config),
      })),
      skipDuplicates: true,
    });
  }

  private configOf(row: TemplateRow): TemplateConfig {
    const builtin = BUILTIN_TEMPLATES.find(t => t.id === row.id)?.config;
    if (!row.config) return builtin;
    try {
      return JSON.parse(row.config) as TemplateConfig;
    } catch {
      return builtin;
    }
  }

  private summary(row: TemplateRow, inUseId: string): TemplateSummary {
    const config = this.configOf(row);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      layoutKey: config.layoutKey,
      currentVersion: row.currentVersion,
      colors: config.colors,
      updatedAt: row.updatedAt,
      inUse: row.id === inUseId,
    };
  }

  /** Modelo em uso: o marcado como predefinido; sem marca, o corporativo clássico. */
  private async inUseId(): Promise<string> {
    const row = await this.prisma.certificateTemplate.findFirst({
      where: { isSystem: true, isDefault: true, deletedAt: null },
      select: { id: true },
    });
    return row?.id ?? DEFAULT_TEMPLATE_ID;
  }

  private async findSystem(id: string): Promise<TemplateRow> {
    const row = await this.prisma.certificateTemplate.findFirst({
      where: { id, isSystem: true, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Modelo de certificado não encontrado');
    return row;
  }

  async list(): Promise<TemplateSummary[]> {
    await this.ensureSystem();
    const rows = await this.prisma.certificateTemplate.findMany({
      where: { isSystem: true, deletedAt: null },
    });
    const order = new Map(BUILTIN_TEMPLATES.map((t, i) => [t.id, i]));
    const inUse = rows.find(r => r.isDefault)?.id ?? DEFAULT_TEMPLATE_ID;
    return rows
      .filter(r => order.has(r.id))
      .sort((a, b) => order.get(a.id) - order.get(b.id))
      .map(r => this.summary(r, inUse));
  }

  /** Define o modelo em uso na plataforma; pode trocar-se a qualquer momento. */
  async setInUse(id: string, actorId: number): Promise<TemplateSummary[]> {
    await this.ensureSystem();
    await this.findSystem(id);
    await this.prisma.$transaction(async tx => {
      await tx.certificateTemplate.updateMany({
        where: { isSystem: true, isDefault: true },
        data: { isDefault: false },
      });
      await tx.certificateTemplate.update({ where: { id }, data: { isDefault: true } });
    });
    await this.audit.log({
      action: 'CERTIFICATE_TEMPLATE_SET_IN_USE',
      entity: 'CertificateTemplate',
      userId: actorId,
      metadata: { templateId: id },
      strict: true,
    });
    return this.list();
  }

  async get(id: string): Promise<TemplateDetail> {
    await this.ensureSystem();
    const row = await this.findSystem(id);
    const versions = await this.prisma.certificateTemplateVersion.findMany({
      where: { templateId: id },
      orderBy: { version: 'desc' },
      select: { version: true, createdAt: true, createdById: true, restoredFromVersion: true },
    });
    const authorIds = [
      ...new Set(versions.map(v => v.createdById).filter((v): v is number => !!v)),
    ];
    const authors = authorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(authors.map(a => [a.id, a.fullName]));
    return {
      ...this.summary(row, await this.inUseId()),
      config: this.configOf(row),
      versions: versions.map(v => ({
        version: v.version,
        createdAt: v.createdAt,
        createdByName: v.createdById ? (names.get(v.createdById) ?? null) : null,
        restoredFromVersion: v.restoredFromVersion,
      })),
    };
  }

  async saveVersion(id: string, input: unknown, actorId: number): Promise<TemplateDetail> {
    const row = await this.findSystem(id);
    const saved = await this.persistVersion(row, input, actorId, null);
    await this.audit.log({
      action: 'CERTIFICATE_TEMPLATE_SAVED',
      entity: 'CertificateTemplate',
      userId: actorId,
      metadata: { templateId: id, version: saved },
      strict: true,
    });
    return this.get(id);
  }

  /**
   * Restaura uma versão antiga sem apagar nada: cria a versão n+1 como cópia da escolhida.
   * Os certificados emitidos continuam ligados à versão com que nasceram.
   */
  async restoreVersion(id: string, version: number, actorId: number): Promise<TemplateDetail> {
    const row = await this.findSystem(id);
    if (version === row.currentVersion) {
      throw new BadRequestException('Esta já é a versão actual do modelo.');
    }
    const source = await this.prisma.certificateTemplateVersion.findUnique({
      where: { templateId_version: { templateId: id, version } },
      select: { config: true },
    });
    if (!source) throw new NotFoundException('Versão do modelo não encontrada');

    let parsed: unknown;
    try {
      parsed = JSON.parse(source.config);
    } catch {
      throw new BadRequestException('A configuração desta versão está danificada.');
    }
    const saved = await this.persistVersion(row, parsed, actorId, version);
    await this.audit.log({
      action: 'CERTIFICATE_TEMPLATE_RESTORED',
      entity: 'CertificateTemplate',
      userId: actorId,
      metadata: { templateId: id, restoredFromVersion: version, newVersion: saved },
      strict: true,
    });
    return this.get(id);
  }

  /** Valida e grava a configuração como nova versão (com repetição em conflito). */
  private async persistVersion(
    row: TemplateRow,
    input: unknown,
    actorId: number,
    restoredFromVersion: number | null,
  ): Promise<number> {
    const id = row.id;
    const checked = validateTemplateConfig(input);
    if (checked.ok === false) throw new BadRequestException(checked.errors);
    const config = checked.config;
    if (config.layoutKey !== row.layoutKey) {
      throw new BadRequestException('O layout de um modelo não pode ser alterado.');
    }

    for (const [field, kind] of ASSET_FIELDS) {
      const assetId = config.assets[field];
      if (!assetId) continue;
      const asset = await this.prisma.certificateAsset.findUnique({
        where: { id: assetId },
        select: { kind: true },
      });
      if (!asset) throw new NotFoundException('Imagem não encontrada');
      if (asset.kind !== kind) {
        throw new BadRequestException(`A imagem escolhida para ${field} não é do tipo certo.`);
      }
    }

    const json = JSON.stringify(config);
    let saved: number | null = null;
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS && saved === null; attempt++) {
      try {
        saved = await this.prisma.$transaction(async tx => {
          const fresh = await tx.certificateTemplate.findUnique({
            where: { id },
            select: { currentVersion: true },
          });
          const next = (fresh?.currentVersion ?? 0) + 1;
          await tx.certificateTemplateVersion.create({
            data: {
              templateId: id,
              version: next,
              config: json,
              createdById: actorId,
              restoredFromVersion,
            },
          });
          await tx.certificateTemplate.update({
            where: { id },
            data: { config: json, currentVersion: next },
          });
          return next;
        });
      } catch (e) {
        // Outro administrador guardou à mesma hora: a restrição única apanha-o; tenta de novo.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
    if (saved === null) {
      throw new ConflictException('Não foi possível guardar o modelo agora. Tente novamente.');
    }
    return saved;
  }

  /** Pré-visualização com dados de exemplo; a configuração não é gravada. */
  async preview(input: unknown): Promise<Buffer> {
    const checked = validateTemplateConfig(input);
    if (checked.ok === false) throw new BadRequestException(checked.errors);
    const assets = await this.assets.loadForRender(checked.config.assets);
    return renderConfigPdf(
      checked.config,
      { values: SAMPLE_VALUES, verifyUrl: SAMPLE_URL },
      assets,
    );
  }

  /** Template (e versão) a usar numa emissão; sem id → o modelo em uso na plataforma. */
  async resolveForIssuance(
    templateId?: string | null,
  ): Promise<{ id: string; version: number; config: TemplateConfig }> {
    await this.ensureSystem();
    const row = await this.findSystem(templateId ?? (await this.inUseId()));
    return { id: row.id, version: row.currentVersion, config: this.configOf(row) };
  }
}
