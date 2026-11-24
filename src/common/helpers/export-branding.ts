import type { PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../rls/rls-context';
import { resolveDefaultTenantId } from './tenant.helper';

/** Identidade da organização usada no cabeçalho de documentos exportados (PDF/CSV). */
export interface ExportBranding {
  /** Nome do tenant guardado em Definições › Visão geral › Identidade. */
  name: string;
  /** Logo em PNG/JPEG pronto para o pdfkit; null se não existir ou for de outro formato (ex.: SVG). */
  logo: Buffer | null;
}

export const FALLBACK_EXPORT_NAME = 'INNOVA';

/** Converte um data URL PNG/JPEG em Buffer. O pdfkit não renderiza SVG/WebP, que devolvem null. */
export function logoDataUrlToBuffer(dataUrl?: string | null): Buffer | null {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  try {
    const buf = Buffer.from(m[2], 'base64');
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Nome + logo do tenant para documentos exportados. Nunca lança: se a BD falhar,
 * o documento sai com o nome de omissão em vez de rebentar a exportação.
 */
export async function resolveExportBranding(
  prisma?: Pick<PrismaService, 'tenantConfig'> | null,
): Promise<ExportBranding> {
  if (!prisma) return { name: FALLBACK_EXPORT_NAME, logo: null };
  try {
    const id = await resolveDefaultTenantId(prisma as PrismaService);
    const t = await runAsSystem(() =>
      prisma.tenantConfig.findUnique({
        where: { id },
        select: { tenantName: true, logoUrl: true },
      }),
    );
    return {
      name: t?.tenantName?.trim() || FALLBACK_EXPORT_NAME,
      logo: logoDataUrlToBuffer(t?.logoUrl),
    };
  } catch {
    return { name: FALLBACK_EXPORT_NAME, logo: null };
  }
}
