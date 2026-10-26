import { Test } from '@nestjs/testing';
import { CoursesService } from './courses.service';
import { PrismaService } from '../prisma/prisma.service';
import { CertificatesService } from '../certificates/certificates.service';
import { CourseCompletionService } from '../course-completion/course-completion.service';
import { CacheService } from '../cache/cache.service';

// Cache em memória com a mesma semântica observável do CacheService real (valores via JSON).
class FakeCache {
  readonly store = new Map<string, string>();
  async getOrSet<T>(key: string, _ttl: number, compute: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit) return JSON.parse(hit) as T;
    const value = await compute();
    this.store.set(key, JSON.stringify(value));
    return value;
  }
  async get<T>(key: string): Promise<T | null> {
    const hit = this.store.get(key);
    return hit ? (JSON.parse(hit) as T) : null;
  }
  async set<T>(key: string, value: T, _ttl: number): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

const course = {
  id: 1,
  title: 'Curso Teste',
  status: 'PUBLISHED',
  createdAt: new Date('2026-01-02T03:04:05.000Z'),
  _count: { enrollments: 0, feedbacks: 0, modules: 2 },
  competencies: [],
  modules: [],
  feedbacks: [],
  department: null,
};

const prisma = {
  course: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  courseModule: { count: jest.fn() },
  learningPathCourse: { findMany: jest.fn() }, // lido por findOne()
  courseAnalytics: { create: jest.fn() },
  enrollment: { groupBy: jest.fn() },
};

async function build(cache?: FakeCache) {
  Object.defineProperty(prisma, 'read', { get: () => prisma, configurable: true });
  const moduleRef = await Test.createTestingModule({
    providers: [
      CoursesService,
      { provide: PrismaService, useValue: prisma },
      { provide: CertificatesService, useValue: {} },
      { provide: CourseCompletionService, useValue: {} },
      ...(cache ? [{ provide: CacheService, useValue: cache }] : []),
    ],
  }).compile();
  return moduleRef.get(CoursesService);
}

describe('CoursesService.findAll — cache do catálogo', () => {
  let cache: FakeCache;
  let service: CoursesService;
  const savedRls = process.env.RLS_ENABLED;

  beforeEach(async () => {
    jest.resetAllMocks();
    delete process.env.RLS_ENABLED;
    prisma.course.findMany.mockResolvedValue([course]);
    prisma.course.count.mockResolvedValue(1);
    prisma.enrollment.groupBy.mockResolvedValue([]);
    prisma.course.findUnique.mockResolvedValue(course);
    prisma.course.update.mockResolvedValue(course);
    prisma.course.create.mockResolvedValue(course);
    prisma.courseModule.count.mockResolvedValue(1);
    prisma.courseAnalytics.create.mockResolvedValue({});
    prisma.learningPathCourse.findMany.mockResolvedValue([]);
    cache = new FakeCache();
    service = await build(cache);
  });

  afterAll(() => {
    if (savedRls === undefined) delete process.env.RLS_ENABLED;
    else process.env.RLS_ENABLED = savedRls;
  });

  it('a segunda leitura com os mesmos filtros vem da cache, sem tocar na BD', async () => {
    await service.findAll({ page: 1, limit: 20 });
    await service.findAll({ page: 1, limit: 20 });
    expect(prisma.course.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.course.count).toHaveBeenCalledTimes(1);
  });

  it('a resposta vinda da cache serializa para o mesmo JSON que a calculada', async () => {
    const miss = await service.findAll({ page: 1, limit: 20 });
    const hit = await service.findAll({ page: 1, limit: 20 });
    expect(JSON.stringify(hit)).toBe(JSON.stringify(miss));
  });

  it('a ordem das chaves dos filtros não cria entradas diferentes', async () => {
    await service.findAll({ page: 1, limit: 20, status: 'PUBLISHED' as never });
    await service.findAll({ status: 'PUBLISHED' as never, limit: 20, page: 1 });
    expect(prisma.course.findMany).toHaveBeenCalledTimes(1);
  });

  it('filtros diferentes não partilham a mesma entrada', async () => {
    await service.findAll({ page: 1, limit: 20 });
    await service.findAll({ page: 2, limit: 20 });
    await service.findAll({ page: 1, limit: 20, category: 'Tech' });
    expect(prisma.course.findMany).toHaveBeenCalledTimes(3);
  });

  it('pesquisa livre (search) nunca é cacheada — cardinalidade ilimitada', async () => {
    await service.findAll({ search: 'nest' });
    await service.findAll({ search: 'nest' });
    expect(prisma.course.findMany).toHaveBeenCalledTimes(2);
    expect(cache.store.size).toBe(0);
  });

  it('o filtro livre "unit" também não é cacheado', async () => {
    await service.findAll({ unit: 'Luanda' });
    await service.findAll({ unit: 'Luanda' });
    expect(prisma.course.findMany).toHaveBeenCalledTimes(2);
  });

  it('com RLS_ENABLED=true a cache fica desligada (o resultado varia por utilizador)', async () => {
    process.env.RLS_ENABLED = 'true';
    await service.findAll({ page: 1, limit: 20 });
    await service.findAll({ page: 1, limit: 20 });
    expect(prisma.course.findMany).toHaveBeenCalledTimes(2);
    expect(cache.store.size).toBe(0);
  });

  it('sem CacheService injectado comporta-se como antes (sempre à BD)', async () => {
    const plain = await build();
    await plain.findAll({ page: 1, limit: 20 });
    await plain.findAll({ page: 1, limit: 20 });
    expect(prisma.course.findMany).toHaveBeenCalledTimes(2);
  });

  describe('invalidação por mutações', () => {
    const warm = async () => {
      await service.findAll({ page: 1, limit: 20 });
      expect(prisma.course.findMany).toHaveBeenCalledTimes(1);
    };
    const reread = async () => {
      await service.findAll({ page: 1, limit: 20 });
      expect(prisma.course.findMany).toHaveBeenCalledTimes(2);
    };

    it('create', async () => {
      await warm();
      await service.create({ title: 'Novo' } as never);
      await reread();
    });

    it('update', async () => {
      await warm();
      await service.update(1, { title: 'Outro' } as never);
      await reread();
    });

    it('archive', async () => {
      await warm();
      await service.archive(1);
      await reread();
    });

    it('publish', async () => {
      await warm();
      await service.publish(1);
      await reread();
    });

    it('uma mutação que falha NÃO invalida (nada mudou)', async () => {
      await warm();
      prisma.course.findUnique.mockResolvedValue(null);
      await expect(service.update(999, { title: 'x' } as never)).rejects.toThrow();
      await service.findAll({ page: 1, limit: 20 });
      expect(prisma.course.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
