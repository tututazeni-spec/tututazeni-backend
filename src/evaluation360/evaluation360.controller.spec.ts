import { Test, TestingModule } from '@nestjs/testing';
import { Evaluation360Controller } from './evaluation360.controller';
import { Evaluation360Service } from './evaluation360.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  createCompetency: jest.fn().mockResolvedValue({ id: 'c1' }),
  updateCompetency: jest.fn().mockResolvedValue({}),
  listCompetencies: jest.fn().mockResolvedValue([]),
  createCycle: jest.fn().mockResolvedValue({ id: 'cycle-1' }),
  updateCycle: jest.fn().mockResolvedValue({}),
  publishCycle: jest.fn().mockResolvedValue({}),
  listCycles: jest.fn().mockResolvedValue([]),
  getCycleDetail: jest.fn().mockResolvedValue({ id: 'cycle-1' }),
  calculateCycleResults: jest.fn().mockResolvedValue({}),
  createQuestion: jest.fn().mockResolvedValue({ id: 'q1' }),
  listQuestions: jest.fn().mockResolvedValue([]),
  addParticipants: jest.fn().mockResolvedValue({}),
  giveConsent: jest.fn().mockResolvedValue({}),
  getParticipantProgress: jest.fn().mockResolvedValue({}),
  suggestEvaluators: jest.fn().mockResolvedValue([]),
  assignEvaluators: jest.fn().mockResolvedValue({}),
  approveEvaluators: jest.fn().mockResolvedValue({}),
  sendCycleInvites: jest.fn().mockResolvedValue({}),
  sendReminders: jest.fn().mockResolvedValue({}),
  getEvaluationForm: jest.fn().mockResolvedValue({}),
  submitResponse: jest.fn().mockResolvedValue({}),
  getParticipantResult: jest.fn().mockResolvedValue({}),
  getTeamAnalytics: jest.fn().mockResolvedValue({}),
  getOrganizationalAnalytics: jest.fn().mockResolvedValue({}),
  getNineBox: jest.fn().mockResolvedValue([]),
  generateReport: jest.fn().mockResolvedValue({}),
  calibrateScore: jest.fn().mockResolvedValue({}),
  createContinuousFeedback: jest.fn().mockResolvedValue({ id: 'fb1' }),
  listFeedbackForUser: jest.fn().mockResolvedValue([]),
  createPulseSurvey: jest.fn().mockResolvedValue({ id: 'ps1' }),
  submitPulseSurveyResponse: jest.fn().mockResolvedValue({}),
};

const mockReq = { user: { id: 1, roleCode: 'ADMIN' } };

