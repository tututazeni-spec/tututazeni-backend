// modulo_scalability.md §12 — aba Storage.
//
// Soma os bytes registados (fileSize/sizeBytes) em cada tabela que guarda
// ficheiros. Mede o que a aplicação sabe — não o espaço físico do disco/bucket.
// Ficheiros sem tamanho registado (fileSize NULL) contam como ficheiro mas com 0 bytes.

import { SharedResult } from '../common/helpers/shared-result';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type SourceKey =
  | 'DOCUMENT_REPOSITORY'
  | 'CONTENT_LIBRARY'
  | 'ATTACHMENTS'
  | 'AUDIT_EVIDENCE'
  | 'PHOTOS'
  | 'EXPORTS';

const MODULE_LABELS: Record<SourceKey, string> = {
  DOCUMENT_REPOSITORY: 'Document Repository',
  CONTENT_LIBRARY: 'Content Library',
  ATTACHMENTS: 'Attachments',
  AUDIT_EVIDENCE: 'Evidências de Audit',
  PHOTOS: 'Fotografias',
  EXPORTS: 'Ficheiros exportados',
};

// Categorias de ficheiro pedidas no documento (Vídeos, Conteúdo de formação…).
const KIND_LABELS = {
  VIDEO: 'Vídeos',
  TRAINING: 'Conteúdo de formação',
  PHOTO: 'Fotografias',
  DOCUMENT: 'Documentos',
  OTHER: 'Outros',
} as const;

interface UsageRow {
  source: SourceKey;
  kind: keyof typeof KIND_LABELS;
  mime: string | null;
  unit: string | null;
  month: Date;
  files: bigint;
  bytes: bigint;
}

interface LargestRow {
  source: SourceKey;
  name: string;
  mime: string | null;
  bytes: bigint;
  createdAt: Date;
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;

@Injectable()
export class ScalabilityStorageService {
  constructor(private readonly prisma: PrismaService) {}

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /** Extensão legível a partir do mimeType (application/pdf → PDF). */
  private fileType(mime: string | null): string {
    if (!mime) return 'Desconhecido';
    const m = mime.toLowerCase();
    if (m.startsWith('video/')) return 'Vídeo';
    if (m.startsWith('image/')) return 'Imagem';
    if (m.startsWith('audio/')) return 'Áudio';
    if (m.includes('pdf')) return 'PDF';
    if (m.includes('word') || m.includes('officedocument.wordprocessing')) return 'Word';
    if (m.includes('sheet') || m.includes('excel') || m === 'text/csv') return 'Folha de cálculo';
    if (m.includes('presentation') || m.includes('powerpoint')) return 'Apresentação';
    if (m.startsWith('text/')) return 'Texto';
    if (m.includes('zip')) return 'Arquivo comprimido';
    return 'Outros';
  }

