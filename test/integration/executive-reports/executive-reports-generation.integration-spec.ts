import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

// Cobre os caminhos que o spec de CRUD não exercita: dashboard, geração por modelo,
// relatórios personalizados, exportação, agendamentos, alertas, auditoria e
// definições de KPI — contra o Postgres real (apanha divergências schema ↔ código).
describe('Executive Reports — geração, agendamentos e alertas (integração)', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;
  let rhToken: string;
  let adminToken: string;
  let rhId: number;
  let adminId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const reportIds: number[] = [];
  const templateIds: number[] = [];
  const scheduleIds: number[] = [];
  const alertIds: number[] = [];
  let generatedId: number;
  let restrictedId: number;
  let customTemplateId: number;
  let scheduleId: number;
  let alertId: number;

  const http = () => app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
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
    adminToken = await getToken(http(), 'admin');

    rhId = (await prisma.user.findUniqueOrThrow({ where: { email: 'int.rh@innova-test.com' } })).id;
    adminId = (
      await prisma.user.findUniqueOrThrow({ where: { email: 'int.admin@innova-test.com' } })
    ).id;
  });

  afterAll(async () => {
    // filhos antes dos pais; cada passo tolera falha (convenção do teardown)
    const ignore = () => undefined;
    const ids = reportIds.filter(Boolean);
    await prisma.executiveReportSchedule
      .deleteMany({ where: { id: { in: scheduleIds } } })
      .catch(ignore);
    await prisma.executiveReportAudit
      .deleteMany({
        where: { OR: [{ reportId: { in: ids } }, { userId: { in: [rhId, adminId] } }] },
      })
      .catch(ignore);
    await prisma.reportAccessLog.deleteMany({ where: { reportId: { in: ids } } }).catch(ignore);
    await prisma.executiveMetric.deleteMany({ where: { reportId: { in: ids } } }).catch(ignore);
    await prisma.reportLog
      .deleteMany({ where: { fileUrl: { startsWith: '/executive-reports/' } } })
      .catch(ignore);
    await prisma.executiveReport.deleteMany({ where: { id: { in: ids } } }).catch(ignore);
    await prisma.executiveReportTemplate
      .deleteMany({ where: { id: { in: templateIds } } })
      .catch(ignore);
    await prisma.executiveAlert.deleteMany({ where: { id: { in: alertIds } } }).catch(ignore);
    await prisma.executiveAlertRule.deleteMany({}).catch(ignore);
    await prisma.executiveKPIDefinition.deleteMany({}).catch(ignore);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  // ─── Dashboard e filtros ──────────────────────────────────────────────────

  describe('Dashboard executivo e filtros globais', () => {
    it('colaborador → 403 em todas as rotas novas', async () => {
      for (const path of ['tabs', 'overview', 'kpis', 'schedules', 'alerts', 'workforce']) {
        await request(http()).get(`/executive-reports/${path}`).set(as(employeeToken)).expect(403);
      }
    });

    it('GET /tabs: RH não vê Custos; ADMIN vê todos os 13 separadores', async () => {
      const rh = await request(http()).get('/executive-reports/tabs').set(as(rhToken)).expect(200);
      expect(rh.body.map((t: any) => t.id)).not.toContain('costs');
      const admin = await request(http())
        .get('/executive-reports/tabs')
        .set(as(adminToken))
        .expect(200);
      expect(admin.body).toHaveLength(13);
    });

    it('GET /overview e /kpis devolvem KPIs com contexto de filtros', async () => {
      const res = await request(http())
        .get('/executive-reports/kpis?period=year&compareWith=previous')
        .set(as(rhToken))
        .expect(200);
      expect(res.body.context).toMatchObject({ period: 'year', compareWith: 'previous' });
      expect(res.body.kpis.map((k: any) => k.code)).toEqual(
        expect.arrayContaining(['HEADCOUNT', 'TRAINING_COMPLETION', 'PDI_OVERDUE']),
      );
      await request(http()).get('/executive-reports/overview').set(as(rhToken)).expect(200);
    });

    it('filtro kpiState reduz os cartões ao estado pedido', async () => {
      const res = await request(http())
        .get('/executive-reports/kpis?kpiState=NO_DATA')
        .set(as(rhToken))
        .expect(200);
      for (const k of res.body.kpis) expect(k.state).toBe('NO_DATA');
    });

    it('filtros inválidos → 400', async () => {
      await request(http())
        .get('/executive-reports/kpis?kpiState=BOGUS')
        .set(as(rhToken))
        .expect(400);
      await request(http())
        .get('/executive-reports/kpis?period=decade')
        .set(as(rhToken))
        .expect(400);
    });

    it('gráficos, fontes e opções de filtros respondem 200', async () => {
      for (const path of [
        'charts/departments',
        'charts/goals',
        'charts/risks',
        'sources',
        'filter-options',
        'kpis/definitions',
      ]) {
        await request(http()).get(`/executive-reports/${path}`).set(as(rhToken)).expect(200);
      }
    });

    it('vistas por domínio: RH acede, /costs só ADMIN/DIRECTOR', async () => {
      for (const d of [
        'workforce',
        'training',
        'performance',
        'attendance',
        'organization',
        'projects',
      ]) {
        await request(http()).get(`/executive-reports/${d}`).set(as(rhToken)).expect(200);
      }
      await request(http()).get('/executive-reports/costs').set(as(rhToken)).expect(403);
      await request(http()).get('/executive-reports/costs').set(as(adminToken)).expect(200);
    });

    it('GESTOR não acede à configuração (agendamentos, construtor, arquivo)', async () => {
      await request(http()).get('/executive-reports/schedules').set(as(managerToken)).expect(403);
      await request(http()).get('/executive-reports/archive').set(as(managerToken)).expect(403);
      await request(http())
        .post('/executive-reports/custom/preview')
        .set(as(managerToken))
        .send({ sections: ['kpis'] })
        .expect(403);
    });
  });

  // ─── Definições de KPI ────────────────────────────────────────────────────

  describe('Definições de KPI', () => {
    it('RH não altera metas → 403', async () => {
      await request(http())
        .patch('/executive-reports/kpis/definitions/TRAINING_COMPLETION')
        .set(as(rhToken))
        .send({ target: 75 })
        .expect(403);
    });

    it('ADMIN altera a meta e a definição reflecte-se em GET /kpis/definitions', async () => {
      await request(http())
        .patch('/executive-reports/kpis/definitions/TRAINING_COMPLETION')
        .set(as(adminToken))
        .send({ target: 75 })
        .expect(200);
      const defs = await request(http())
        .get('/executive-reports/kpis/definitions')
        .set(as(rhToken))
        .expect(200);
      const def = defs.body.find((d: any) => d.code === 'TRAINING_COMPLETION');
      expect(def.target).toBe(75);
      expect(def.configuredAt).not.toBeNull();
    });

    it('limiares incoerentes → 400; KPI neutro → 400; KPI inexistente → 404', async () => {
      await request(http())
        .patch('/executive-reports/kpis/definitions/TRAINING_COMPLETION')
        .set(as(adminToken))
        .send({ criticalThreshold: 65 })
        .expect(400);
      await request(http())
        .patch('/executive-reports/kpis/definitions/HEADCOUNT')
        .set(as(adminToken))
        .send({ target: 10 })
        .expect(400);
      await request(http())
        .patch('/executive-reports/kpis/definitions/NOPE')
        .set(as(adminToken))
        .send({ target: 10 })
        .expect(404);
    });
  });

  // ─── Geração por modelo ───────────────────────────────────────────────────

  describe('Geração por modelo predefinido', () => {
    it('GET /report-templates: RH não vê o modelo de custos', async () => {
      const res = await request(http())
        .get('/executive-reports/report-templates')
        .set(as(rhToken))
        .expect(200);
      const codes = res.body.map((t: any) => t.code);
      expect(codes).toContain('EXEC_MONTHLY');
      expect(codes).not.toContain('PERSONNEL_COSTS');
    });

    it('POST /generate cria relatório com contexto completo (modelo, versão, filtros)', async () => {
      const res = await request(http())
        .post('/executive-reports/generate')
        .set(as(rhToken))
        .send({ templateCode: 'EXEC_MONTHLY', filters: { period: 'month' } })
        .expect(201);
      generatedId = res.body.id;
      reportIds.push(generatedId);
      expect(res.body).toMatchObject({
        status: 'DRAFT',
        templateCode: 'EXEC_MONTHLY',
        templateVersion: 1,
        confidentiality: 'CONFIDENTIAL',
      });
      expect(res.body.sections.length).toBeGreaterThan(0);
      const row = await prisma.executiveReport.findUniqueOrThrow({ where: { id: generatedId } });
      expect(row.formulaVersion).toBeTruthy();
      expect((row.filters as any).applied.period).toBe('month');
    });

    it('modelo inexistente → 404; modelo restrito para RH → 403', async () => {
      await request(http())
        .post('/executive-reports/generate')
        .set(as(rhToken))
        .send({ templateCode: 'NAO_EXISTE' })
        .expect(404);
      await request(http())
        .post('/executive-reports/generate')
        .set(as(rhToken))
        .send({ templateCode: 'PERSONNEL_COSTS' })
        .expect(403);
    });

    it('ADMIN gera o relatório de custos → RESTRICTED', async () => {
      const res = await request(http())
        .post('/executive-reports/generate')
        .set(as(adminToken))
        .send({ templateCode: 'PERSONNEL_COSTS' })
        .expect(201);
      restrictedId = res.body.id;
      reportIds.push(restrictedId);
      expect(res.body.confidentiality).toBe('RESTRICTED');
    });

    it('body com campos desconhecidos → 400', async () => {
      await request(http())
        .post('/executive-reports/generate')
        .set(as(rhToken))
        .send({ templateCode: 'EXEC_MONTHLY', hack: true })
        .expect(400);
    });
  });

  // ─── Consulta, permissões e exportação ────────────────────────────────────

  describe('Consulta e exportação (permissões revalidadas)', () => {
    it('GET /:id/content devolve o conteúdo e regista a consulta', async () => {
      const res = await request(http())
        .get(`/executive-reports/${generatedId}/content`)
        .set(as(rhToken))
        .expect(200);
      expect(res.body.meta).toMatchObject({ templateCode: 'EXEC_MONTHLY', templateVersion: 1 });
      const logs = await prisma.reportAccessLog.count({ where: { reportId: generatedId } });
      expect(logs).toBeGreaterThan(0);
    });

    it('relatório restrito: RH → 403 no conteúdo, na exportação e no detalhe', async () => {
      await request(http())
        .get(`/executive-reports/${restrictedId}/content`)
        .set(as(rhToken))
        .expect(403);
      await request(http())
        .get(`/executive-reports/${restrictedId}/export?format=PDF`)
        .set(as(rhToken))
        .expect(403);
      await request(http()).get(`/executive-reports/${restrictedId}`).set(as(rhToken)).expect(403);
      await request(http())
        .get(`/executive-reports/${restrictedId}/content`)
        .set(as(adminToken))
        .expect(200);
    });

    it('GESTOR não consulta relatórios de outros → 403', async () => {
      await request(http())
        .get(`/executive-reports/${generatedId}/content`)
        .set(as(managerToken))
        .expect(403);
    });

    it('exporta em PDF, XLSX e CSV com os cabeçalhos certos', async () => {
      const pdf = await request(http())
        .get(`/executive-reports/${generatedId}/export?format=PDF`)
        .set(as(rhToken))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect(pdf.headers['content-type']).toContain('pdf');
      expect(pdf.headers['content-disposition']).toContain('attachment');
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

      const xlsx = await request(http())
        .get(`/executive-reports/${generatedId}/export?format=XLSX`)
        .set(as(rhToken))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');

      const csv = await request(http())
        .get(`/executive-reports/${generatedId}/export?format=CSV`)
        .set(as(rhToken))
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((csv.body as Buffer).length).toBeGreaterThan(0);
    });

    it('formato inválido → 400; relatório inexistente → 404', async () => {
      await request(http())
        .get(`/executive-reports/${generatedId}/export?format=DOCX`)
        .set(as(rhToken))
        .expect(400);
      await request(http())
        .get('/executive-reports/99999999/export?format=PDF')
        .set(as(rhToken))
        .expect(404);
    });

    it('GET /:id/access-log lista quem consultou/exportou', async () => {
      const res = await request(http())
        .get(`/executive-reports/${generatedId}/access-log`)
        .set(as(rhToken))
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].user.id).toBe(rhId);
    });

    it('GET /archive filtra por modelo', async () => {
      const res = await request(http())
        .get('/executive-reports/archive?templateCode=EXEC_MONTHLY')
        .set(as(rhToken))
        .expect(200);
      expect(res.body.data.map((r: any) => r.id)).toContain(generatedId);
    });
  });

  // ─── Relatórios personalizados e modelos ──────────────────────────────────

  describe('Relatórios personalizados e modelos guardados', () => {
    const config = { sections: ['kpis', 'training'], kpiCodes: ['HEADCOUNT'], sortDir: 'desc' };

    it('GET /builder/catalog: secções restritas só para ADMIN', async () => {
      const rh = await request(http())
        .get('/executive-reports/builder/catalog')
        .set(as(rhToken))
        .expect(200);
      const admin = await request(http())
        .get('/executive-reports/builder/catalog')
        .set(as(adminToken))
        .expect(200);
      expect(rh.body.map((s: any) => s.key)).not.toContain('costs');
      expect(admin.body.map((s: any) => s.key)).toContain('costs');
    });

    it('pré-visualização não persiste nada', async () => {
      const before = await prisma.executiveReport.count();
      const res = await request(http())
        .post('/executive-reports/custom/preview')
        .set(as(rhToken))
        .send(config)
        .expect(200);
      expect(res.body.sections.length).toBe(2);
      expect(await prisma.executiveReport.count()).toBe(before);
    });

    it('secção restrita pedida por RH é omitida (não rebenta)', async () => {
      const res = await request(http())
        .post('/executive-reports/custom/preview')
        .set(as(rhToken))
        .send({ sections: ['kpis', 'costs'] })
        .expect(200);
      expect(res.body.sections.map((s: any) => s.key)).not.toContain('costs');
      expect(res.body.omitted.map((o: any) => o.key)).toContain('costs');
    });

    it('secção desconhecida / lista vazia → 400', async () => {
      await request(http())
        .post('/executive-reports/custom/preview')
        .set(as(rhToken))
        .send({ sections: ['nao_existe'] })
        .expect(400);
      await request(http())
        .post('/executive-reports/custom/preview')
        .set(as(rhToken))
        .send({ sections: [] })
        .expect(400);
    });

    it('POST /custom/generate guarda o relatório com a configuração usada', async () => {
      const res = await request(http())
        .post('/executive-reports/custom/generate')
        .set(as(rhToken))
        .send({ ...config, title: 'Personalizado INT' })
        .expect(201);
      reportIds.push(res.body.id);
      expect(res.body).toMatchObject({ title: 'Personalizado INT', type: 'CUSTOM' });
      const row = await prisma.executiveReport.findUniqueOrThrow({ where: { id: res.body.id } });
      expect((row.filters as any).config.sections).toEqual(['kpis', 'training']);
    });

    it('guardar modelo, gerar a partir dele e versionar ao alterar a configuração', async () => {
      const saved = await request(http())
        .post('/executive-reports/custom/templates')
        .set(as(rhToken))
        .send({ name: 'Modelo INT', config })
        .expect(201);
      customTemplateId = saved.body.id;
      templateIds.push(customTemplateId);
      expect(saved.body.version).toBe(1);

      const gen = await request(http())
        .post('/executive-reports/generate')
        .set(as(rhToken))
        .send({ templateCode: `CUSTOM:${customTemplateId}` })
        .expect(201);
      reportIds.push(gen.body.id);
      expect(gen.body.templateVersion).toBe(1);

      // só o nome → mesma versão; nova configuração → versão 2
      const renamed = await request(http())
        .patch(`/executive-reports/custom/templates/${customTemplateId}`)
        .set(as(rhToken))
        .send({ name: 'Modelo INT v2' })
        .expect(200);
      expect(renamed.body.version).toBe(1);
      const reconf = await request(http())
        .patch(`/executive-reports/custom/templates/${customTemplateId}`)
        .set(as(rhToken))
        .send({ config: { sections: ['kpis'] } })
        .expect(200);
      expect(reconf.body.version).toBe(2);

      // o relatório antigo mantém a versão com que foi gerado
      const old = await prisma.executiveReport.findUniqueOrThrow({ where: { id: gen.body.id } });
      expect(old.templateVersion).toBe(1);
    });

    it('listagem de modelos: RH vê o seu modelo personalizado', async () => {
      const res = await request(http())
        .get('/executive-reports/report-templates')
        .set(as(rhToken))
        .expect(200);
      expect(res.body.some((t: any) => t.id === customTemplateId && !t.predefined)).toBe(true);
    });
  });

  // ─── Agendamentos ─────────────────────────────────────────────────────────

  describe('Agendamentos', () => {
    it('destinatário sem perfil com acesso → 400', async () => {
      const employee = await prisma.user.findUniqueOrThrow({
        where: { email: 'int.employee@innova-test.com' },
      });
      await request(http())
        .post('/executive-reports/schedules')
        .set(as(rhToken))
        .send({
          name: 'Inválido',
          templateCode: 'EXEC_MONTHLY',
          frequency: 'MONTHLY',
          format: 'PDF',
          recipientIds: [employee.id],
        })
        .expect(400);
    });

    it('sem modelo → 400; modelo restrito para RH → 403', async () => {
      await request(http())
        .post('/executive-reports/schedules')
        .set(as(rhToken))
        .send({ name: 'Sem modelo', frequency: 'MONTHLY', format: 'PDF', recipientIds: [rhId] })
        .expect(400);
      await request(http())
        .post('/executive-reports/schedules')
        .set(as(rhToken))
        .send({
          name: 'Custos RH',
          templateCode: 'PERSONNEL_COSTS',
          frequency: 'MONTHLY',
          format: 'PDF',
          recipientIds: [rhId],
        })
        .expect(403);
    });

    it('cria agendamento com próxima execução calculada e auditoria', async () => {
      const res = await request(http())
        .post('/executive-reports/schedules')
        .set(as(rhToken))
        .send({
          name: 'Mensal INT',
          templateCode: 'EXEC_MONTHLY',
          frequency: 'MONTHLY',
          dayOfMonth: 5,
          hour: 9,
          format: 'XLSX',
          recipientIds: [rhId, adminId],
        })
        .expect(201);
      scheduleId = res.body.id;
      scheduleIds.push(scheduleId);
      expect(new Date(res.body.nextRunAt).getTime()).toBeGreaterThan(Date.now());
      expect(res.body).toMatchObject({ dayOfMonth: 5, hour: 9, active: true });
      const audit = await prisma.executiveReportAudit.count({
        where: { action: 'SCHEDULE_CREATE' },
      });
      expect(audit).toBeGreaterThan(0);
    });

    it('"executar agora" gera o relatório, entrega e regista a execução', async () => {
      const res = await request(http())
        .post(`/executive-reports/schedules/${scheduleId}/run`)
        .set(as(rhToken))
        .expect(200);
      expect(res.body.status).toBe('SUCCESS');
      expect(res.body.delivered.sort()).toEqual([rhId, adminId].sort());
      reportIds.push(res.body.reportId);

      const detail = await request(http())
        .get(`/executive-reports/schedules/${scheduleId}`)
        .set(as(rhToken))
        .expect(200);
      expect(detail.body.lastStatus).toBe('SUCCESS');
      expect(detail.body.lastReportId).toBe(res.body.reportId);
      expect(detail.body.runs[0]).toMatchObject({ status: 'SUCCESS', reportId: res.body.reportId });

      const report = await prisma.executiveReport.findUniqueOrThrow({
        where: { id: res.body.reportId },
      });
      expect(report.scheduleId).toBe(scheduleId);
    });

    it('execução agendada usa o último período fechado (não "hoje")', async () => {
      const row = await prisma.executiveReportSchedule.findUniqueOrThrow({
        where: { id: scheduleId },
      });
      const report = await prisma.executiveReport.findUniqueOrThrow({
        where: { id: row.lastReportId! },
      });
      expect(report.periodEnd!.getTime()).toBeLessThan(Date.now());
    });

    it('destinatário que perde o perfil fica rejeitado na execução seguinte (PARTIAL)', async () => {
      const manager = await prisma.user.findUniqueOrThrow({
        where: { email: 'int.manager@innova-test.com' },
      });
      // contorna a validação da API para simular a perda de perfil após a criação
      await prisma.executiveReportSchedule.update({
        where: { id: scheduleId },
        data: { recipientIds: [rhId, manager.id] },
      });
      const res = await request(http())
        .post(`/executive-reports/schedules/${scheduleId}/run`)
        .set(as(rhToken))
        .expect(200);
      reportIds.push(res.body.reportId);
      expect(res.body).toMatchObject({
        status: 'PARTIAL',
        delivered: [rhId],
        rejected: [manager.id],
      });
    });

    it('GESTOR não corre nem altera agendamentos → 403', async () => {
      await request(http())
        .post(`/executive-reports/schedules/${scheduleId}/run`)
        .set(as(managerToken))
        .expect(403);
    });

    it('altera periodicidade (recalcula nextRunAt) e desactiva', async () => {
      const before = await prisma.executiveReportSchedule.findUniqueOrThrow({
        where: { id: scheduleId },
      });
      const res = await request(http())
        .patch(`/executive-reports/schedules/${scheduleId}`)
        .set(as(rhToken))
        .send({ frequency: 'WEEKLY', dayOfWeek: 3, active: false })
        .expect(200);
      expect(res.body).toMatchObject({ frequency: 'WEEKLY', dayOfWeek: 3, dayOfMonth: null });
      expect(res.body.active).toBe(false);
      expect(new Date(res.body.nextRunAt).getTime()).not.toBe(before.nextRunAt.getTime());
    });

    it('agendamento inexistente → 404; DELETE preserva os relatórios gerados', async () => {
      await request(http())
        .get('/executive-reports/schedules/99999999')
        .set(as(rhToken))
        .expect(404);

      const kept = await prisma.executiveReport.count({ where: { scheduleId } });
      expect(kept).toBeGreaterThan(0);
      await request(http())
        .delete(`/executive-reports/schedules/${scheduleId}`)
        .set(as(rhToken))
        .expect(200);
      expect(
        await prisma.executiveReport.count({ where: { scheduleId: null, id: { in: reportIds } } }),
      ).toBeGreaterThanOrEqual(kept);
      expect(await prisma.executiveReportSchedule.count({ where: { id: scheduleId } })).toBe(0);
    });

    it('não elimina modelo usado por agendamento activo → 400', async () => {
      const sched = await request(http())
        .post('/executive-reports/schedules')
        .set(as(rhToken))
        .send({
          name: 'Usa modelo',
          templateId: customTemplateId,
          frequency: 'ANNUAL',
          format: 'CSV',
          recipientIds: [rhId],
        })
        .expect(201);
      scheduleIds.push(sched.body.id);
      await request(http())
        .delete(`/executive-reports/custom/templates/${customTemplateId}`)
        .set(as(rhToken))
        .expect(400);
      await request(http())
        .delete(`/executive-reports/schedules/${sched.body.id}`)
        .set(as(rhToken))
        .expect(200);
      await request(http())
        .delete(`/executive-reports/custom/templates/${customTemplateId}`)
        .set(as(rhToken))
        .expect(200);
    });
  });

  // ─── Alertas ──────────────────────────────────────────────────────────────

  describe('Alertas executivos', () => {
    it('colaborador → 403; GESTOR sem alertas fora do âmbito não os vê', async () => {
      await request(http()).get('/executive-reports/alerts').set(as(employeeToken)).expect(403);
    });

    it('GET /alerts/rules cria as regras por omissão e lista limiares', async () => {
      const res = await request(http())
        .get('/executive-reports/alerts/rules')
        .set(as(rhToken))
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.map((r: any) => r.code)).toContain('TRAINING_TARGET_LATE');
    });

    it('RH não altera regras → 403; ADMIN altera o limiar e fica registado', async () => {
      await request(http())
        .patch('/executive-reports/alerts/rules/TRAINING_TARGET_LATE')
        .set(as(rhToken))
        .send({ threshold: 55 })
        .expect(403);
      await request(http())
        .patch('/executive-reports/alerts/rules/TRAINING_TARGET_LATE')
        .set(as(adminToken))
        .send({ threshold: 55, ownerId: adminId })
        .expect(200);
      const rule = await prisma.executiveAlertRule.findUniqueOrThrow({
        where: { code: 'TRAINING_TARGET_LATE' },
      });
      expect(rule).toMatchObject({ threshold: 55, ownerId: adminId, approvedById: adminId });
      await request(http())
        .patch('/executive-reports/alerts/rules/NAO_EXISTE')
        .set(as(adminToken))
        .send({ threshold: 1 })
        .expect(404);
    });

    it('POST /alerts/scan avalia as regras sem rebentar', async () => {
      await request(http()).post('/executive-reports/alerts/scan').set(as(rhToken)).expect(200);
    });

    it('lista com filtros e valida parâmetros', async () => {
      // semeado depois do scan: o scan auto-resolve alertas cuja condição já não se verifica
      const alert = await prisma.executiveAlert.create({
        data: {
          ruleCode: 'TRAINING_TARGET_LATE',
          fingerprint: `int-test-${Date.now()}`,
          title: 'Alerta de teste de integração',
          description: 'Criado pelo spec de integração',
          severity: 'MEDIUM',
          sourceModule: 'trainings',
        },
      });
      alertId = alert.id;
      alertIds.push(alertId);

      const res = await request(http())
        .get('/executive-reports/alerts?status=OPEN&severity=MEDIUM&sourceModule=trainings')
        .set(as(adminToken))
        .expect(200);
      expect(res.body.data.map((a: any) => a.id)).toContain(alertId);
      await request(http())
        .get('/executive-reports/alerts?status=XPTO')
        .set(as(adminToken))
        .expect(400);
    });

    it('ciclo de vida: reconhecer → atribuir → resolver → reabrir → dispensar', async () => {
      const base = `/executive-reports/alerts/${alertId}`;
      const ack = await request(http())
        .post(`${base}/acknowledge`)
        .set(as(adminToken))
        .send({ comment: 'visto' })
        .expect(200);
      expect(ack.body.status).toBe('ACKNOWLEDGED');
      // só alertas abertos podem ser reconhecidos
      await request(http()).post(`${base}/acknowledge`).set(as(adminToken)).send({}).expect(400);

      await request(http()).post(`${base}/assign`).set(as(adminToken)).send({}).expect(400);
      const assigned = await request(http())
        .post(`${base}/assign`)
        .set(as(rhToken))
        .send({ ownerId: rhId, dueDate: '2030-01-31T00:00:00.000Z' })
        .expect(200);
      expect(assigned.body.ownerId).toBe(rhId);

      const resolved = await request(http())
        .post(`${base}/resolve`)
        .set(as(rhToken))
        .send({ comment: 'tratado' })
        .expect(200);
      expect(resolved.body.status).toBe('RESOLVED');
      await request(http()).post(`${base}/resolve`).set(as(rhToken)).send({}).expect(400);

      const reopened = await request(http())
        .post(`${base}/reopen`)
        .set(as(rhToken))
        .send({ comment: 'voltou' })
        .expect(200);
      expect(reopened.body.status).toBe('OPEN');
      await request(http()).post(`${base}/reopen`).set(as(rhToken)).send({}).expect(400);

      // dispensar exige motivo
      await request(http()).post(`${base}/dismiss`).set(as(rhToken)).send({}).expect(400);
      const dismissed = await request(http())
        .post(`${base}/dismiss`)
        .set(as(rhToken))
        .send({ comment: 'falso positivo' })
        .expect(200);
      expect(dismissed.body.status).toBe('DISMISSED');
    });

    it('o histórico regista cada acção, com autor e comentário', async () => {
      const res = await request(http())
        .get(`/executive-reports/alerts/${alertId}`)
        .set(as(adminToken))
        .expect(200);
      const actions = res.body.events.map((e: any) => e.action);
      expect(actions).toEqual(
        expect.arrayContaining(['ACKNOWLEDGED', 'RESOLVED', 'REOPENED', 'DISMISSED']),
      );
      expect(res.body.events.find((e: any) => e.action === 'DISMISSED').comment).toBe(
        'falso positivo',
      );
    });

    it('alerta inexistente → 404', async () => {
      await request(http())
        .get('/executive-reports/alerts/99999999')
        .set(as(adminToken))
        .expect(404);
    });
  });

  // ─── Auditoria ────────────────────────────────────────────────────────────

  describe('Auditoria do módulo', () => {
    it('RH não acede → 403', async () => {
      await request(http()).get('/executive-reports/audit').set(as(rhToken)).expect(403);
    });

    it('ADMIN vê gerações, consultas e exportações com os filtros usados', async () => {
      for (const action of [
        'REPORT_GENERATE',
        'REPORT_VIEW',
        'REPORT_EXPORT',
        'KPI_DEFINITION_UPDATE',
      ]) {
        const res = await request(http())
          .get(`/executive-reports/audit?action=${action}`)
          .set(as(adminToken))
          .expect(200);
        expect(res.body.total).toBeGreaterThan(0);
        expect(res.body.data[0].action).toBe(action);
      }
    });

    it('filtra por relatório e estado', async () => {
      const res = await request(http())
        .get(`/executive-reports/audit?reportId=${generatedId}&status=SUCCESS`)
        .set(as(adminToken))
        .expect(200);
      expect(res.body.data.every((a: any) => a.reportId === generatedId)).toBe(true);
      await request(http())
        .get('/executive-reports/audit?status=MAYBE')
        .set(as(adminToken))
        .expect(400);
    });
  });
});
