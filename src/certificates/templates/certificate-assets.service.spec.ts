import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CertificateAssetsService } from './certificate-assets.service';
import { UploadAssetDto } from './certificate-templates.dto';
import { makePng } from './test-images';

const png = (w: number, h: number) => `data:image/png;base64,${makePng(w, h).toString('base64')}`;

describe('UploadAssetDto', () => {
  const check = (o: object) => validate(plainToInstance(UploadAssetDto, o));
  it('aceita kind válido e ficheiro', async () => {
    expect(await check({ kind: 'LOGO', file: png(10, 10) })).toHaveLength(0);
  });
  it('rejeita kind inválido e ficheiro em falta', async () => {
    expect((await check({ kind: 'OUTRO', file: png(10, 10) })).length).toBeGreaterThan(0);
    expect((await check({ kind: 'LOGO' })).length).toBeGreaterThan(0);
  });
});

describe('CertificateAssetsService', () => {
  const prisma = {
    certificateAsset: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const svc = new CertificateAssetsService(prisma as never, audit as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.certificateAsset.create.mockImplementation(async ({ data }) => ({
      id: 'asset12345678',
      createdAt: new Date(),
      ...data,
    }));
  });

  describe('upload', () => {
    it('guarda os bytes validados e devolve só metadados', async () => {
      const r = await svc.upload({ kind: 'LOGO', file: png(120, 60) }, 9);
      expect(r).toEqual({
        id: 'asset12345678',
        kind: 'LOGO',
        mime: 'image/png',
        width: 120,
        height: 60,
        size: expect.any(Number),
      });
      const data = prisma.certificateAsset.create.mock.calls[0][0].data;
      expect(data.data).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(data.data).subarray(1, 4).toString()).toBe('PNG');
      expect(data.createdById).toBe(9);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CERTIFICATE_ASSET_UPLOADED', userId: 9, strict: true }),
      );
    });

    it.each([
      ['SVG', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
      ['GIF', 'data:image/gif;base64,R0lGODlhAQABAAAAACw='],
      ['texto', 'olá'],
    ])('rejeita %s sem gravar nem auditar', async (_n, file) => {
      await expect(svc.upload({ kind: 'LOGO', file }, 9)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.certificateAsset.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('executável renomeado para PNG → 400', async () => {
      const exe = `data:image/png;base64,${Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 1)]).toString('base64')}`;
      await expect(svc.upload({ kind: 'LOGO', file: exe }, 9)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('logótipo e assinatura têm limite de 4000 px; o fundo aceita até 6000 px', async () => {
      await expect(svc.upload({ kind: 'LOGO', file: png(4001, 10) }, 9)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        svc.upload({ kind: 'SIGNATURE', file: png(4001, 10) }, 9),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.upload({ kind: 'BACKGROUND', file: png(4001, 10) }, 9),
      ).resolves.toMatchObject({
        kind: 'BACKGROUND',
      });
    });
  });

  describe('read', () => {
    it('devolve mime e bytes', async () => {
      prisma.certificateAsset.findUnique.mockResolvedValue({
        mime: 'image/png',
        data: new Uint8Array([1, 2, 3]),
      });
      const r = await svc.read('asset12345678');
      expect(r.mime).toBe('image/png');
      expect(Buffer.isBuffer(r.data)).toBe(true);
      expect([...r.data]).toEqual([1, 2, 3]);
    });
    it('desconhecido → 404', async () => {
      prisma.certificateAsset.findUnique.mockResolvedValue(null);
      await expect(svc.read('nao-existe-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('loadForRender', () => {
    it('carrega só os ids pedidos e ignora os que faltam', async () => {
      prisma.certificateAsset.findMany.mockResolvedValue([
        { id: 'logo-id-0001', data: new Uint8Array([1]) },
        { id: 'sign-id-0001', data: new Uint8Array([2]) },
      ]);
      const r = await svc.loadForRender({
        logoId: 'logo-id-0001',
        backgroundId: 'bg-id-000001',
        signatureId: 'sign-id-0001',
      });
      expect(prisma.certificateAsset.findMany.mock.calls[0][0].where).toEqual({
        id: { in: ['logo-id-0001', 'bg-id-000001', 'sign-id-0001'] },
      });
      expect(Object.keys(r).sort()).toEqual(['logo', 'signature']);
      expect([...(r.logo as Buffer)]).toEqual([1]);
    });

    it('sem ids não consulta a BD', async () => {
      expect(await svc.loadForRender({})).toEqual({});
      expect(prisma.certificateAsset.findMany).not.toHaveBeenCalled();
    });
  });
});
