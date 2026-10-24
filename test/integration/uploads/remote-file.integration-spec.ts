import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { RemoteFileSweeper } from '../../../src/common/files/remote-file-sweeper';
import * as remote from '../../../src/common/files/remote-file';
import {
  KeyValueClient,
  MemoryVerdictCache,
  RedisVerdictCache,
} from '../../../src/common/files/verdict-cache';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Verificação de ficheiros remotos (Postgres e Redis reais)', () => {
  describe('RedisVerdictCache contra um Redis real', () => {
    let redis: Redis;
    let cache: RedisVerdictCache;
    const run = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    beforeAll(async () => {
      redis = new Redis({
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
        db: Number(process.env.REDIS_DB) || 0,
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 1,
      });
      cache = new RedisVerdictCache(redis as unknown as KeyValueClient);
    });
    afterAll(async () => {
      await redis.quit();
    });

    it('guarda e devolve um veredicto, e expira com o TTL', async () => {
      const v = {
        validators: { etag: '"abc"', length: 10 },
        rejection: null,
        scanned: true,
        checkedAt: 1,
      };
      await cache.set(`${run}-v`, v, 1);
      expect(await cache.get(`${run}-v`)).toEqual(v);
      await new Promise(r => setTimeout(r, 1500));
      expect(await cache.get(`${run}-v`)).toBeNull();
    });

    it('markOnce é atómico entre ligações', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => cache.markOnce(`${run}-m`, 30)),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('lock é exclusivo entre instâncias e liberta-se', async () => {
      const other = new RedisVerdictCache(redis as unknown as KeyValueClient);
      const release = await cache.lock(`${run}-l`, 30);
      expect(release).not.toBeNull();
      expect(await other.lock(`${run}-l`, 30)).toBeNull();
      await release?.();
      const again = await other.lock(`${run}-l`, 30);
      expect(again).not.toBeNull();
      await again?.();
    });

    it('cursor guarda ids inteiros e de texto', async () => {
      expect(await cache.getCursor(`${run}-c`)).toBeNull();
      await cache.setCursor(`${run}-c`, 'clx9k2m0a0001');
      expect(await cache.getCursor(`${run}-c`)).toBe('clx9k2m0a0001');
      await cache.setCursor(`${run}-c`, 17);
      expect(await cache.getCursor(`${run}-c`)).toBe(17);
    });

    it('com o Redis inacessível degrada para "sem cache" em vez de falhar', async () => {
      const dead = new Redis({
        host: '127.0.0.1',
        port: 1, // ninguém a escutar
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
        commandTimeout: 500,
      });
      dead.on('error', () => undefined);
      const broken = new RedisVerdictCache(dead as unknown as KeyValueClient);
      expect(await broken.get('x')).toBeNull();
      expect(await broken.getCursor('x')).toBeNull();
      expect(await broken.markOnce('x', 10)).toBe(true);
      dead.disconnect();
    });
  });

  describe('RemoteFileSweeper na aplicação real', () => {
    let app: INestApplication;
    let sweeper: RemoteFileSweeper;
    const pool = new Pool({ connectionString: TEST_DB_URL });
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
    const code = `INT-REMOTE-${Date.now()}`;
    const goodUrl = `https://files.test/docs/${code}-ok.pdf`;
    const badUrl = `https://files.test/docs/${code}-bad.pdf`;
    const outsideUrl = `https://evil.test/docs/${code}.pdf`;
    const created: string[] = [];
    const startedAt = new Date();
    const saved = { ...process.env };

    beforeAll(async () => {
      process.env.ALLOWED_FILE_HOST = 'files.test';
      const module: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      await app.init();
      sweeper = app.get(RemoteFileSweeper);

      const uploader = await prisma.user.findFirstOrThrow({ select: { id: true } });
      for (const [i, fileUrl] of [goodUrl, badUrl, outsideUrl].entries()) {
        const row = await prisma.libraryItem.create({
          data: {
            code: `${code}-${i}`,
            title: `Item de teste ${i}`,
            type: 'PDF',
            fileUrl,
            mimeType: 'application/pdf',
            uploadedById: uploader.id,
          },
          select: { id: true },
        });
        created.push(row.id);
      }
    });

    afterAll(async () => {
      await prisma.libraryItem.deleteMany({ where: { id: { in: created } } });
      await prisma.$disconnect();
      await pool.end();
      await app.close();
      process.env = { ...saved };
    });

    it('o módulo existe na aplicação e percorre linhas reais com ids de texto (cuid)', async () => {
      expect(sweeper).toBeInstanceOf(RemoteFileSweeper);
      const verify = jest
        .spyOn(remote, 'verifyRemoteFile')
        .mockImplementation(async (url: string) =>
          url === badUrl ? 'Ficheiro rejeitado: malware detectado (Win.Test.EICAR_HDB-1).' : null,
        );
      try {
        const cache = new MemoryVerdictCache();
        const summary = await sweeper.runSweep({
          targets: [{ model: 'libraryItem', field: 'fileUrl', mimeField: 'mimeType' }],
          cache,
          pauseMs: 0,
          maxPerRun: 100000,
        });
        // Só os registos deste teste são nossos: a BD de teste pode ter outros itens.
        const mine = verify.mock.calls.map(c => c[0]).filter(u => String(u).includes(code));
        expect(mine.sort()).toEqual([badUrl, goodUrl].sort()); // o de fora da allowlist foi saltado
        expect(summary.skippedHosts).toBeGreaterThanOrEqual(1);
        expect(summary.errors).toBe(0);
        expect(summary.flagged).toBeGreaterThanOrEqual(1);
        const call = verify.mock.calls.find(c => c[0] === goodUrl);
        expect(call?.[1]).toMatchObject({ declaredMime: 'application/pdf', background: true });
      } finally {
        verify.mockRestore();
      }
    });

    it('grava STORED_FILE_FLAGGED no AuditLog como SYSTEM, sem o URL', async () => {
      let row = null;
      for (let i = 0; i < 40 && !row; i++) {
        const rows = await prisma.auditLog.findMany({
          where: {
            action: 'STORED_FILE_FLAGGED',
            entity: 'LibraryItem',
            createdAt: { gte: startedAt },
          },
          orderBy: { id: 'desc' },
        });
        row = rows.find(r => (r.metadata ?? '').includes(created[1])) ?? null;
        if (!row) await new Promise(r => setTimeout(r, 250));
      }
      expect(row).not.toBeNull();
      expect(row).toMatchObject({ userId: null, status: 'DENIED', severity: 'HIGH' });
      expect(JSON.parse(row?.metadata ?? '{}')).toMatchObject({
        model: 'libraryItem',
        field: 'fileUrl',
        id: created[1],
      });
      expect(row?.metadata).not.toContain('files.test');
    });
  });
});
