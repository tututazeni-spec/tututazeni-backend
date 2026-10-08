import { PayrollRunController } from './payroll-run.controller';
import { PayrollWorkflowService } from './payroll-workflow.service';
import { CurrentUserData } from '../common/decorators';
import {
  CreatePayrollRunDto,
  PayrollRunFilterDto,
  RejectRunDto,
  CancelRunDto,
  RecalcPayslipInputsDto,
} from './payroll.dto';

/**
 * Teste de delegação pura: o controller não tem lógica própria — cada rota
 * chama o método correspondente do PayrollWorkflowService com os args certos
 * e devolve o resultado tal e qual.
 */
describe('PayrollRunController', () => {
  const user = { id: 7, email: 'rh@innova.test' } as CurrentUserData;

  let wf: jest.Mocked<
    Pick<
      PayrollWorkflowService,
      | 'createRun'
      | 'list'
      | 'getRun'
      | 'listPayslips'
      | 'listExceptions'
      | 'process'
      | 'recalcPayslip'
      | 'excludePayslip'
      | 'submit'
      | 'approve'
      | 'reject'
      | 'publish'
      | 'cancel'
    >
  >;
  let controller: PayrollRunController;

  beforeEach(() => {
    wf = {
      createRun: jest.fn().mockResolvedValue('createRun-result'),
      list: jest.fn().mockResolvedValue('list-result'),
      getRun: jest.fn().mockResolvedValue('getRun-result'),
      listPayslips: jest.fn().mockResolvedValue('listPayslips-result'),
      listExceptions: jest.fn().mockResolvedValue('listExceptions-result'),
      process: jest.fn().mockResolvedValue('process-result'),
      recalcPayslip: jest.fn().mockResolvedValue('recalcPayslip-result'),
      excludePayslip: jest.fn().mockResolvedValue('excludePayslip-result'),
      submit: jest.fn().mockResolvedValue('submit-result'),
      approve: jest.fn().mockResolvedValue('approve-result'),
      reject: jest.fn().mockResolvedValue('reject-result'),
      publish: jest.fn().mockResolvedValue('publish-result'),
      cancel: jest.fn().mockResolvedValue('cancel-result'),
    } as unknown as typeof wf;
    controller = new PayrollRunController(wf as unknown as PayrollWorkflowService);
  });

  it('create → wf.createRun(dto, user.id)', async () => {
    const dto = { period: '2026-04' } as CreatePayrollRunDto;
    await expect(controller.create(dto, user)).resolves.toBe('createRun-result');
    expect(wf.createRun).toHaveBeenCalledWith(dto, 7);
  });

  it('list → wf.list(filter)', async () => {
    const filter = { page: 2 } as PayrollRunFilterDto;
    await expect(controller.list(filter)).resolves.toBe('list-result');
    expect(wf.list).toHaveBeenCalledWith(filter);
  });

  it('getRun → wf.getRun(id)', async () => {
    await expect(controller.getRun(42)).resolves.toBe('getRun-result');
    expect(wf.getRun).toHaveBeenCalledWith(42);
  });

  it('payslips → wf.listPayslips(id, filter)', async () => {
    const filter = { limit: 10 } as PayrollRunFilterDto;
    await expect(controller.payslips(42, filter)).resolves.toBe('listPayslips-result');
    expect(wf.listPayslips).toHaveBeenCalledWith(42, filter);
  });

  it('exceptions → wf.listExceptions(id)', async () => {
    await expect(controller.exceptions(42)).resolves.toBe('listExceptions-result');
    expect(wf.listExceptions).toHaveBeenCalledWith(42);
  });

  it('process → wf.process(id, user.id)', async () => {
    await expect(controller.process(42, user)).resolves.toBe('process-result');
    expect(wf.process).toHaveBeenCalledWith(42, 7);
  });

  it('recalc → wf.recalcPayslip(id, payslipId, dto)', async () => {
    const dto = { absenceDays: 2 } as RecalcPayslipInputsDto;
    await expect(controller.recalc(42, 99, dto)).resolves.toBe('recalcPayslip-result');
    expect(wf.recalcPayslip).toHaveBeenCalledWith(42, 99, dto);
  });

  it('exclude → wf.excludePayslip(id, payslipId)', async () => {
    await expect(controller.exclude(42, 99)).resolves.toBe('excludePayslip-result');
    expect(wf.excludePayslip).toHaveBeenCalledWith(42, 99);
  });

  it('submit → wf.submit(id, user.id)', async () => {
    await expect(controller.submit(42, user)).resolves.toBe('submit-result');
    expect(wf.submit).toHaveBeenCalledWith(42, 7);
  });

  it('approve → wf.approve(id, user)', async () => {
    await expect(controller.approve(42, user)).resolves.toBe('approve-result');
    expect(wf.approve).toHaveBeenCalledWith(42, user);
  });

  it('reject → wf.reject(id, user.id, dto)', async () => {
    const dto = { reason: 'valores errados' } as RejectRunDto;
    await expect(controller.reject(42, user, dto)).resolves.toBe('reject-result');
    expect(wf.reject).toHaveBeenCalledWith(42, 7, dto);
  });

  it('publish → wf.publish(id, user)', async () => {
    await expect(controller.publish(42, user)).resolves.toBe('publish-result');
    expect(wf.publish).toHaveBeenCalledWith(42, user);
  });

  it('cancel → wf.cancel(id, user.id, dto)', async () => {
    const dto = { reason: 'duplicado' } as CancelRunDto;
    await expect(controller.cancel(42, user, dto)).resolves.toBe('cancel-result');
    expect(wf.cancel).toHaveBeenCalledWith(42, 7, dto);
  });
});
