import { Test, TestingModule } from '@nestjs/testing';
import { InstructorController } from './instructor.controller';
import { InstructorService } from './instructor.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getMarketplaceCourses: jest.fn().mockResolvedValue([]),
  findByUser: jest.fn().mockResolvedValue({ id: 1 }),
  getMyDashboard: jest.fn().mockResolvedValue({}),
  getAnalytics: jest.fn().mockResolvedValue({}),
  getAtRiskStudents: jest.fn().mockResolvedValue([]),
  getPayoutHistory: jest.fn().mockResolvedValue([]),
  getCohorts: jest.fn().mockResolvedValue([]),
  getCohortDetail: jest.fn().mockResolvedValue({ id: 1 }),
  createCohort: jest.fn().mockResolvedValue({ id: 1 }),
  updateCohort: jest.fn().mockResolvedValue({}),
  addParticipants: jest.fn().mockResolvedValue({}),
  removeParticipant: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  createProfile: jest.fn().mockResolvedValue({ id: 1 }),
  updateProfile: jest.fn().mockResolvedValue({}),
  addReview: jest.fn().mockResolvedValue({ id: 1 }),
  createMarketplaceCourse: jest.fn().mockResolvedValue({ id: 1 }),
  approve: jest.fn().mockResolvedValue({}),
  revoke: jest.fn().mockResolvedValue({}),
  createPayout: jest.fn().mockResolvedValue({ id: 1 }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('InstructorController', () => {
  let controller: InstructorController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstructorController],
      providers: [{ provide: InstructorService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<InstructorController>(InstructorController);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('marketplace → getMarketplaceCourses', async () => {
    await controller.marketplace();
    expect(mockSvc.getMarketplaceCourses).toHaveBeenCalled();
  });

  it('myProfile → findByUser(userId)', async () => {
    await controller.myProfile(mockUser as any);
    expect(mockSvc.findByUser).toHaveBeenCalledWith(1);
  });

  it('myDashboard → getMyDashboard(userId)', async () => {
    await controller.myDashboard(mockUser as any);
    expect(mockSvc.getMyDashboard).toHaveBeenCalledWith(1);
  });

  it('myAnalytics → getAnalytics(userId)', async () => {
    await controller.myAnalytics(mockUser as any);
    expect(mockSvc.getAnalytics).toHaveBeenCalledWith(1);
  });

  it('atRisk → getAtRiskStudents(userId)', async () => {
    await controller.atRisk(mockUser as any);
    expect(mockSvc.getAtRiskStudents).toHaveBeenCalledWith(1);
  });

  it('myPayouts → getPayoutHistory(userId)', async () => {
    await controller.myPayouts(mockUser as any);
    expect(mockSvc.getPayoutHistory).toHaveBeenCalledWith(1);
  });

  it('myCohorts → getCohorts(userId, filters)', async () => {
    const filters = {} as any;
    await controller.myCohorts(mockUser as any, filters);
    expect(mockSvc.getCohorts).toHaveBeenCalledWith(1, filters);
  });

  it('cohortDetail → getCohortDetail(id, userId)', async () => {
    await controller.cohortDetail(mockUser as any, 3);
    expect(mockSvc.getCohortDetail).toHaveBeenCalledWith(3, 1);
  });

  it('createCohort → createCohort(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createCohort(mockUser as any, dto);
    expect(mockSvc.createCohort).toHaveBeenCalledWith(1, dto);
  });

  it('updateCohort → updateCohort(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.updateCohort(mockUser as any, 2, dto);
    expect(mockSvc.updateCohort).toHaveBeenCalledWith(2, 1, dto);
  });

  it('addParticipants → addParticipants(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.addParticipants(mockUser as any, 3, dto);
    expect(mockSvc.addParticipants).toHaveBeenCalledWith(3, 1, dto);
  });

  it('removeParticipant → removeParticipant(id, participantUserId, userId)', async () => {
    await controller.removeParticipant(mockUser as any, 2, 5);
    expect(mockSvc.removeParticipant).toHaveBeenCalledWith(2, 5, 1);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(4);
    expect(mockSvc.findOne).toHaveBeenCalledWith(4);
  });

  it('createProfile → createProfile(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createProfile(mockUser as any, dto);
    expect(mockSvc.createProfile).toHaveBeenCalledWith(1, dto);
  });

  it('updateProfile → updateProfile(userId, dto)', async () => {
    const dto = {} as any;
    await controller.updateProfile(mockUser as any, dto);
    expect(mockSvc.updateProfile).toHaveBeenCalledWith(1, dto);
  });

  it('review → addReview(userId, dto)', async () => {
    const dto = {} as any;
    await controller.review(mockUser as any, dto);
    expect(mockSvc.addReview).toHaveBeenCalledWith(1, dto);
  });

  it('createCourse → createMarketplaceCourse(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createCourse(mockUser as any, dto);
    expect(mockSvc.createMarketplaceCourse).toHaveBeenCalledWith(1, dto);
  });

  it('approve → approve(id)', async () => {
    await controller.approve(5);
    expect(mockSvc.approve).toHaveBeenCalledWith(5);
  });

  it('revoke → revoke(id)', async () => {
    await controller.revoke(5);
    expect(mockSvc.revoke).toHaveBeenCalledWith(5);
  });

  it('payout → createPayout(id, amount)', async () => {
    await controller.payout(3, { amount: 500 });
    expect(mockSvc.createPayout).toHaveBeenCalledWith(3, 500);
  });
});
