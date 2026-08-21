import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken, INT_CREDENTIALS } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

describe('Audit Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let adminToken: string;
  let employeeId: number;

  let logId: number;

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

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

    employeeToken = await getToken(app.getHttpServer(), 'employee');
    rhToken = await getToken(app.getHttpServer(), 'rh');
    adminToken = await getToken(app.getHttpServer(), 'admin');

    const employeeUser = await prisma.user.findUnique({
      where: { email: INT_CREDENTIALS.employee.email },
    });
    employeeId = employeeUser!.id;

    // Fixture determinística: a maioria dos módulos de negócio grava auditoria
    // através de common/services/audit.service.ts (fila Bull, sem hash chain),
    // não através deste módulo — semeia-se directamente para não depender do
    // worker da fila.
    const entry = await (prisma as any).auditLog.create({
      data: {
        userId: employeeId,
        action: 'UPDATE',
        entity: 'IntegrationTestEntity',
        entityId: employeeId,
        before: JSON.stringify({ status: 'OLD' }),
        after: JSON.stringify({ status: 'NEW' }),
        changes: JSON.stringify({ status: { from: 'OLD', to: 'NEW' } }),
        severity: 'MEDIUM',
      },
    });
    logId = entry.id;
  });

  afterAll(async () => {
    await (prisma as any).auditLog
      .deleteMany({ where: { entity: 'IntegrationTestEntity' } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
    await app.close();
  });

  describe('Acesso — restrito a ADMIN/RH', () => {
    it('sem token → 401', async () => {
      await request(app.getHttpServer()).get('/audit').expect(401);
    });

    it('colaborador não pode listar logs → 403', async () => {
      await request(app.getHttpServer())
        .get('/audit')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH lista logs → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta.total');
    });

    it('RH filtra logs por entidade → só devolve a entidade pedida', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit?entity=IntegrationTestEntity')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.data.every((l: any) => l.entity === 'IntegrationTestEntity')).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Estatísticas e anomalias', () => {
    it('colaborador não acede a estatísticas → 403', async () => {
      await request(app.getHttpServer())
        .get('/audit/stats')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('RH vê estatísticas agregadas → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit/stats')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('totals');
      expect(res.body).toHaveProperty('byAction');
    });

    it('RH vê o resumo de anomalias → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit/anomalies')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('totalAlerts');
    });
  });

  describe('Detalhe, timeline e histórico', () => {
    it('detalhe de log existente → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/audit/${logId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('id', logId);
    });

    // NOTA: findOne() não lança NotFoundException — devolve null com 200.
    // Documenta o comportamento actual (possível lacuna: nenhum teste prévio
    // cobria este caso de erro/ausência).
    it('log inexistente devolve 200 sem propriedades de log (não lança 404)', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit/999999999')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      // Serviço devolve `null`; a serialização JSON de Express não distingue
      // isso de um objecto vazio no corpo recebido — o que importa aqui é que
      // NÃO é o log real (sem propriedade `id`).
      expect(res.body).not.toHaveProperty('id');
    });

    it('timeline do recurso devolve os eventos com o diff aplicado', async () => {
      const res = await request(app.getHttpServer())
        .get(`/audit/timeline/IntegrationTestEntity/${employeeId}`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body.events.length).toBeGreaterThan(0);
      expect(res.body.events[0].changes).toEqual({ status: { from: 'OLD', to: 'NEW' } });
    });

    it('histórico do utilizador combina audit logs e histórico legado → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/audit/users/${employeeId}/history`)
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('auditLogs');
      expect(res.body).toHaveProperty('historyRecords');
    });
  });

  describe('Integridade da cadeia — restrito a ADMIN', () => {
    it('RH não pode verificar integridade (só ADMIN) → 403', async () => {
      await request(app.getHttpServer())
        .get('/audit/integrity/verify')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });

    // NOTA: descoberta ao escrever este teste — a generalidade dos módulos de
    // negócio (academic, career-plans, etc.) audita através de
    // common/services/audit.service.ts, que NÃO preenche hash/previousHash.
    // Como resultado, verifyIntegrity() reporta essas entradas como "broken"
    // mesmo sem qualquer adulteração real: a cadeia de hash deste módulo não
    // está de facto ligada à generalidade da auditoria da aplicação.
    it('ADMIN verifica a integridade — reflecte que entradas fora da cadeia (sem hash) são reportadas como quebradas', async () => {
      // verifyIntegrity() ordena por timestamp ASC e só verifica os primeiros
      // `limit` registos (default 100). A BD de teste partilhada acumula
      // muito mais do que isso ao longo do tempo, por isso o registo semeado
      // por este teste (o mais recente) só entra na verificação com um limit
      // suficientemente grande.
      const res = await request(app.getHttpServer())
        .get('/audit/integrity/verify?limit=1000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('checked');
      expect(res.body.broken).toContain(logId);
      expect(res.body.valid).toBe(false);
    });
  });

  describe('Exportação — restrito a ADMIN', () => {
    it('RH não pode exportar (só ADMIN) → 403', async () => {
      await request(app.getHttpServer())
        .post('/audit/export')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(403);
    });

    it('ADMIN exporta logs e a própria exportação fica registada', async () => {
      const res = await request(app.getHttpServer())
        .post('/audit/export?entity=IntegrationTestEntity')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('exported');
      expect(res.body.data.length).toBeGreaterThan(0);

      const listRes = await request(app.getHttpServer())
        .get('/audit?action=EXPORT&entity=AuditLog')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);
      expect(listRes.body.meta.total).toBeGreaterThan(0);
    });
  });
});
