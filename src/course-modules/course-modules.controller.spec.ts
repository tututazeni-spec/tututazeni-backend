import { Test, TestingModule } from '@nestjs/testing';
import { CourseModulesController } from './course-modules.controller';
import { CourseModulesService } from './course-modules.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  createModule: jest.fn().mockResolvedValue({ id: 1 }),
  findModuleOrFail: jest.fn().mockResolvedValue({ id: 1 }),
  getModuleAnalytics: jest.fn().mockResolvedValue({}),
  updateModule: jest.fn().mockResolvedValue({ id: 1 }),
  publishModule: jest.fn().mockResolvedValue({}),
  reorderModules: jest.fn().mockResolvedValue({}),
  cloneModule: jest.fn().mockResolvedValue({ id: 2 }),
  deleteModule: jest.fn().mockResolvedValue({}),
  addMaterial: jest.fn().mockResolvedValue({ id: 1 }),
  removeMaterial: jest.fn().mockResolvedValue({}),
  createLesson: jest.fn().mockResolvedValue({ id: 1 }),
  updateLesson: jest.fn().mockResolvedValue({}),
  moveLesson: jest.fn().mockResolvedValue({}),
  reorderLessons: jest.fn().mockResolvedValue({}),
  deleteLesson: jest.fn().mockResolvedValue({}),
  markLessonComplete: jest.fn().mockResolvedValue({}),
  getLessonProgress: jest.fn().mockResolvedValue({}),
  isModuleCompleted: jest.fn().mockResolvedValue({ completed: true }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('CourseModulesController', () => {
  let controller: CourseModulesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseModulesController],
      providers: [{ provide: CourseModulesService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CourseModulesController>(CourseModulesController);
  });

  it('createModule → createModule(dto)', async () => {
    const dto = {} as any;
    await controller.createModule(dto);
    expect(mockSvc.createModule).toHaveBeenCalledWith(dto);
  });

  it('findModule → findModuleOrFail(id)', async () => {
    await controller.findModule(2);
    expect(mockSvc.findModuleOrFail).toHaveBeenCalledWith(2);
  });

  it('moduleAnalytics → getModuleAnalytics(id)', async () => {
    await controller.moduleAnalytics(3);
    expect(mockSvc.getModuleAnalytics).toHaveBeenCalledWith(3);
  });

  it('updateModule → updateModule(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateModule(1, dto);
    expect(mockSvc.updateModule).toHaveBeenCalledWith(1, dto);
  });

  it('publishModule → publishModule(id)', async () => {
    await controller.publishModule(1);
    expect(mockSvc.publishModule).toHaveBeenCalledWith(1);
  });

  it('reorderModules → reorderModules(courseId, dto)', async () => {
    const dto = {} as any;
    await controller.reorderModules(5, dto);
    expect(mockSvc.reorderModules).toHaveBeenCalledWith(5, dto);
  });

  it('cloneModule → cloneModule(id, dto)', async () => {
    const dto = {} as any;
    await controller.cloneModule(1, dto);
    expect(mockSvc.cloneModule).toHaveBeenCalledWith(1, dto);
  });

  it('deleteModule → deleteModule(id)', async () => {
    await controller.deleteModule(2);
    expect(mockSvc.deleteModule).toHaveBeenCalledWith(2);
  });

  it('addMaterial → addMaterial(id, dto)', async () => {
    const dto = {} as any;
    await controller.addMaterial(3, dto);
    expect(mockSvc.addMaterial).toHaveBeenCalledWith(3, dto);
  });

  it('removeMaterial → removeMaterial(materialId)', async () => {
    await controller.removeMaterial(5);
    expect(mockSvc.removeMaterial).toHaveBeenCalledWith(5);
  });

  it('createLesson → createLesson(dto)', async () => {
    const dto = {} as any;
    await controller.createLesson(dto);
    expect(mockSvc.createLesson).toHaveBeenCalledWith(dto);
  });

  it('updateLesson → updateLesson(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateLesson(1, dto);
    expect(mockSvc.updateLesson).toHaveBeenCalledWith(1, dto);
  });

  it('moveLesson → moveLesson(id, dto)', async () => {
    const dto = {} as any;
    await controller.moveLesson(2, dto);
    expect(mockSvc.moveLesson).toHaveBeenCalledWith(2, dto);
  });

  it('reorderLessons → reorderLessons(moduleId, order)', async () => {
    const order = [{ id: 1, seq: 1 }];
    await controller.reorderLessons(3, order);
    expect(mockSvc.reorderLessons).toHaveBeenCalledWith(3, order);
  });

  it('deleteLesson → deleteLesson(id)', async () => {
    await controller.deleteLesson(4);
    expect(mockSvc.deleteLesson).toHaveBeenCalledWith(4);
  });

  it('markComplete → markLessonComplete(userId, dto)', async () => {
    const dto = {} as any;
    await controller.markComplete(mockUser as any, dto);
    expect(mockSvc.markLessonComplete).toHaveBeenCalledWith(1, dto);
  });

  it('getCourseProgress → getLessonProgress(userId, courseId)', async () => {
    await controller.getCourseProgress(5, mockUser as any);
    expect(mockSvc.getLessonProgress).toHaveBeenCalledWith(1, 5);
  });

  it('isModuleCompleted → isModuleCompleted(id, userId)', async () => {
    await controller.isModuleCompleted(2, mockUser as any);
    expect(mockSvc.isModuleCompleted).toHaveBeenCalledWith(2, 1);
  });
});