describe('Evaluation360Controller', () => {
  let controller: Evaluation360Controller;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [Evaluation360Controller],
      providers: [{ provide: Evaluation360Service, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<Evaluation360Controller>(Evaluation360Controller);
  });

  it('createCompetency → createCompetency(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createCompetency(dto, mockReq as any);
    expect(mockSvc.createCompetency).toHaveBeenCalledWith(dto, 1);
  });

  it('updateCompetency → updateCompetency(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateCompetency('c1', dto, mockReq as any);
    expect(mockSvc.updateCompetency).toHaveBeenCalledWith('c1', dto, 1);
  });

  it('listCompetencies → listCompetencies(tenantId, query)', async () => {
    await controller.listCompetencies('t1', undefined);
    expect(mockSvc.listCompetencies).toHaveBeenCalledWith('t1', undefined);
  });

  it('createCycle → createCycle(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createCycle(dto, mockReq as any);
    expect(mockSvc.createCycle).toHaveBeenCalledWith(dto, 1);
  });

  it('updateCycle → updateCycle(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateCycle('cycle-1', dto, mockReq as any);
    expect(mockSvc.updateCycle).toHaveBeenCalledWith('cycle-1', dto, 1);
  });

  it('publishCycle → publishCycle(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.publishCycle('cycle-1', dto, mockReq as any);
    expect(mockSvc.publishCycle).toHaveBeenCalledWith('cycle-1', dto, 1);
  });

  it('listCycles → listCycles(tenantId, query)', async () => {
    const query = {} as any;
    await controller.listCycles('t1', query);
    expect(mockSvc.listCycles).toHaveBeenCalledWith('t1', query);
  });

  it('getCycleDetail → getCycleDetail(id)', async () => {
    await controller.getCycleDetail('cycle-1');
    expect(mockSvc.getCycleDetail).toHaveBeenCalledWith('cycle-1');
  });

  it('calculateResults → calculateCycleResults(id, userId)', async () => {
    await controller.calculateResults('cycle-1', mockReq as any);
    expect(mockSvc.calculateCycleResults).toHaveBeenCalledWith('cycle-1', 1);
  });

  it('createQuestion → createQuestion(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createQuestion(dto, mockReq as any);
    expect(mockSvc.createQuestion).toHaveBeenCalledWith(dto, 1);
  });

  it('listQuestions → listQuestions(cycleId, competencyId)', async () => {
    await controller.listQuestions('c1', 'comp1');
    expect(mockSvc.listQuestions).toHaveBeenCalledWith('c1', 'comp1');
  });

  it('addParticipants → addParticipants(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.addParticipants('cycle-1', dto, mockReq as any);
    expect(mockSvc.addParticipants).toHaveBeenCalledWith('cycle-1', dto, 1);
  });

  it('giveConsent → giveConsent(cycleId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.giveConsent('cycle-1', 'user-1', dto);
    expect(mockSvc.giveConsent).toHaveBeenCalledWith('cycle-1', 'user-1', dto);
  });

  it('getProgress → getParticipantProgress(cycleId, userId)', async () => {
    await controller.getProgress('cycle-1', 'user-1');
    expect(mockSvc.getParticipantProgress).toHaveBeenCalledWith('cycle-1', 'user-1');
  });

  it('suggestEvaluators → suggestEvaluators(id, dto)', async () => {
    const dto = {} as any;
    await controller.suggestEvaluators('cycle-1', dto);
    expect(mockSvc.suggestEvaluators).toHaveBeenCalledWith('cycle-1', dto);
  });

  it('assignEvaluators → assignEvaluators(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.assignEvaluators('cycle-1', dto, mockReq as any);
    expect(mockSvc.assignEvaluators).toHaveBeenCalledWith('cycle-1', dto, 1);
  });

  it('approveEvaluators → approveEvaluators(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.approveEvaluators('cycle-1', dto, mockReq as any);
    expect(mockSvc.approveEvaluators).toHaveBeenCalledWith('cycle-1', dto, 1);
  });

  it('sendInvites → sendCycleInvites(id, userId)', async () => {
    await controller.sendInvites('cycle-1', mockReq as any);
    expect(mockSvc.sendCycleInvites).toHaveBeenCalledWith('cycle-1', 1);
  });

  it('sendReminders → sendReminders(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.sendReminders('cycle-1', dto, mockReq as any);
    expect(mockSvc.sendReminders).toHaveBeenCalledWith('cycle-1', dto, 1);
  });

  it('getForm → getEvaluationForm(cycleId, userId, evaluateeId)', async () => {
    await controller.getForm('cycle-1', 'user-2', mockReq as any);
    expect(mockSvc.getEvaluationForm).toHaveBeenCalledWith('cycle-1', 1, 'user-2');
  });

  it('submitResponse → submitResponse', async () => {
    const dto = {} as any;
    await controller.submitResponse('cycle-1', 'user-2', dto, mockReq as any);
    expect(mockSvc.submitResponse).toHaveBeenCalled();
  });

  it('getResult → getParticipantResult(cycleId, participantId, userId, roleCode)', async () => {
    await controller.getResult('cycle-1', 'p1', mockReq as any);
    expect(mockSvc.getParticipantResult).toHaveBeenCalledWith('cycle-1', 'p1', 1, 'ADMIN');
  });

  it('getTeamAnalytics → getTeamAnalytics(cycleId, userId)', async () => {
    await controller.getTeamAnalytics('cycle-1', mockReq as any);
    expect(mockSvc.getTeamAnalytics).toHaveBeenCalledWith('cycle-1', 1);
  });

  it('getOrgAnalytics → getOrganizationalAnalytics(query)', async () => {
    const query = {} as any;
    await controller.getOrgAnalytics(query);
    expect(mockSvc.getOrganizationalAnalytics).toHaveBeenCalledWith(query);
  });

  it('getNineBox → getNineBox(query)', async () => {
    const query = {} as any;
    await controller.getNineBox(query);
    expect(mockSvc.getNineBox).toHaveBeenCalledWith(query);
  });

  it('generateReport → generateReport(dto, userId)', async () => {
    const dto = {} as any;
    await controller.generateReport(dto, mockReq as any);
    expect(mockSvc.generateReport).toHaveBeenCalledWith(dto, 1);
  });

  it('calibrateScore → calibrateScore(cycleId, dto, userId)', async () => {
    const dto = {} as any;
    await controller.calibrateScore('cycle-1', dto, mockReq as any);
    expect(mockSvc.calibrateScore).toHaveBeenCalledWith('cycle-1', dto, 1);
  });

  it('createFeedback → createContinuousFeedback(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createFeedback(dto, mockReq as any);
    expect(mockSvc.createContinuousFeedback).toHaveBeenCalledWith(dto, 1);
  });

  it('listFeedback → listFeedbackForUser(userId, query)', async () => {
    const query = {} as any;
    await controller.listFeedback('user-1', query);
    expect(mockSvc.listFeedbackForUser).toHaveBeenCalledWith('user-1', query);
  });

  it('createPulseSurvey → createPulseSurvey(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createPulseSurvey(dto, mockReq as any);
    expect(mockSvc.createPulseSurvey).toHaveBeenCalledWith(dto, 1);
  });

  it('submitPulseResponse → submitPulseSurveyResponse(surveyId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.submitPulseResponse('ps1', dto, mockReq as any);
    expect(mockSvc.submitPulseSurveyResponse).toHaveBeenCalledWith('ps1', 1, dto);
  });
});
