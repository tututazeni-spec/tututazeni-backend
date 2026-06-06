import { Test, TestingModule } from '@nestjs/testing';
import { LiveClassesController } from './live-classes.controller';
import { LiveClassesService } from './live-classes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getUpcoming: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getMessages: jest.fn().mockResolvedValue([]),
  getAttendanceReport: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  joinClass: jest.fn().mockResolvedValue({}),
  leaveClass: jest.fn().mockResolvedValue({}),
  sendMessage: jest.fn().mockResolvedValue({ id: 1 }),
  createPostEvaluation: jest.fn().mockResolvedValue({ id: 1 }),
  submitPostResponse: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  remove: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('LiveClassesController', () => {
  let controller: LiveClassesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiveClassesController],
      providers: [{ provide: LiveClassesService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<LiveClassesController>(LiveClassesController);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('upcoming → getUpcoming', async () => {
    await controller.upcoming();
    expect(mockSvc.getUpcoming).toHaveBeenCalled();
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(2);
    expect(mockSvc.findOne).toHaveBeenCalledWith(2);
  });

  it('messages → getMessages(id)', async () => {
    await controller.messages(3);
    expect(mockSvc.getMessages).toHaveBeenCalledWith(3, undefined, undefined);
  });

  it('attendanceReport → getAttendanceReport(id)', async () => {
    await controller.attendanceReport(4);
    expect(mockSvc.getAttendanceReport).toHaveBeenCalledWith(4);
  });

  it('create → create(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto);
  });

  it('join → joinClass(id, userId)', async () => {
    await controller.join(5, mockUser as any);
    expect(mockSvc.joinClass).toHaveBeenCalledWith(5, 1);
  });

  it('leave → leaveClass(id, userId)', async () => {
    await controller.leave(5, mockUser as any);
    expect(mockSvc.leaveClass).toHaveBeenCalledWith(5, 1);
  });

  it('sendMessage → sendMessage(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.sendMessage(3, mockUser as any, dto);
    expect(mockSvc.sendMessage).toHaveBeenCalledWith(3, 1, dto);
  });

  it('createPostEval → createPostEvaluation(id)', async () => {
    await controller.createPostEval(2);
    expect(mockSvc.createPostEvaluation).toHaveBeenCalledWith(2);
  });

  it('postResponse → submitPostResponse(userId, dto)', async () => {
    const dto = {} as any;
    await controller.postResponse(mockUser as any, dto);
    expect(mockSvc.submitPostResponse).toHaveBeenCalledWith(1, dto);
  });

  it('update → update(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto);
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });
});
