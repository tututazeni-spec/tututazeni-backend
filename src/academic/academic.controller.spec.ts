import { Test, TestingModule } from '@nestjs/testing';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  createYear: jest.fn().mockResolvedValue({ id: 1 }),
  findAllYears: jest.fn().mockResolvedValue([]),
  getCurrentYear: jest.fn().mockResolvedValue({ id: 1 }),
  createPeriod: jest.fn().mockResolvedValue({ id: 1 }),
  createProgram: jest.fn().mockResolvedValue({ id: 1 }),
  findAllPrograms: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getAcademicReport: jest.fn().mockResolvedValue({}),
  findProgramById: jest.fn().mockResolvedValue({ id: 1 }),
  createClass: jest.fn().mockResolvedValue({ id: 1 }),
  enroll: jest.fn().mockResolvedValue({ id: 1 }),
  approveEnrollment: jest.fn().mockResolvedValue({ id: 1 }),
  getMyEnrollments: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  gradeEnrollment: jest.fn().mockResolvedValue({ id: 1 }),
  getEnrollmentGrades: jest.fn().mockResolvedValue([]),
  getTranscript: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('AcademicController', () => {
  let controller: AcademicController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AcademicController],
      providers: [{ provide: AcademicService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AcademicController>(AcademicController);
  });

  it('createYear → createYear(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createYear(dto, mockUser as any);
    expect(mockSvc.createYear).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllYears → findAllYears()', async () => {
    await controller.findAllYears();
    expect(mockSvc.findAllYears).toHaveBeenCalled();
  });

  it('getCurrentYear → getCurrentYear()', async () => {
    await controller.getCurrentYear();
    expect(mockSvc.getCurrentYear).toHaveBeenCalled();
  });

  it('createPeriod → createPeriod(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createPeriod(dto, mockUser as any);
    expect(mockSvc.createPeriod).toHaveBeenCalledWith(dto, 1);
  });

  it('createProgram → createProgram(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createProgram(dto, mockUser as any);
    expect(mockSvc.createProgram).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllPrograms → findAllPrograms(filters)', async () => {
    const filters = {} as any;
    await controller.findAllPrograms(filters);
    expect(mockSvc.findAllPrograms).toHaveBeenCalledWith(filters);
  });

  it('getReport → getAcademicReport()', async () => {
    await controller.getReport();
    expect(mockSvc.getAcademicReport).toHaveBeenCalled();
  });

  it('findProgramById → findProgramById(id)', async () => {
    await controller.findProgramById('p1');
    expect(mockSvc.findProgramById).toHaveBeenCalledWith('p1');
  });

  it('createClass → createClass(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createClass(dto, mockUser as any);
    expect(mockSvc.createClass).toHaveBeenCalledWith(dto, 1);
  });

  it('enroll → enroll(dto, userId)', async () => {
    const dto = { userId: 1, programId: 'prog-1' } as any;
    await controller.enroll(dto, mockUser as any);
    expect(mockSvc.enroll).toHaveBeenCalledWith(dto, 1);
  });

  // A10-15: dto.userId não era verificado — qualquer autenticado podia
  // matricular arbitrariamente qualquer colega num programa.
  describe('enroll — ownership (A10-15)', () => {
    const colaborador = { id: 2, email: 'c@innova.com', role: { name: 'COLABORADOR' } };
    const gestor = { id: 3, email: 'g@innova.com', role: { name: 'GESTOR' } };

    it('colaborador não pode matricular outro utilizador', () => {
      const dto = { userId: 999, programId: 'prog-1' } as any;
      expect(() => controller.enroll(dto, colaborador as any)).toThrow();
      expect(mockSvc.enroll).not.toHaveBeenCalled();
    });

    it('colaborador pode matricular-se a si próprio', async () => {
      const dto = { userId: 2, programId: 'prog-1' } as any;
      await controller.enroll(dto, colaborador as any);
      expect(mockSvc.enroll).toHaveBeenCalledWith(dto, 2);
    });

    it('GESTOR pode matricular outro utilizador', async () => {
      const dto = { userId: 999, programId: 'prog-1' } as any;
      await controller.enroll(dto, gestor as any);
      expect(mockSvc.enroll).toHaveBeenCalledWith(dto, 3);
    });
  });

  it('approveEnrollment → approveEnrollment(id, userId)', async () => {
    await controller.approveEnrollment('e1', mockUser as any);
    expect(mockSvc.approveEnrollment).toHaveBeenCalledWith('e1', 1);
  });

  it('getMyEnrollments → getMyEnrollments(userId, page, limit)', async () => {
    await controller.getMyEnrollments(mockUser as any, 2, 10);
    expect(mockSvc.getMyEnrollments).toHaveBeenCalledWith(1, 2, 10);
  });

  it('gradeEnrollment → gradeEnrollment(dto, userId)', async () => {
    const dto = {} as any;
    await controller.gradeEnrollment(dto, mockUser as any);
    expect(mockSvc.gradeEnrollment).toHaveBeenCalledWith(dto, 1);
  });

  it('getEnrollmentGrades → getEnrollmentGrades(id, user)', async () => {
    await controller.getEnrollmentGrades('e1', mockUser as any);
    expect(mockSvc.getEnrollmentGrades).toHaveBeenCalledWith('e1', mockUser);
  });

  it('getMyTranscript → getTranscript(userId)', async () => {
    await controller.getMyTranscript(mockUser as any);
    expect(mockSvc.getTranscript).toHaveBeenCalledWith(1);
  });

  it('getTranscript → getTranscript(userId)', async () => {
    await controller.getTranscript(7);
    expect(mockSvc.getTranscript).toHaveBeenCalledWith(7);
  });
});
