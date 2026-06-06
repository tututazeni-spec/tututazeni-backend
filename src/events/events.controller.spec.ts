import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getUpcoming: jest.fn().mockResolvedValue([]),
  getStats: jest.fn().mockResolvedValue({}),
  getMyEvents: jest.fn().mockResolvedValue([]),
  getOrganizerDashboard: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  publish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
  cancel: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
  remove: jest.fn().mockResolvedValue({ message: 'ok' }),
  join: jest.fn().mockResolvedValue({ status: 'CONFIRMED' }),
  leave: jest.fn().mockResolvedValue({}),
  updateParticipantStatus: jest.fn().mockResolvedValue({}),
  checkIn: jest.fn().mockResolvedValue({ checkedIn: true }),
  submitFeedback: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('EventsController', () => {
  let controller: EventsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<EventsController>(EventsController);
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

  it('stats → getStats', async () => {
    await controller.stats();
    expect(mockSvc.getStats).toHaveBeenCalled();
  });

  it('myEvents → getMyEvents(userId)', async () => {
    await controller.myEvents(mockUser as any);
    expect(mockSvc.getMyEvents).toHaveBeenCalledWith(1);
  });

  it('organizerDashboard → getOrganizerDashboard(userId)', async () => {
    await controller.organizerDashboard(mockUser as any);
    expect(mockSvc.getOrganizerDashboard).toHaveBeenCalledWith(1);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(3);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3);
  });

  it('create → create(userId, dto)', async () => {
    const dto = {} as any;
    await controller.create(mockUser as any, dto);
    expect(mockSvc.create).toHaveBeenCalledWith(1, dto);
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

  it('cancel → cancel(id)', async () => {
    await controller.cancel(1);
    expect(mockSvc.cancel).toHaveBeenCalledWith(1);
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('join → join(id, userId)', async () => {
    await controller.join(5, mockUser as any);
    expect(mockSvc.join).toHaveBeenCalledWith(5, 1);
  });

  it('leave → leave(id, userId)', async () => {
    await controller.leave(5, mockUser as any);
    expect(mockSvc.leave).toHaveBeenCalledWith(5, 1);
  });

  it('participantStatus → updateParticipantStatus', async () => {
    const dto = {} as any;
    await controller.participantStatus(5, 2, dto);
    expect(mockSvc.updateParticipantStatus).toHaveBeenCalledWith(5, 2, dto);
  });

  it('checkIn → checkIn(userId, dto)', async () => {
    const dto = {} as any;
    await controller.checkIn(mockUser as any, dto);
    expect(mockSvc.checkIn).toHaveBeenCalledWith(1, dto);
  });

  it('feedback → submitFeedback(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.feedback(5, mockUser as any, dto);
    expect(mockSvc.submitFeedback).toHaveBeenCalledWith(5, 1, dto);
  });
});
