import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CertificateAssetKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/services/audit.service';
import { UploadAssetDto } from './certificate-templates.dto';
import { inspectImage } from './image-validation';
import { PlanAssets } from './plan-renderer';

// Lado máximo por tipo de imagem, em píxeis.
const MAX_DIMENSION: Record<CertificateAssetKind, number> = {
  LOGO: 4000,
  SIGNATURE: 4000,
  BACKGROUND: 6000,
};

export interface AssetMeta {
  id: string;
  kind: CertificateAssetKind;
  mime: string;
  width: number;
  height: number;
  size: number;
}

/** Imagens dos templates: validadas pelos bytes, imutáveis e de acesso controlado. */
@Injectable()
export class CertificateAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upload(dto: UploadAssetDto, actorId: number): Promise<AssetMeta> {
    const image = inspectImage(dto.file, MAX_DIMENSION[dto.kind]);
    if (image.ok === false) throw new BadRequestException(image.error);

    const asset = await this.prisma.certificateAsset.create({
      data: {
        kind: dto.kind,
        mime: image.mime,
        size: image.bytes.length,
        width: image.width,
        height: image.height,
        data: new Uint8Array(image.bytes),
        createdById: actorId,
      },
    });
    await this.audit.log({
      action: 'CERTIFICATE_ASSET_UPLOADED',
      entity: 'CertificateAsset',
      userId: actorId,
      metadata: { assetId: asset.id, kind: dto.kind, size: image.bytes.length },
      strict: true,
    });
    return {
      id: asset.id,
      kind: asset.kind,
      mime: asset.mime,
      width: asset.width,
      height: asset.height,
      size: asset.size,
    };
  }

  async read(id: string): Promise<{ mime: string; data: Buffer }> {
    const asset = await this.prisma.certificateAsset.findUnique({
      where: { id },
      select: { mime: true, data: true },
    });
    if (!asset) throw new NotFoundException('Imagem não encontrada');
    return { mime: asset.mime, data: Buffer.from(asset.data) };
  }

  /** Imagens para desenhar um certificado; as que faltarem são simplesmente omitidas. */
  async loadForRender(ids: {
    logoId?: string;
    backgroundId?: string;
    signatureId?: string;
  }): Promise<PlanAssets> {
    const wanted = [ids.logoId, ids.backgroundId, ids.signatureId].filter((v): v is string => !!v);
    if (wanted.length === 0) return {};
    const rows = await this.prisma.certificateAsset.findMany({
      where: { id: { in: wanted } },
      select: { id: true, data: true },
    });
    const byId = new Map(rows.map(r => [r.id, Buffer.from(r.data)]));
    const out: PlanAssets = {};
    if (ids.logoId && byId.has(ids.logoId)) out.logo = byId.get(ids.logoId);
    if (ids.backgroundId && byId.has(ids.backgroundId)) out.background = byId.get(ids.backgroundId);
    if (ids.signatureId && byId.has(ids.signatureId)) out.signature = byId.get(ids.signatureId);
    return out;
  }
}
