import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/innova_test';

// Schema-only spec: exercita o agregado `LeadershipProgram` directamente contra
// o PostgreSQL de teste, sem levantar a app Nest. É esta classe de teste (e só
// esta) que apanha a divergência schema ↔ código deste repositório — os testes
// unitários fazem mock do PrismaService e aceitam qualquer nome de campo.
describe('Leadership Program Schema (integração)', () => {
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  const CODE_A = 'LDR-SCHEMA-A';
  const CODE_B = 'LDR-SCHEMA-B';

  let employeeId: number;
  let managerId: number;
  let adminId: number;
  let departmentId: number;
  let competencyId: number;
  let courseId: number;
  let documentId: number;

  const createdProgramIds: number[] = [];

  const programData = (overrides: Record<string, any> = {}) => ({
    code: CODE_A,
    name: 'Programa Schema Integração',
    level: 'INITIAL' as const,
    createdById: adminId,
    ...overrides,
  });

  beforeAll(async () => {
    const employee = await prisma.user.findUnique({
      where: { email: 'int.employee@innova-test.com' },
    });
    const manager = await prisma.user.findUnique({
      where: { email: 'int.manager@innova-test.com' },
    });
    const admin = await prisma.user.findUnique({
      where: { email: 'int.admin@innova-test.com' },
    });
    employeeId = employee!.id;
    managerId = manager!.id;
    adminId = admin!.id;
    departmentId = employee!.departmentId!;

    const course = await prisma.course.findUnique({ where: { internalCode: 'INT-TEST-001' } });
    courseId = course!.id;

    const competency = await prisma.competency.upsert({
      where: { name: 'Liderança Schema Integração' },
      update: {},
      create: {
        name: 'Liderança Schema Integração',
        category: 'LEADERSHIP',
        type: 'LEADERSHIP',
      },
    });
    competencyId = competency.id;

    const document = await prisma.document.create({
      data: {
        title: 'Doc Schema Liderança',
        category: 'LEARNING',
        fileUrl: 'https://ci.innova.test/doc-schema-lideranca.pdf',
        mimeType: 'application/pdf',
        createdById: adminId,
      },
    });
    documentId = document.id;
  });

  afterAll(async () => {
    // FK RESTRICT: filhos antes dos pais. Cada passo com .catch por convenção
    // de test/integration/teardown.ts.
    if (createdProgramIds.length) {
      const where = { programId: { in: createdProgramIds } };
      await prisma.leadershipProgramCommunication.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramDocument.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramCost.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProject.deleteMany({ where }).catch(() => undefined);

      const participants = await prisma.leadershipProgramParticipant
        .findMany({ where, select: { id: true } })
        .catch(() => [] as { id: number }[]);
      const participantIds = participants.map((p) => p.id);
      if (participantIds.length) {
        const plans = await prisma.leadershipParticipantPlan
          .findMany({ where: { participantId: { in: participantIds } }, select: { id: true } })
          .catch(() => [] as { id: number }[]);
        await prisma.leadershipParticipantPlanAction
          .deleteMany({ where: { planId: { in: plans.map((p) => p.id) } } })
          .catch(() => undefined);
        await prisma.leadershipParticipantPlan
          .deleteMany({ where: { participantId: { in: participantIds } } })
          .catch(() => undefined);
        await prisma.leadershipParticipantAssessment
          .deleteMany({ where: { participantId: { in: participantIds } } })
          .catch(() => undefined);
      }
      await prisma.leadershipProgramParticipant.deleteMany({ where }).catch(() => undefined);

      await prisma.leadershipProgramAdvisor.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramMethodology.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramContent.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramObjective.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramCompetency.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipSelectionCriterion.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgramTargeting.deleteMany({ where }).catch(() => undefined);
      await prisma.certificate.deleteMany({ where }).catch(() => undefined);
      await prisma.leadershipProgram
        .deleteMany({ where: { id: { in: createdProgramIds } } })
        .catch(() => undefined);
    }

    if (documentId) {
      await prisma.document.deleteMany({ where: { id: documentId } }).catch(() => undefined);
    }
    await prisma.competency
      .deleteMany({ where: { name: 'Liderança Schema Integração' } })
      .catch(() => undefined);

    await prisma.$disconnect();
    await pool.end();
  });

  it('enforces unique code and user-program participation', async () => {
    const program = await prisma.leadershipProgram.create({
      data: programData({ code: CODE_A }),
    });
    createdProgramIds.push(program.id);
    expect(program.code).toBe(CODE_A);

    await expect(
      prisma.leadershipProgram.create({ data: programData({ code: CODE_A }) }),
    ).rejects.toThrow();

    const participant = await prisma.leadershipProgramParticipant.create({
      data: { userId: employeeId, programId: program.id },
    });
    expect(participant.status).toBe('ENROLLED');

    await expect(
      prisma.leadershipProgramParticipant.create({
        data: { userId: employeeId, programId: program.id },
      }),
    ).rejects.toThrow();
  });

  it('persiste os campos de planeamento do agregado com FKs canónicas', async () => {
    const program = await prisma.leadershipProgram.create({
      data: programData({
        code: CODE_B,
        name: 'Programa Schema Planeamento',
        type: 'HIGH_POTENTIAL',
        corporateLevel: 'MANAGER',
        objective: 'Preparar gestores para funções de direcção',
        responsibleId: managerId,
        departmentId,
        modality: 'HYBRID',
        location: 'Luanda — Sede',
        workloadHours: 120,
        totalSessions: 12,
        sessionFrequency: 'BIWEEKLY',
        capacity: 30,
        minParticipants: 10,
        schedule: 'Terças, 09h00–13h00',
        calendarNotes: 'Pausa em Agosto',
        minAttendanceRate: 80,
        minFinalScore: 70,
        requireFinalProject: true,
        completionCriteria: 'Presença ≥ 80% e projecto aprovado',
        certificationEnabled: true,
        certificateTitle: 'Certificado de Liderança Avançada',
        certificateValidityDays: 730,
      }),
    });
    createdProgramIds.push(program.id);

    expect(program.status).toBe('DRAFT');
    expect(program.createdById).toBe(adminId);
    expect(program.responsibleId).toBe(managerId);
    expect(program.departmentId).toBe(departmentId);
    expect(program.type).toBe('HIGH_POTENTIAL');
    expect(program.corporateLevel).toBe('MANAGER');
    expect(program.modality).toBe('HYBRID');
    expect(program.sessionFrequency).toBe('BIWEEKLY');
    expect(program.requireFinalProject).toBe(true);
    expect(program.certificationEnabled).toBe(true);

    const reloaded = await prisma.leadershipProgram.findUnique({
      where: { code: CODE_B },
      include: { createdBy: true, responsible: true, department: true },
    });
    expect(reloaded!.createdBy!.fullName).toBe('Admin Int');
    expect(reloaded!.responsible!.fullName).toBe('Manager Int');
    expect(reloaded!.department!.code).toBe('DEPT-INT-TEST');
  });

  it('liga as entidades dependentes ao agregado e reutiliza os modelos canónicos', async () => {
    const program = await prisma.leadershipProgram.findUnique({ where: { code: CODE_B } });
    const programId = program!.id;

    await prisma.leadershipProgramTargeting.create({
      data: {
        programId,
        scope: 'DEPARTMENT',
        departmentId,
        description: 'Todo o departamento de teste',
      },
    });
    await prisma.leadershipProgramTargeting.create({
      data: { programId, scope: 'PERFORMANCE', minValue: 3.5, maxValue: 5 },
    });

    await prisma.leadershipSelectionCriterion.create({
      data: {
        programId,
        name: 'Desempenho',
        source: 'PERFORMANCE_REVIEW',
        weight: 60,
        minScore: 3,
      },
    });
    await prisma.leadershipSelectionCriterion.create({
      data: {
        programId,
        name: 'Competências',
        source: 'COMPETENCY_ASSESSMENT',
        weight: 40,
        competencyId,
      },
    });
    await expect(
      prisma.leadershipSelectionCriterion.create({
        data: { programId, name: 'Desempenho', source: 'MANUAL', weight: 10 },
      }),
    ).rejects.toThrow();

    await prisma.leadershipProgramCompetency.create({
      data: { programId, competencyId, baselineLevel: 2, targetLevel: 4, weight: 50 },
    });
    await expect(
      prisma.leadershipProgramCompetency.create({
        data: { programId, competencyId, targetLevel: 5 },
      }),
    ).rejects.toThrow();

    await prisma.leadershipProgramObjective.create({
      data: {
        programId,
        title: 'Reduzir turnover da equipa',
        type: 'BUSINESS',
        indicator: 'Turnover anual',
        targetValue: '< 8%',
      },
    });

    await prisma.leadershipProgramContent.create({
      data: { programId, contentType: 'COURSE', courseId, seq: 1 },
    });

    await prisma.leadershipProgramMethodology.create({
      data: { programId, type: 'MENTORING', weight: 30, hours: 20 },
    });

    await prisma.leadershipProgramAdvisor.create({
      data: { programId, userId: managerId, role: 'MENTOR' },
    });

    const participant = await prisma.leadershipProgramParticipant.create({
      data: {
        userId: employeeId,
        programId,
        eligibilityScore: 82.5,
        eligibilityBreakdown: JSON.stringify({ performance: 50, competency: 32.5 }),
        baselineScore: 60,
        readinessLevel: 'READY_SOON',
        mentorId: managerId,
        selectedById: adminId,
      },
    });
    expect(Number(participant.eligibilityScore)).toBe(82.5);
    expect(participant.readinessLevel).toBe('READY_SOON');

    const plan = await prisma.leadershipParticipantPlan.create({
      data: { participantId: participant.id, title: 'Percurso individual' },
    });
    await prisma.leadershipParticipantPlanAction.create({
      data: { planId: plan.id, title: 'Concluir curso base', type: 'COURSE', courseId, seq: 1 },
    });

    await prisma.leadershipParticipantAssessment.create({
      data: {
        participantId: participant.id,
        stage: 'INITIAL',
        assessorId: managerId,
        score: 65,
        readinessLevel: 'NEEDS_DEVELOPMENT',
      },
    });

    await prisma.leadershipProject.create({
      data: {
        programId,
        participantId: participant.id,
        title: 'Projecto de melhoria de processo',
        kpiName: 'Tempo de ciclo',
        kpiTarget: '-20%',
        sponsorId: adminId,
        mentorId: managerId,
      },
    });

    await prisma.leadershipProgramCost.create({
      data: { programId, category: 'INSTRUCTOR', plannedAmount: 1500000, currency: 'AOA' },
    });

    await prisma.leadershipProgramDocument.create({
      data: { programId, documentId, kind: 'SYLLABUS', uploadedById: adminId },
    });

    await prisma.leadershipProgramCommunication.create({
      data: {
        programId,
        participantId: participant.id,
        event: 'INVITATION',
        channel: 'IN_APP',
        subject: 'Convite para o programa',
      },
    });

    const full = await prisma.leadershipProgram.findUnique({
      where: { id: programId },
      include: {
        targeting: true,
        selectionCriteria: { include: { competency: true } },
        competencies: { include: { competency: true } },
        objectives: true,
        contents: { include: { course: true } },
        methodologies: true,
        advisors: true,
        participants: { include: { plan: { include: { actions: true } }, assessments: true } },
        projects: true,
        costs: true,
        documents: { include: { document: true } },
        communications: true,
      },
    });

    expect(full!.targeting).toHaveLength(2);
    expect(full!.selectionCriteria).toHaveLength(2);
    expect(full!.selectionCriteria.find((c) => c.competencyId)!.competency!.id).toBe(competencyId);
    expect(full!.competencies[0].competency.name).toBe('Liderança Schema Integração');
    expect(full!.objectives).toHaveLength(1);
    expect(full!.contents[0].course!.id).toBe(courseId);
    expect(full!.methodologies).toHaveLength(1);
    expect(full!.advisors).toHaveLength(1);
    expect(full!.participants).toHaveLength(1);
    expect(full!.participants[0].plan!.actions).toHaveLength(1);
    expect(full!.participants[0].assessments).toHaveLength(1);
    expect(full!.projects).toHaveLength(1);
    expect(full!.costs).toHaveLength(1);
    expect(full!.documents[0].document.title).toBe('Doc Schema Liderança');
    expect(full!.communications[0].status).toBe('SCHEDULED');
  });

  it('preserva os registos legados: cada programa existente tem um code único', async () => {
    const total = await prisma.leadershipProgram.count();
    const withCode = await prisma.leadershipProgram.count({ where: { NOT: { code: '' } } });
    expect(withCode).toBe(total);

    const codes = await prisma.leadershipProgram.findMany({ select: { code: true } });
    expect(new Set(codes.map((c) => c.code)).size).toBe(codes.length);
  });
});
