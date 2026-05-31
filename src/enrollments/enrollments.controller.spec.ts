import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockPrismaEnrollment = {
  update: jest.fn().mockResolvedValue({ id: 1, status: 'CANCELLED' }),
};

const mockSvc = {
  prisma: { enrollment: mockPrismaEnrollment },
  getUserEnrollments: jest.fn().mockResolvedValue([]),
  enroll: jest.fn().mockResolvedValue({ id: 1, courseId: 1, userId: 1 }),
  cancel: jest.fn().mockResolvedValue({}),
  generateCertificate: jest.fn().mockResolvedValue({ url: 'cert.pdf' }),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getAdminDashboard: jest.fn().mockResolvedValue({}),
  getComplianceDashboard: jest.fn().mockResolvedValue({}),
  getTeamProgress: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  bulkEnroll: jest.fn().mockResolvedValue({ created: 0, errors: [] }),
  updateStatus: jest.fn().mockResolvedValue({}),
  updateDeadline: jest.fn().mockResolvedValue({}),
  syncOverdueStatus: jest.fn().mockResolvedValue({ updated: 0 }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('EnrollmentsController', () => {
  let controller: EnrollmentsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EnrollmentsController],
      providers: [{ provide: EnrollmentsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<EnrollmentsController>(EnrollmentsController);
  });

  it('myEnrollments → getUserEnrollments', async () => {
    const filters = {} as any;
    await controller.myEnrollments(mockUser as any, filters);
    expect(mockSvc.getUserEnrollments).toHaveBeenCalledWith(1, filters);
  });

  it('selfEnroll → enroll com origin MANUAL', async () => {
    await controller.selfEnroll(5, mockUser as any);
    expect(mockSvc.enroll).toHaveBeenCalledWith({ userId: 1, courseId: 5, origin: 'MANUAL' });
  });

  it('cancelMy → cancel(id, dto, userId)', async () => {
    const dto = { reason: 'motivo' } as any;
    await controller.cancelMy(3, mockUser as any, dto);
    expect(mockSvc.cancel).toHaveBeenCalledWith(3, dto, 1);
  });

  it('myCertificate → generateCertificate', async () => {
    await controller.myCertificate(2);
    expect(mockSvc.generateCertificate).toHaveBeenCalledWith(2);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('adminDashboard → getAdminDashboard', async () => {
    await controller.adminDashboard();
    expect(mockSvc.getAdminDashboard).toHaveBeenCalled();
  });

  it('compliance → getComplianceDashboard sem departmentId', async () => {
    await controller.compliance();
    expect(mockSvc.getComplianceDashboard).toHaveBeenCalledWith(undefined);
  });

  it('compliance → getComplianceDashboard com departmentId', async () => {
    await controller.compliance('3');
    expect(mockSvc.getComplianceDashboard).toHaveBeenCalledWith(3);
  });

  it('teamProgress → getTeamProgress sem courseId', async () => {
    await controller.teamProgress(mockUser as any);
    expect(mockSvc.getTeamProgress).toHaveBeenCalledWith(1, undefined);
  });

  it('teamProgress → getTeamProgress com courseId', async () => {
    await controller.teamProgress(mockUser as any, '10');
    expect(mockSvc.getTeamProgress).toHaveBeenCalledWith(1, 10);
  });

  it('userEnrollments → getUserEnrollments(userId)', async () => {
    const filters = {} as any;
    await controller.userEnrollments(7, filters);
    expect(mockSvc.getUserEnrollments).toHaveBeenCalledWith(7, filters);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(4);
    expect(mockSvc.findOne).toHaveBeenCalledWith(4);
  });

  it('enroll (admin) → enroll com assignedById', async () => {
    const dto = { courseId: 1, userId: 2 } as any;
    await controller.enroll(mockUser as any, dto);
    expect(mockSvc.enroll).toHaveBeenCalledWith({ ...dto, assignedById: 1 });
  });

  it('bulkEnroll → bulkEnroll', async () => {
    const dto = {} as any;
    await controller.bulkEnroll(dto);
    expect(mockSvc.bulkEnroll).toHaveBeenCalledWith(dto);
  });

  it('updateStatus → updateStatus', async () => {
    const dto = { status: 'COMPLETED' } as any;
    await controller.updateStatus(1, dto);
    expect(mockSvc.updateStatus).toHaveBeenCalledWith(1, dto);
  });

  it('updateDeadline → updateDeadline', async () => {
    const dto = { deadline: new Date() } as any;
    await controller.updateDeadline(1, dto);
    expect(mockSvc.updateDeadline).toHaveBeenCalledWith(1, dto);
  });

  it('cancel (admin) → prisma.enrollment.update', async () => {
    const dto = { reason: 'admin cancel' } as any;
    const result = await controller.cancel(1, mockUser as any, dto);
    expect(mockPrismaEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
  });

  it('certificate (admin) → generateCertificate', async () => {
    await controller.certificate(1);
    expect(mockSvc.generateCertificate).toHaveBeenCalledWith(1);
  });

  it('syncOverdue → syncOverdueStatus', async () => {
    await controller.syncOverdue();
    expect(mockSvc.syncOverdueStatus).toHaveBeenCalled();
  });
});
