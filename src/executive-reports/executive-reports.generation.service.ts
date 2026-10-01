// src/executive-reports/executive-reports.generation.service.ts
// Geração, exportação e arquivo de relatórios executivos (docs §7 e §8):
// modelos predefinidos, relatórios personalizados com pré-visualização, modelos
// reutilizáveis, e histórico com o contexto de geração preservado (§12.4).
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentUserData } from '../common/decorators';
import { ExecutiveReportsService } from './executive-reports.service';
import {
  ExecutiveReportsBuilderService,
  type ReportSection,
} from './executive-reports.builder.service';
import {
  ExecutiveReportsExportService,
  type ExportFormat,
  type ReportContent,
} from './executive-reports.export.service';
import {
  CUSTOM_TEMPLATE_CODE,
  FORMULA_VERSION,
  REPORT_TEMPLATES,
  SECTION_CATALOG,
  findTemplate,
  type SectionKey,
  type TemplateDef,
} from './executive-reports.templates';
import type { KpiCode } from './executive-reports.kpi-catalog';
import type { ExecutiveFiltersDto } from './dto/executive-filters.dto';
import type {
  ArchiveFilterDto,
  CustomReportConfigDto,
  GenerateCustomReportDto,
  GenerateExecutiveReportDto,
  SaveReportTemplateDto,
  UpdateReportTemplateDto,
} from './dto/executive-generation.dto';

const FULL_ROLES = ['ADMIN', 'RH', 'DIRECTOR'];
const MGMT_ROLES = [...FULL_ROLES, 'GESTOR', 'LIDER'];
const RESTRICTED_ROLES = ['ADMIN', 'DIRECTOR'];

/** Definição normalizada de um relatório a gerar (predefinido ou personalizado). */
export interface ReportSpec {
  code: string;
  name: string;
  version: number;
  reportType: TemplateDef['reportType'];
  sections: SectionKey[];
  kpiCodes?: KpiCode[];
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  /** Para relatórios personalizados: configuração completa (reprodutibilidade). */
  config?: CustomReportConfigDto;
}

export interface GenerateOptions {
  scheduleId?: number;
  title?: string;
  /** Filtros já resolvidos (agendamentos usam o último período fechado). */
  filters: ExecutiveFiltersDto;
}

type SavedTemplateConfig = CustomReportConfigDto;

