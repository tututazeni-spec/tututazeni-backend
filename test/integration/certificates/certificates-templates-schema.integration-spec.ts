import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Certificate templates v2 schema', () => {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
  const stamp = `tplv2-${Date.now()}`;
  let userId: number;
  let templateId: string;
  let assetId: string;

  beforeAll(async () => {
    userId = (await prisma.user.findUnique({ where: { email: 'int.rh@innova-test.com' } }))!.id;
  });

  afterAll(async () => {
    // filhos antes de pais: versões (cascade) → template; assets à parte
    await prisma.certificateTemplateVersion
      .deleteMany({ where: { templateId } })
      .catch((): undefined => undefined);
    await prisma.certificateTemplate
      .deleteMany({ where: { id: templateId } })
      .catch((): undefined => undefined);
    await prisma.certificateAsset
      .deleteMany({ where: { id: assetId } })
      .catch((): undefined => undefined);
    await prisma.$disconnect();
    await pool.end();
  });

  it('guarda versões e impede repetir o mesmo número de versão', async () => {
    const tpl = await prisma.certificateTemplate.create({
      data: { name: stamp, html: '', createdById: userId },
    });
    templateId = tpl.id;
    expect(tpl).toMatchObject({
      isSystem: false,
      currentVersion: 0,
      config: null,
      layoutKey: null,
    });

    await prisma.certificateTemplateVersion.create({
      data: { templateId, version: 1, config: '{"a":1}', createdById: userId },
    });
    await prisma.certificateTemplateVersion.create({
      data: { templateId, version: 2, config: '{"a":2}', createdById: userId },
    });
    await expect(
      prisma.certificateTemplateVersion.create({
        data: { templateId, version: 2, config: '{"a":3}' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const versions = await prisma.certificateTemplateVersion.findMany({
      where: { templateId },
      orderBy: { version: 'asc' },
    });
    expect(versions.map(v => v.version)).toEqual([1, 2]);
  });

  it('guarda imagens como bytes e devolve-os iguais', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);
    const asset = await prisma.certificateAsset.create({
      data: {
        kind: 'LOGO',
        mime: 'image/png',
        size: bytes.length,
        width: 10,
        height: 10,
        data: bytes,
      },
    });
    assetId = asset.id;
    const read = await prisma.certificateAsset.findUnique({ where: { id: assetId } });
    expect(Buffer.from(read!.data).equals(bytes)).toBe(true);
    expect(read).toMatchObject({ kind: 'LOGO', mime: 'image/png', width: 10, height: 10 });
  });

  it('apagar o template apaga as suas versões (cascade)', async () => {
    await prisma.certificateTemplate.delete({ where: { id: templateId } });
    expect(await prisma.certificateTemplateVersion.count({ where: { templateId } })).toBe(0);
  });
});
