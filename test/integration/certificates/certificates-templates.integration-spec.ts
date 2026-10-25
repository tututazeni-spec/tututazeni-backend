import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { makePng } from '../../../src/certificates/templates/test-images';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';
const dataUrl = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString('base64')}`;

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

interface TemplateDetail {
  id: string;
  name: string;
  currentVersion: number;
  config: Record<string, any>;
  versions: { version: number }[];
}

describe('Certificate templates API (Postgres real)', () => {
  let app: NestExpressApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let auditorToken: string;
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never) as PrismaClient;
  let employeeId: number;
  let courseA: number;
  let courseB: number;
  const createdAssets: string[] = [];
  const stamp = Date.now();
  const PREMIUM = 'tpl-3-executivo-premium';
  const http = () => app.getHttpServer();
  const as = (t: string) => ({ Authorization: `Bearer ${t}` });
  const detail = async (id: string): Promise<TemplateDetail> =>
    (await request(http()).get(`/certificates/templates/${id}`).set(as(rhToken)).expect(200)).body;
  const withTitle = (cfg: Record<string, any>, title: string) => ({
    ...cfg,
    texts: { ...cfg.texts, title },
  });
  // O modelo partilha a BD de teste entre execuções: repõe-no sem imagens (as imagens de
  // execuções anteriores já foram apagadas e uma referência órfã faria o PUT dar 404).
  const resetPremium = async () => {
    const d = await detail(PREMIUM);
    await request(http())
      .put(`/certificates/templates/${PREMIUM}`)
      .set(as(rhToken))
      .send({ ...d.config, assets: {} })
      .expect(200);
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    // Como em main.ts: os uploads de imagens viajam como data URL no corpo JSON.
    app.useBodyParser('json', { limit: '8mb' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    employeeToken = await getToken(http(), 'employee');
    managerToken = await getToken(http(), 'manager');
    rhToken = await getToken(http(), 'rh');
    auditorToken = await getToken(http(), 'auditor');

    employeeId = (await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    }))!.id;
    await resetPremium();
    const mk = (n: string) =>
      prisma.course.create({
        data: {
          title: `Curso Modelos ${n}`,
          internalCode: `INT-CERT-TPL-${n}-${stamp}`,
          description: 'x',
          status: 'PUBLISHED',
        },
      });
    courseA = (await mk('A')).id;
    courseB = (await mk('B')).id;
    const done = { status: 'COMPLETED' as const, progress: 100, completedAt: new Date() };
    await prisma.enrollment.createMany({
      data: [
        { courseId: courseA, userId: employeeId, ...done },
        { courseId: courseB, userId: employeeId, ...done },
      ],
    });
  });

  afterAll(async () => {
    await resetPremium().catch((): undefined => undefined);
    const ids = [courseA, courseB];
    // filhos antes de pais: certificado → regra/matrícula → curso; imagens à parte
    await prisma.certificate
      .deleteMany({ where: { courseId: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.certificateRule
      .deleteMany({ where: { activityId: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.enrollment
      .deleteMany({ where: { courseId: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.course
      .deleteMany({ where: { id: { in: ids } } })
      .catch((): undefined => undefined);
    await prisma.certificateAsset
      .deleteMany({ where: { id: { in: createdAssets } } })
      .catch((): undefined => undefined);
    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('biblioteca de nove modelos', () => {
    it('devolve exactamente 9, repetidamente e com pedidos concorrentes', async () => {
      const first = await request(http())
        .get('/certificates/templates')
        .set(as(rhToken))
        .expect(200);
      expect(first.body).toHaveLength(9);
      const burst = await Promise.all(
        Array.from({ length: 3 }, () =>
          request(http()).get('/certificates/templates').set(as(rhToken)),
        ),
      );
      for (const r of burst) {
        expect(r.status).toBe(200);
        expect(r.body).toHaveLength(9);
      }
      expect(await prisma.certificateTemplate.count({ where: { isSystem: true } })).toBe(9);
    });

    it('os nomes seguem os nove conceitos e não expõe html nem css', async () => {
      const res = await request(http())
        .get('/certificates/templates')
        .set(as(auditorToken))
        .expect(200);
      expect(res.body.map((t: { name: string }) => t.name)).toEqual([
        'Corporativo clássico',
        'Moderno minimalista',
        'Executivo premium',
        'Institucional formal',
        'Tecnológico contemporâneo',
        'Elegante com elementos geométricos',
        'Académico tradicional',
        'Moderno com faixa lateral',
        'Premium com moldura e destaque',
      ]);
      for (const t of res.body) {
        expect(t).not.toHaveProperty('html');
        expect(t).not.toHaveProperty('cssStyle');
        expect(t).not.toHaveProperty('config');
      }
    });

    it('modelos antigos criados em Definições não aparecem na biblioteca', async () => {
      const legacy = await prisma.certificateTemplate.create({
        data: { name: `Legado ${stamp}`, html: '<p/>', createdById: employeeId },
      });
      try {
        const res = await request(http())
          .get('/certificates/templates')
          .set(as(rhToken))
          .expect(200);
        expect(res.body.map((t: { id: string }) => t.id)).not.toContain(legacy.id);
        await request(http())
          .get(`/certificates/templates/${legacy.id}`)
          .set(as(rhToken))
          .expect(404);
      } finally {
        await prisma.certificateTemplate.delete({ where: { id: legacy.id } });
      }
    });
  });

  describe('autorização', () => {
    it.each([
      ['get', '/certificates/templates'],
      ['get', `/certificates/templates/${PREMIUM}`],
      ['post', '/certificates/templates/preview'],
      ['put', `/certificates/templates/${PREMIUM}`],
      ['post', '/certificates/assets'],
      ['get', '/certificates/assets/qualquer-id-123'],
    ] as const)('colaborador e gestor → 403 em %s %s', async (method, path) => {
      for (const t of [employeeToken, managerToken]) {
        await request(http())[method](path).set(as(t)).send({}).expect(403);
      }
    });

    it('auditor lê e pré-visualiza, mas não grava nem carrega imagens', async () => {
      const d = await detail(PREMIUM);
      const pdf = await request(http())
        .post('/certificates/templates/preview')
        .set(as(auditorToken))
        .send(d.config)
        .buffer(true)
        .parse(binary)
        .expect(201);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      await request(http())
        .put(`/certificates/templates/${PREMIUM}`)
        .set(as(auditorToken))
        .send(d.config)
        .expect(403);
      await request(http())
        .post('/certificates/assets')
        .set(as(auditorToken))
        .send({ kind: 'LOGO', file: dataUrl('image/png', makePng(20, 20)) })
        .expect(403);
    });
  });

  describe('guardar versões', () => {
    it('variável inventada, mau contraste e mudança de layout → 400', async () => {
      const d = await detail(PREMIUM);
      const put = (cfg: object) =>
        request(http()).put(`/certificates/templates/${PREMIUM}`).set(as(rhToken)).send(cfg);

      const unknownVar = await put({
        ...d.config,
        texts: { ...d.config.texts, recognition: 'Olá {{inventada}}' },
      }).expect(400);
      expect(JSON.stringify(unknownVar.body.message)).toContain('inventada');

      await put({
        ...d.config,
        colors: { ...d.config.colors, text: '#0B1426', background: '#0B1426' },
      }).expect(400);
      await put({ ...d.config, layoutKey: 'faixa-lateral' }).expect(400);
      expect((await detail(PREMIUM)).currentVersion).toBe(d.currentVersion);
    });

    it('guardar cria a versão seguinte e regista o autor', async () => {
      const d = await detail(PREMIUM);
      const res = await request(http())
        .put(`/certificates/templates/${PREMIUM}`)
        .set(as(rhToken))
        .send(withTitle(d.config, `TÍTULO ${stamp}`))
        .expect(200);
      expect(res.body.currentVersion).toBe(d.currentVersion + 1);
      expect(res.body.config.texts.title).toBe(`TÍTULO ${stamp}`);
      expect(res.body.versions.map((v: { version: number }) => v.version)).toContain(
        d.currentVersion + 1,
      );
    });

    it('dois administradores a guardar ao mesmo tempo → versões distintas, nenhuma perdida', async () => {
      const d = await detail(PREMIUM);
      const results = await Promise.all(
        ['A', 'B'].map(l =>
          request(http())
            .put(`/certificates/templates/${PREMIUM}`)
            .set(as(rhToken))
            .send(withTitle(d.config, `Concorrente ${l} ${stamp}`)),
        ),
      );
      expect(results.map(r => r.status)).toEqual([200, 200]);
      const after = await detail(PREMIUM);
      expect(after.currentVersion).toBe(d.currentVersion + 2);
      const nums = after.versions.map(v => v.version);
      expect(nums).toEqual(expect.arrayContaining([d.currentVersion + 1, d.currentVersion + 2]));
      expect(new Set(nums).size).toBe(nums.length);
    });
  });

  describe('imagens', () => {
    it('carrega um PNG válido e o RH lê os mesmos bytes (com cabeçalhos de segurança)', async () => {
      const png = makePng(80, 40);
      const up = await request(http())
        .post('/certificates/assets')
        .set(as(rhToken))
        .send({ kind: 'LOGO', file: dataUrl('image/png', png) })
        .expect(201);
      createdAssets.push(up.body.id);
      expect(up.body).toMatchObject({ kind: 'LOGO', mime: 'image/png', width: 80, height: 40 });
      expect(up.body).not.toHaveProperty('data');

      const read = await request(http())
        .get(`/certificates/assets/${up.body.id}`)
        .set(as(rhToken))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((read.body as Buffer).equals(png)).toBe(true);
      expect(read.headers['content-type']).toBe('image/png');
      expect(read.headers['x-content-type-options']).toBe('nosniff');
      expect(read.headers['cache-control']).toContain('private');
    });

    it.each([
      ['SVG', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
      ['GIF', 'data:image/gif;base64,R0lGODlhAQABAAAAACw='],
      [
        'executável com MIME png',
        dataUrl('image/png', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 1)])),
      ],
      [
        'PNG de 3 MB',
        dataUrl('image/png', Buffer.concat([makePng(10, 10), Buffer.alloc(3 * 1024 * 1024)])),
      ],
    ])('rejeita %s → 400', async (_n, file) => {
      await request(http())
        .post('/certificates/assets')
        .set(as(rhToken))
        .send({ kind: 'LOGO', file })
        .expect(400);
    });

    it('guardar um modelo com imagem do tipo errado → 400 e com a certa → 200', async () => {
      const bg = await request(http())
        .post('/certificates/assets')
        .set(as(rhToken))
        .send({ kind: 'BACKGROUND', file: dataUrl('image/png', makePng(30, 20)) })
        .expect(201);
      const logo = await request(http())
        .post('/certificates/assets')
        .set(as(rhToken))
        .send({ kind: 'LOGO', file: dataUrl('image/png', makePng(30, 20)) })
        .expect(201);
      createdAssets.push(bg.body.id, logo.body.id);
      const d = await detail(PREMIUM);
      const put = (assets: object) =>
        request(http())
          .put(`/certificates/templates/${PREMIUM}`)
          .set(as(rhToken))
          .send({ ...d.config, assets });
      await put({ logoId: bg.body.id }).expect(400);
      await put({ logoId: 'nao-existe-0000' }).expect(404);
      const ok = await put({ logoId: logo.body.id, backgroundId: bg.body.id }).expect(200);
      expect(ok.body.config.assets).toEqual({ logoId: logo.body.id, backgroundId: bg.body.id });
    });
  });

  describe('pré-visualização', () => {
    it('os nove modelos pré-visualizam em PDF', async () => {
      const list = (
        await request(http()).get('/certificates/templates').set(as(rhToken)).expect(200)
      ).body;
      expect(list).toHaveLength(9);
      for (const t of list) {
        const d = await detail(t.id);
        const res = await request(http())
          .post('/certificates/templates/preview')
          .set(as(rhToken))
          .send(d.config)
          .buffer(true)
          .parse(binary)
          .expect(201);
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      }
    }, 90_000);

    it('pré-visualizar configuração inválida → 400 e não grava nada', async () => {
      const d = await detail(PREMIUM);
      await request(http())
        .post('/certificates/templates/preview')
        .set(as(rhToken))
        .send({ ...d.config, colors: { ...d.config.colors, primary: 'red' } })
        .expect(400);
      expect((await detail(PREMIUM)).currentVersion).toBe(d.currentVersion);
    });
  });

  describe('regras e imutabilidade dos certificados emitidos', () => {
    const rule = (courseId: number, templateId?: string) => ({
      activityKind: 'COURSE',
      activityId: courseId,
      mode: 'AUTOMATIC',
      criteria: { requireFullCompletion: true },
      ...(templateId ? { templateId } : {}),
    });
    const issue = async (courseId: number) =>
      (
        await request(http())
          .post('/certificates/issue')
          .set(as(rhToken))
          .send({ userId: employeeId, activityKind: 'COURSE', activityId: courseId })
          .expect(201)
      ).body.certificate as { id: number };

    it('regra com modelo inexistente → 404; com formato inválido → 400', async () => {
      await request(http())
        .put('/certificates/rules')
        .set(as(rhToken))
        .send(rule(courseA, 'tpl-nao-existe-9'))
        .expect(404);
      await request(http())
        .put('/certificates/rules')
        .set(as(rhToken))
        .send(rule(courseA, 'INVALIDO!'))
        .expect(400);
    });

    it('o certificado emitido guarda a versão do template e não muda quando o modelo é editado', async () => {
      await request(http())
        .put('/certificates/rules')
        .set(as(rhToken))
        .send(rule(courseA, PREMIUM))
        .expect(200);
      await request(http())
        .put('/certificates/rules')
        .set(as(rhToken))
        .send(rule(courseB, PREMIUM))
        .expect(200);

      const before = await detail(PREMIUM);
      const old = await issue(courseA);
      const oldRow = await prisma.certificate.findUnique({ where: { id: old.id } });
      const oldSnap = JSON.parse(oldRow!.snapshot!);
      expect(oldSnap.template).toMatchObject({ id: PREMIUM, version: before.currentVersion });
      expect(oldRow!.templateId).toBe(PREMIUM);

      // Edita o modelo (nova versão) — o certificado antigo não pode mudar.
      const newTitle = `EDITADO DEPOIS ${stamp}`;
      await request(http())
        .put(`/certificates/templates/${PREMIUM}`)
        .set(as(rhToken))
        .send(withTitle(before.config, newTitle))
        .expect(200);

      const pdfOld = await request(http())
        .get(`/certificates/${old.id}/pdf`)
        .set(as(employeeToken))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((pdfOld.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      const oldAfter = JSON.parse(
        (await prisma.certificate.findUnique({ where: { id: old.id } }))!.snapshot!,
      );
      expect(oldAfter.template.version).toBe(before.currentVersion);
      expect(oldAfter.template.config.texts.title).toBe(before.config.texts.title);
      expect(oldAfter.template.config.texts.title).not.toBe(newTitle);

      // Um certificado novo usa a versão nova.
      const fresh = await issue(courseB);
      const freshSnap = JSON.parse(
        (await prisma.certificate.findUnique({ where: { id: fresh.id } }))!.snapshot!,
      );
      expect(freshSnap.template.version).toBe(before.currentVersion + 1);
      expect(freshSnap.template.config.texts.title).toBe(newTitle);
    });

    it('a reemissão mantém o template do original', async () => {
      const cert = await prisma.certificate.findFirst({
        where: { courseId: courseA, userId: employeeId },
      });
      const res = await request(http())
        .post(`/certificates/${cert!.id}/reissue`)
        .set(as(rhToken))
        .send({ reason: 'Correcção de teste' })
        .expect(201);
      const replacement = await prisma.certificate.findUnique({
        where: { id: res.body.replacement.id },
      });
      const snap = JSON.parse(replacement!.snapshot!);
      const original = JSON.parse(cert!.snapshot!);
      expect(snap.template.version).toBe(original.template.version);
      expect(snap.template.id).toBe(PREMIUM);
    });
  });
});