  private async usageRows(): Promise<UsageRow[]> {
    // Um SELECT por tabela, agregado por mês — a cardinalidade (tipos × unidades ×
    // 12+ meses) é pequena, por isso o resto agrega-se em memória.
    return this.prisma.$queryRaw<UsageRow[]>`
      SELECT 'DOCUMENT_REPOSITORY' AS source, 'DOCUMENT' AS kind, "mimeType" AS mime,
             NULLIF(TRIM("department"), '') AS unit,
             date_trunc('month', "createdAt") AS month,
             COUNT(*) AS files, COALESCE(SUM("fileSize"), 0)::bigint AS bytes
        FROM "Document" WHERE "deletedAt" IS NULL GROUP BY 3, 4, 5
      UNION ALL
      SELECT 'DOCUMENT_REPOSITORY', 'DOCUMENT', v."mimeType", NULL,
             date_trunc('month', v."createdAt"), COUNT(*), COALESCE(SUM(v."fileSize"), 0)::bigint
        FROM "DocVersion" v GROUP BY 3, 5
      UNION ALL
      SELECT 'DOCUMENT_REPOSITORY', 'DOCUMENT', c."fileType", d."name",
             date_trunc('month', c."createdAt"), COUNT(*), COALESCE(SUM(c."fileSize"), 0)::bigint
        FROM "CompanyDocument" c LEFT JOIN "Department" d ON d."id" = c."departmentId"
       WHERE c."active" = true GROUP BY 3, 4, 5
      UNION ALL
      SELECT 'CONTENT_LIBRARY',
             CASE WHEN l."type" = 'VIDEO' THEN 'VIDEO'
                  WHEN l."type" IN ('MATERIAL_FORMACAO', 'SCORM') THEN 'TRAINING'
                  WHEN l."type" IN ('IMAGE', 'INFOGRAFICO') THEN 'PHOTO'
                  ELSE 'DOCUMENT' END,
             l."mimeType", d."name",
             date_trunc('month', l."createdAt"), COUNT(*), COALESCE(SUM(l."fileSize"), 0)::bigint
        FROM "LibraryItem" l LEFT JOIN "Department" d ON d."id" = l."departmentId"
       WHERE l."deletedAt" IS NULL GROUP BY 2, 3, 4, 5
      UNION ALL
      SELECT 'ATTACHMENTS', 'DOCUMENT', e."mimeType", NULL,
             date_trunc('month', e."createdAt"), COUNT(*), COALESCE(SUM(e."fileSize"), 0)::bigint
        FROM "EmployeeDocument" e WHERE e."deletedAt" IS NULL GROUP BY 3, 5
      UNION ALL
      SELECT 'ATTACHMENTS', 'DOCUMENT', a."mimeType", NULL,
             date_trunc('month', a."uploadedAt"), COUNT(*), COALESCE(SUM(a."sizeBytes"), 0)::bigint
        FROM "declaration_attachments" a GROUP BY 3, 5
      UNION ALL
      SELECT 'AUDIT_EVIDENCE', 'DOCUMENT', x."mimeType", NULL,
             date_trunc('month', x."createdAt"), COUNT(*), COALESCE(SUM(x."sizeBytes"), 0)::bigint
        FROM "AuditExport" x WHERE x."kind" = 'EVIDENCE' AND x."status" <> 'PURGED' GROUP BY 3, 5
      UNION ALL
      SELECT 'EXPORTS', 'DOCUMENT', x."mimeType", NULL,
             date_trunc('month', x."createdAt"), COUNT(*), COALESCE(SUM(x."sizeBytes"), 0)::bigint
        FROM "AuditExport" x WHERE x."kind" = 'REPORT' AND x."status" <> 'PURGED' GROUP BY 3, 5
      UNION ALL
      SELECT 'PHOTOS', 'PHOTO', 'image/*', NULL,
             date_trunc('month', u."createdAt"), COUNT(*), COALESCE(SUM(length(u."avatarUrl")), 0)::bigint
        FROM "User" u WHERE u."avatarUrl" IS NOT NULL AND u."avatarUrl" <> '' GROUP BY 5
    `;
  }

  private async largest(): Promise<LargestRow[]> {
    return this.prisma.$queryRaw<LargestRow[]>`
      SELECT * FROM (
        SELECT 'DOCUMENT_REPOSITORY' AS source, COALESCE("fileName", "title") AS name,
               "mimeType" AS mime, "fileSize"::bigint AS bytes, "createdAt"
          FROM "Document" WHERE "deletedAt" IS NULL AND "fileSize" IS NOT NULL
        UNION ALL
        SELECT 'DOCUMENT_REPOSITORY', "title", "fileType", "fileSize"::bigint, "createdAt"
          FROM "CompanyDocument" WHERE "active" = true AND "fileSize" IS NOT NULL
        UNION ALL
        SELECT 'CONTENT_LIBRARY', "title", "mimeType", "fileSize"::bigint, "createdAt"
          FROM "LibraryItem" WHERE "deletedAt" IS NULL AND "fileSize" IS NOT NULL
        UNION ALL
        SELECT 'ATTACHMENTS', "name", "mimeType", "fileSize"::bigint, "createdAt"
          FROM "EmployeeDocument" WHERE "deletedAt" IS NULL AND "fileSize" IS NOT NULL
        UNION ALL
        SELECT 'AUDIT_EVIDENCE', "fileName", "mimeType", "sizeBytes"::bigint, "createdAt"
          FROM "AuditExport" WHERE "kind" = 'EVIDENCE' AND "status" <> 'PURGED'
        UNION ALL
        SELECT 'EXPORTS', "fileName", "mimeType", "sizeBytes"::bigint, "createdAt"
          FROM "AuditExport" WHERE "kind" = 'REPORT' AND "status" <> 'PURGED'
      ) f
      ORDER BY bytes DESC LIMIT 10
    `;
  }

