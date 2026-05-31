import { Test, TestingModule } from '@nestjs/testing';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getCategories: jest.fn().mockResolvedValue([]),
  getAdminDashboard: jest.fn().mockResolvedValue({}),
  getMyEnrollments: jest.fn().mockResolvedValue([]),
  getMyCertificates: jest.fn().mockResolvedValue([]),
  verifyCertificate: jest.fn().mockResolvedValue({ valid: true }),
  findOne: jest.fn().mockResolvedValue({ id: 1, title: 'Curso Test' }),
  getCourseAnalytics: jest.fn().mockResolvedValue({}),
  getCourseProgress: jest.fn().mockResolvedValue({ progress: 0 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  publish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
  archive: jest.fn().mockResolvedValue({ status: 'ARCHIVED' }),
  duplicate: jest.fn().mockResolvedValue({ id: 3 }),
  remove: jest.fn().mockResolvedValue({ message: 'ok' }),
  addCompetency: jest.fn().mockResolvedValue({}),
  removeCompetency: jest.fn().mockResolvedValue({}),
  createModule: jest.fn().mockResolvedValue({ id: 1 }),
  updateModule: jest.fn().mockResolvedValue({}),
  reorderModules: jest.fn().mockResolvedValue({}),
  removeModule: jest.fn().mockResolvedValue({}),
  createLesson: jest.fn().mockResolvedValue({ id: 1 }),
  updateLesson: jest.fn().mockResolvedValue({}),
  reorderLessons: jest.fn().mockResolvedValue({}),
  removeLesson: jest.fn().mockResolvedValue({}),
  markLessonComplete: jest.fn().mockResolvedValue({ progress: 100 }),
  enroll: jest.fn().mockResolvedValue({ id: 1 }),
  assignCourse: jest.fn().mockResolvedValue({}),
  createQuiz: jest.fn().mockResolvedValue({ id: 1 }),
  submitQuiz: jest.fn().mockResolvedValue({ score: 80 }),
  addFeedback: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('CoursesController', () => {
  let controller: CoursesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoursesController],
      providers: [{ provide: CoursesService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CoursesController>(CoursesController);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('categories → getCategories', async () => {
    await controller.categories();
    expect(mockSvc.getCategories).toHaveBeenCalled();
  });

  it('adminDashboard → getAdminDashboard', async () => {
    await controller.adminDashboard();
    expect(mockSvc.getAdminDashboard).toHaveBeenCalled();
  });

  it('myEnrollments → getMyEnrollments', async () => {
    await controller.myEnrollments(mockUser as any);
    expect(mockSvc.getMyEnrollments).toHaveBeenCalledWith(1);
  });

  it('myCertificates → getMyCertificates', async () => {
    await controller.myCertificates(mockUser as any);
    expect(mockSvc.getMyCertificates).toHaveBeenCalledWith(1);
  });

  it('verifyCertificate → verifyCertificate', async () => {
    await controller.verifyCertificate('ABC123');
    expect(mockSvc.verifyCertificate).toHaveBeenCalledWith('ABC123');
  });

  it('findOne → findOne(id)', async () => {
    const result = await controller.findOne(1);
    expect(mockSvc.findOne).toHaveBeenCalledWith(1);
    expect(result).toHaveProperty('title');
  });

  it('analytics → getCourseAnalytics', async () => {
    await controller.analytics(1);
    expect(mockSvc.getCourseAnalytics).toHaveBeenCalledWith(1);
  });

  it('progress → getCourseProgress', async () => {
    await controller.progress(1, mockUser as any);
    expect(mockSvc.getCourseProgress).toHaveBeenCalledWith(1, 1);
  });

  it('create → create(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto);
  });

  it('update → update(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto);
  });

  it('publish → publish(id)', async () => {
    await controller.publish(1);
    expect(mockSvc.publish).toHaveBeenCalledWith(1);
  });

  it('archive → archive(id)', async () => {
    await controller.archive(1);
    expect(mockSvc.archive).toHaveBeenCalledWith(1);
  });

  it('duplicate → duplicate(id)', async () => {
    await controller.duplicate(1);
    expect(mockSvc.duplicate).toHaveBeenCalledWith(1);
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('addCompetency → addCompetency(id, cId)', async () => {
    await controller.addCompetency(1, 2);
    expect(mockSvc.addCompetency).toHaveBeenCalledWith(1, 2);
  });

  it('removeCompetency → removeCompetency(id, cId)', async () => {
    await controller.removeCompetency(1, 2);
    expect(mockSvc.removeCompetency).toHaveBeenCalledWith(1, 2);
  });

  it('createModule → createModule(id, dto)', async () => {
    const dto = {} as any;
    await controller.createModule(1, dto);
    expect(mockSvc.createModule).toHaveBeenCalledWith(1, dto);
  });

  it('updateModule → updateModule(id, moduleId, dto)', async () => {
    const dto = {} as any;
    await controller.updateModule(1, 2, dto);
    expect(mockSvc.updateModule).toHaveBeenCalledWith(1, 2, dto);
  });

  it('reorderModules → reorderModules(id, ids)', async () => {
    await controller.reorderModules(1, [2, 1, 3]);
    expect(mockSvc.reorderModules).toHaveBeenCalledWith(1, [2, 1, 3]);
  });

  it('removeModule → removeModule(id, moduleId)', async () => {
    await controller.removeModule(1, 2);
    expect(mockSvc.removeModule).toHaveBeenCalledWith(1, 2);
  });

  it('createLesson → createLesson(moduleId, dto)', async () => {
    const dto = {} as any;
    await controller.createLesson(3, dto);
    expect(mockSvc.createLesson).toHaveBeenCalledWith(3, dto);
  });

  it('updateLesson → updateLesson(lessonId, dto)', async () => {
    const dto = {} as any;
    await controller.updateLesson(4, dto);
    expect(mockSvc.updateLesson).toHaveBeenCalledWith(4, dto);
  });

  it('reorderLessons → reorderLessons(moduleId, ids)', async () => {
    await controller.reorderLessons(3, [1, 2]);
    expect(mockSvc.reorderLessons).toHaveBeenCalledWith(3, [1, 2]);
  });

  it('removeLesson → removeLesson(lessonId)', async () => {
    await controller.removeLesson(4);
    expect(mockSvc.removeLesson).toHaveBeenCalledWith(4);
  });

  it('markComplete → markLessonComplete', async () => {
    const dto = {} as any;
    await controller.markComplete(4, mockUser as any, dto);
    expect(mockSvc.markLessonComplete).toHaveBeenCalledWith(4, 1, dto);
  });

  it('enroll → enroll(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.enroll(1, mockUser as any, dto);
    expect(mockSvc.enroll).toHaveBeenCalledWith(1, 1, dto);
  });

  it('assign → assignCourse(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.assign(1, mockUser as any, dto);
    expect(mockSvc.assignCourse).toHaveBeenCalledWith(1, dto, 1);
  });

  it('createQuiz → createQuiz(lessonId, dto)', async () => {
    const dto = {} as any;
    await controller.createQuiz(4, dto);
    expect(mockSvc.createQuiz).toHaveBeenCalledWith(4, dto);
  });

  it('submitQuiz → submitQuiz(quizId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.submitQuiz(5, mockUser as any, dto);
    expect(mockSvc.submitQuiz).toHaveBeenCalledWith(5, 1, dto);
  });

  it('feedback → addFeedback(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.feedback(1, mockUser as any, dto);
    expect(mockSvc.addFeedback).toHaveBeenCalledWith(1, 1, dto);
  });
});
