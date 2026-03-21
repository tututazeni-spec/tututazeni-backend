import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(120000); // timeout maior para inicialização

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.$connect();
    await prisma.user.deleteMany({});
  });

  it('POST /users cria um usuário', () => {
    const email = `joao_${Date.now()}@email.com`;
    return request(app.getHttpServer())
      .post('/users')
      .send({ name: 'João', email })
      .expect(201);
  });

  it('GET /users retorna lista de usuários', async () => {
    const res = await request(app.getHttpServer()).get('/users').expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /users/:id retorna usuário', async () => {
    const user = await prisma.user.findFirst();
    return request(app.getHttpServer())
      .get(`/users/${user.id}`)
      .expect(200);
  });

  it('DELETE /users/:id remove usuário', async () => {
    const user = await prisma.user.findFirst();
    return request(app.getHttpServer())
      .delete(`/users/${user.id}`)
      .expect(200);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (app) await app.close();
  });
});