  private readonly getStorageMetricsShared = new SharedResult();

  getStorageMetrics() {
    return this.getStorageMetricsShared.get(() => this.computeGetStorageMetrics());
  }

  private async computeGetStorageMetrics() {
    const [rows, largest, tenant] = await Promise.all([
      this.usageRows(),
      this.largest(),
      this.prisma.tenantConfig.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { maxStorageGb: true },
      }),
    ]);

    const add = (map: Map<string, { files: number; bytes: number }>, key: string, r: UsageRow) => {
      const cur = map.get(key) ?? { files: 0, bytes: 0 };
      cur.files += Number(r.files);
      cur.bytes += Number(r.bytes);
      map.set(key, cur);
    };
    const byModule = new Map<string, { files: number; bytes: number }>();
    const byType = new Map<string, { files: number; bytes: number }>();
    const byKind = new Map<string, { files: number; bytes: number }>();
    const byUnit = new Map<string, { files: number; bytes: number }>();
    const byMonth = new Map<string, number>();
    let files = 0;
    let bytes = 0;
    for (const r of rows) {
      files += Number(r.files);
      bytes += Number(r.bytes);
      add(byModule, r.source, r);
      add(byType, this.fileType(r.mime), r);
      add(byKind, r.kind, r);
      add(byUnit, r.unit ?? 'Sem unidade atribuída', r);
      const key = new Date(r.month).toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(r.bytes));
    }

    const totalGb = tenant?.maxStorageGb ?? null;
    const toRows = (map: Map<string, { files: number; bytes: number }>, label = (k: string) => k) =>
      [...map.entries()]
        .map(([key, v]) => ({
          key,
          label: label(key),
          files: v.files,
          mb: this.round2(v.bytes / MB),
          percent: bytes > 0 ? this.round2((v.bytes / bytes) * 100) : 0,
        }))
        .sort((a, b) => b.mb - a.mb);

    // Crescimento mensal: bytes adicionados em cada mês (por createdAt) e acumulado.
    const months = [...byMonth.keys()].sort().slice(-12);
    let running = [...byMonth.entries()]
      .filter(([m]) => m < (months[0] ?? ''))
      .reduce((s, [, v]) => s + v, 0);
    const growth = months.map(m => {
      const added = byMonth.get(m) ?? 0;
      running += added;
      return {
        month: m,
        addedMb: this.round2(added / MB),
        cumulativeGb: this.round2(running / GB),
      };
    });
    const last = growth[growth.length - 1];

    return {
      totalGb,
      usedGb: this.round2(bytes / GB),
      usedMb: this.round2(bytes / MB),
      availableGb: totalGb !== null ? this.round2(Math.max(0, totalGb - bytes / GB)) : null,
      usagePercent: totalGb ? this.round2((bytes / GB / totalGb) * 100) : null,
      monthlyGrowthMb: last ? last.addedMb : 0,
      files,
      byModule: toRows(byModule, k => MODULE_LABELS[k as SourceKey] ?? k),
      byKind: toRows(byKind, k => KIND_LABELS[k as keyof typeof KIND_LABELS] ?? k),
      byType: toRows(byType),
      byUnit: toRows(byUnit),
      growth,
      largestFiles: largest.map(f => ({
        module: MODULE_LABELS[f.source] ?? f.source,
        name: f.name,
        type: this.fileType(f.mime),
        mb: this.round2(Number(f.bytes) / MB),
        createdAt: new Date(f.createdAt).toISOString(),
      })),
      note:
        'Soma dos tamanhos registados na base de dados; não mede o espaço físico do disco/bucket. ' +
        'Fotografias = avatares guardados em base64 no utilizador.',
    };
  }
}