@Injectable()
export class ExecutiveReportsGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executive: ExecutiveReportsService,
    private readonly builder: ExecutiveReportsBuilderService,
    private readonly exporter: ExecutiveReportsExportService,
  ) {}

  // ─── Modelos ──────────────────────────────────────────────────────────────

  private roleOf(user: CurrentUserData) {
    return user.role?.name ?? '';
  }

  canUseTemplate(def: TemplateDef, role: string): boolean {
    return (def.roles ?? MGMT_ROLES).includes(role);
  }

  async listTemplates(user: CurrentUserData) {
    const role = this.roleOf(user);
    const predefined = REPORT_TEMPLATES.filter(t => this.canUseTemplate(t, role)).map(t => ({
      code: t.code,
      name: t.name,
      description: t.description,
      category: t.category,
      version: t.version,
      type: t.reportType,
      period: t.period,
      predefined: true,
      sections: t.sections.map(k => ({ key: k, title: SECTION_CATALOG[k].title })),
    }));
    const custom = FULL_ROLES.includes(role)
      ? (
          await this.prisma.read.executiveReportTemplate.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 100,
            include: { createdBy: { select: { id: true, fullName: true } } },
          })
        ).map(t => ({
          code: `${CUSTOM_TEMPLATE_CODE}:${t.id}`,
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          version: t.version,
          predefined: false,
          config: t.config,
          createdBy: t.createdBy,
          updatedAt: t.updatedAt,
        }))
      : [];
    return [...predefined, ...custom];
  }

  /** Catálogo de módulos/indicadores seleccionáveis no construtor (§8.1-2). */
  getBuilderCatalog(user: CurrentUserData) {
    const restricted = RESTRICTED_ROLES.includes(this.roleOf(user));
    return Object.values(SECTION_CATALOG)
      .filter(s => restricted || !s.restricted)
      .map(s => ({ key: s.key, title: s.title, sourceModules: s.sourceModules }));
  }

  async saveTemplate(user: CurrentUserData, dto: SaveReportTemplateDto) {
    return this.prisma.executiveReportTemplate.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: CUSTOM_TEMPLATE_CODE,
        config: dto.config as unknown as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
  }

  async updateTemplate(id: number, user: CurrentUserData, dto: UpdateReportTemplateDto) {
    const t = await this.getSavedTemplate(id);
    this.assertTemplateOwner(t.createdById, user);
    return this.prisma.executiveReportTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        ...(dto.config
          ? {
              config: dto.config as unknown as Prisma.InputJsonValue,
              // Nova versão sempre que a configuração muda: relatórios antigos
              // guardam a versão com que foram gerados (§12.4).
              version: { increment: 1 },
            }
          : {}),
      },
    });
  }

  async deleteTemplate(id: number, user: CurrentUserData) {
    const t = await this.getSavedTemplate(id);
    this.assertTemplateOwner(t.createdById, user);
    const inUse = await this.prisma.read.executiveReportSchedule.count({
      where: { templateId: id, active: true },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        `O modelo está a ser usado por ${inUse} agendamento(s) activo(s)`,
      );
    }
    await this.prisma.executiveReportTemplate.delete({ where: { id } });
    return { message: 'Modelo eliminado' };
  }

  private assertTemplateOwner(createdById: number, user: CurrentUserData) {
    if (createdById !== user.id && !RESTRICTED_ROLES.includes(this.roleOf(user))) {
      throw new ForbiddenException('Só o autor ou ADMIN/DIRECTOR podem alterar este modelo');
    }
  }

  async getSavedTemplate(id: number) {
    const t = await this.prisma.read.executiveReportTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Modelo não encontrado');
    return t;
  }

  /** Resolve `templateCode` (predefinido ou `CUSTOM:<id>`) ou `templateId` numa especificação. */
  async resolveSpec(ref: { templateCode?: string | null; templateId?: number | null }) {
    let savedId = ref.templateId ?? null;
    if (!savedId && ref.templateCode?.startsWith(`${CUSTOM_TEMPLATE_CODE}:`)) {
      savedId = Number(ref.templateCode.split(':')[1]);
    }
    if (savedId) {
      const t = await this.getSavedTemplate(savedId);
      return this.specFromConfig(
        `${CUSTOM_TEMPLATE_CODE}:${t.id}`,
        t.name,
        t.version,
        t.config as unknown as SavedTemplateConfig,
      );
    }
    const def = ref.templateCode ? findTemplate(ref.templateCode) : undefined;
    if (!def) throw new NotFoundException('Modelo de relatório não encontrado');
    return {
      def,
      spec: {
        code: def.code,
        name: def.name,
        version: def.version,
        reportType: def.reportType,
        sections: def.sections,
        kpiCodes: def.kpiCodes,
      } satisfies ReportSpec,
    };
  }

  private specFromConfig(code: string, name: string, version: number, cfg: SavedTemplateConfig) {
    return {
      def: undefined,
      spec: {
        code,
        name,
        version,
        reportType: 'CUSTOM' as const,
        sections: cfg.sections as SectionKey[],
        kpiCodes: cfg.kpiCodes as KpiCode[] | undefined,
        sortBy: cfg.sortBy,
        sortDir: cfg.sortDir,
        config: cfg,
      } satisfies ReportSpec,
    };
  }

  // ─── Geração ──────────────────────────────────────────────────────────────

  private periodLabel(f: { current: { start: Date; end: Date } }) {
    const d = (x: Date) => x.toISOString().slice(0, 10);
    return `${d(f.current.start)} a ${d(f.current.end)}`;
  }

  /** Constrói o conteúdo (sem persistir) respeitando o âmbito e as permissões do utilizador. */
  async buildContent(user: CurrentUserData, spec: ReportSpec, filters: ExecutiveFiltersDto) {
    const f = await this.executive.scopeFilters(user, filters);
    const role = this.roleOf(user);
    const built = await this.builder.build(f, {
      sections: spec.sections,
      kpiCodes: spec.kpiCodes,
      sortBy: spec.sortBy,
      sortDir: spec.sortDir,
      canSeeRestricted: RESTRICTED_ROLES.includes(role),
      scoped: !FULL_ROLES.includes(role),
      user,
    });
    return { f, ...built };
  }

  async generate(user: CurrentUserData, dto: GenerateExecutiveReportDto) {
    const { def, spec } = await this.resolveSpec({ templateCode: dto.templateCode });
    if (def && !this.canUseTemplate(def, this.roleOf(user))) {
      throw new ForbiddenException('Sem permissão para usar este modelo');
    }
    return this.run(user, spec, { title: dto.title, filters: dto.filters ?? {} });
  }

  async generateCustom(user: CurrentUserData, dto: GenerateCustomReportDto) {
    const spec = this.customSpec(dto);
    return this.run(user, spec, { title: dto.title, filters: dto.filters ?? {} });
  }

  async previewCustom(user: CurrentUserData, dto: CustomReportConfigDto) {
    const spec = this.customSpec(dto);
    const built = await this.buildContent(user, spec, dto.filters ?? {});
    return {
      context: this.executive.contextOf(built.f),
      sections: built.sections,
      omitted: built.omitted,
      sourceModules: built.sourceModules,
    };
  }

  private customSpec(dto: CustomReportConfigDto): ReportSpec {
    return {
      code: CUSTOM_TEMPLATE_CODE,
      name: 'Relatório Personalizado',
      version: 1,
      reportType: 'CUSTOM',
      sections: dto.sections as SectionKey[],
      kpiCodes: dto.kpiCodes as KpiCode[] | undefined,
      sortBy: dto.sortBy,
      sortDir: dto.sortDir,
      config: dto,
    };
  }

  /**
   * Gera e persiste um relatório com o contexto completo (§12.4): filtros,
   * modelo + versão, versão das fórmulas, autor, data e conteúdo gerado.
   */
  async run(user: CurrentUserData, spec: ReportSpec, opts: GenerateOptions) {
    const built = await this.buildContent(user, spec, opts.filters);
    const author = await this.prisma.read.user.findUnique({
      where: { id: user.id },
      select: { fullName: true },
    });
    const now = new Date();
    const periodLabel = this.periodLabel(built.f);
    const title = opts.title?.trim() || `${spec.name} — ${periodLabel}`;
    const context = this.executive.contextOf(built.f);

    const content: ReportContent = {
      meta: {
        title,
        generatedAt: now.toISOString(),
        generatedBy: author?.fullName ?? `Utilizador ${user.id}`,
        templateCode: spec.code,
        templateName: spec.name,
        templateVersion: spec.version,
        formulaVersion: FORMULA_VERSION,
        periodLabel,
        filters: context,
        sourceModules: built.sourceModules,
      },
      sections: built.sections,
      omitted: built.omitted,
    };

    const report = await this.prisma.executiveReport.create({
      data: {
        title,
        type: spec.reportType,
        status: 'DRAFT',
        confidentiality: built.sections.some(s => SECTION_CATALOG[s.key].restricted)
          ? 'RESTRICTED'
          : 'CONFIDENTIAL',
        generatedById: user.id,
        departmentId: built.f.departmentId ?? null,
        period: periodLabel,
        periodStart: built.f.current.start,
        periodEnd: built.f.current.end,
        filePath: 'pending',
        format: 'PDF',
        templateCode: spec.code,
        templateVersion: spec.version,
        formulaVersion: FORMULA_VERSION,
        filters: {
          applied: context,
          config: (spec.config ?? null) as unknown as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
        content: content as unknown as Prisma.InputJsonValue,
        scheduleId: opts.scheduleId ?? null,
      },
      omit: { content: true },
    });
    await this.prisma.executiveReport.update({
      where: { id: report.id },
      data: { filePath: `/executive-reports/${report.id}/export` },
    });
    await this.prisma.reportLog
      .create({
        data: {
          type: 'EXECUTIVE',
          generatedBy: user.id,
          fileUrl: `/executive-reports/${report.id}/export`,
        },
      })
      .catch(() => undefined);

    return {
      ...report,
      filePath: `/executive-reports/${report.id}/export`,
      sections: built.sections,
      omitted: built.omitted,
    };
  }

  // ─── Consulta e exportação ────────────────────────────────────────────────

  /** O conteúdo guardado é re-filtrado pelas permissões de quem consulta/exporta. */
  private async loadContent(
    id: number,
    user: CurrentUserData,
  ): Promise<{
    content: ReportContent;
    report: { id: number; title: string; generatedById: number; confidentiality: string };
  }> {
    const report = await this.prisma.read.executiveReport.findUnique({
      where: { id },
      include: {
        metrics: { orderBy: { sortOrder: 'asc' } },
        generatedBy: { select: { fullName: true } },
      },
    });
    if (!report) throw new NotFoundException('Relatório não encontrado');

    const role = this.roleOf(user);
    if (!FULL_ROLES.includes(role) && report.generatedById !== user.id) {
      throw new ForbiddenException('Sem permissão para consultar este relatório');
    }
    if (report.confidentiality === 'RESTRICTED' && !RESTRICTED_ROLES.includes(role)) {
      throw new ForbiddenException('Relatório de acesso restrito (ADMIN/DIRECTOR)');
    }

    let content = report.content as unknown as ReportContent | null;
    if (!content) {
      // Relatórios anteriores a este módulo: o conteúdo vem das métricas guardadas.
      const rows = report.metrics.map(m => ({
        indicator: m.label,
        value: m.value,
        unit: m.unit ?? '',
        previous: m.previousValue ?? 'Sem dados',
        target: m.target ?? 'Sem meta',
      }));
      const section: ReportSection = {
        key: 'kpis',
        title: 'Indicadores',
        sourceModules: [],
        columns: [
          { key: 'indicator', label: 'Indicador' },
          { key: 'value', label: 'Valor' },
          { key: 'unit', label: 'Unidade' },
          { key: 'previous', label: 'Período anterior' },
          { key: 'target', label: 'Meta' },
        ],
        rows,
        note: report.narrative ?? undefined,
      };
      content = {
        meta: {
          title: report.title,
          generatedAt: report.createdAt.toISOString(),
          generatedBy: report.generatedBy.fullName,
          templateCode: report.templateCode ?? 'LEGACY',
          templateName: 'Relatório anterior',
          templateVersion: report.templateVersion ?? 1,
          formulaVersion: report.formulaVersion ?? 'n/d',
          periodLabel: report.period ?? 'n/d',
          filters: {},
          sourceModules: [],
        },
        sections: [section],
        omitted: [],
      };
    }

    const canRestricted = RESTRICTED_ROLES.includes(role);
    const kept = content.sections.filter(s => canRestricted || !SECTION_CATALOG[s.key]?.restricted);
    const dropped = content.sections
      .filter(s => !kept.includes(s))
      .map(s => ({ key: s.key, reason: 'Dados restritos (ADMIN/DIRECTOR)' }));
    return {
      content: { ...content, sections: kept, omitted: [...content.omitted, ...dropped] },
      report,
    };
  }

  private async logAccess(reportId: number, userId: number) {
    await this.prisma.reportAccessLog.create({ data: { reportId, userId } }).catch(() => undefined);
  }

  async getContent(id: number, user: CurrentUserData) {
    const { content } = await this.loadContent(id, user);
    await this.logAccess(id, user.id);
    return content;
  }

  async exportReport(id: number, user: CurrentUserData, format: ExportFormat = 'PDF') {
    const { content, report } = await this.loadContent(id, user);
    const file = await this.exporter.export(content, format);
    await this.logAccess(id, user.id);
    const safe = report.title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60) || `relatorio_${id}`;
    return { ...file, filename: `${safe}.${file.extension}` };
  }

  /** Exporta conteúdo para os destinatários de um agendamento (já validados). */
  async exportStored(id: number, format: ExportFormat, asUser: CurrentUserData) {
    return this.exportReport(id, asUser, format);
  }

  // ─── Histórico & Arquivo (§2 / §7) ────────────────────────────────────────

  async archive(filters: ArchiveFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const where: Prisma.ExecutiveReportWhereInput = {
      ...(filters.templateCode ? { templateCode: filters.templateCode } : {}),
      ...(filters.scheduleId ? { scheduleId: filters.scheduleId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.read.executiveReport.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        omit: { content: true },
        include: {
          generatedBy: { select: { id: true, fullName: true } },
          schedule: { select: { id: true, name: true } },
          _count: { select: { accessLogs: true } },
        },
      }),
      this.prisma.read.executiveReport.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Registo de consultas de um relatório (quem abriu/exportou e quando). */
  async accessLog(id: number) {
    const exists = await this.prisma.read.executiveReport.count({ where: { id } });
    if (!exists) throw new NotFoundException('Relatório não encontrado');
    return this.prisma.read.reportAccessLog.findMany({
      where: { reportId: id },
      orderBy: { accessedAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, fullName: true } } },
    });
  }
}
