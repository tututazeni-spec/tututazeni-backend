import { PayrollOpsController } from './payroll-ops.controller';
import { PayrollInsightsService } from './reports/payroll-insights.service';
import { PayrollPaymentsService } from './payments/payroll-payments.service';
import { CurrentUserData, ROLES_KEY } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

/**
 * Delegação pura + regras de acesso: pagamentos e fecho salarial são
 * operações financeiras, por isso o RBAC (classe e rota) é parte do contrato.
 */
describe('PayrollOpsController', () => {
  const user = { id: 9 } as CurrentUserData;
  let insights: Record<string, jest.Mock>;
  let payments: Record<string, jest.Mock>;
  let controller: PayrollOpsController;

  beforeEach(() => {
    insights = {
      overview: jest.fn().mockResolvedValue('overview'),
      taxConfig: jest.fn().mockResolvedValue('tax'),
      upsertTaxConfig: jest.fn().mockResolvedValue('upserted'),
    };
    payments = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue('created'),
      updateStatus: jest.fn().mockResolvedValue('updated'),
      bankFile: jest.fn().mockResolvedValue('csv'),
      validate: jest.fn().mockResolvedValue('validated'),
      close: jest.fn().mockResolvedValue('closed'),
    };
    controller = new PayrollOpsController(
      insights as unknown as PayrollInsightsService,
      payments as unknown as PayrollPaymentsService,
    );
  });

  describe('controlo de acesso', () => {
    it('a classe só permite ADMIN e RH', () => {
      expect(Reflect.getMetadata(ROLES_KEY, PayrollOpsController)).toEqual([Role.ADMIN, Role.RH]);
    });

    it('alterar regras INSS/IRT é exclusivo de ADMIN', () => {
      expect(Reflect.getMetadata(ROLES_KEY, PayrollOpsController.prototype.upsertTaxes)).toEqual([
        Role.ADMIN,
      ]);
    });
  });

  describe('impostos', () => {
    it('usa o ano corrente quando não é indicado', async () => {
      await controller.taxes();
      expect(insights.taxConfig).toHaveBeenCalledWith(new Date().getFullYear());
    });

    it('converte o ano da query para número', async () => {
      await controller.taxes('2025');
      expect(insights.taxConfig).toHaveBeenCalledWith(2025);
    });
  });

  describe('pagamentos', () => {
    it('converte runId para número e mantém os restantes filtros', async () => {
      await controller.listPayments('12', 'PAID', '2026-09');
      expect(payments.list).toHaveBeenCalledWith({ runId: 12, status: 'PAID', period: '2026-09' });
    });

    it('sem runId, não envia NaN', async () => {
      await controller.listPayments();
      expect(payments.list).toHaveBeenCalledWith({
        runId: undefined,
        status: undefined,
        period: undefined,
      });
    });

    it('regista o utilizador autenticado em criação, mudança de estado e ficheiro bancário', async () => {
      const dto = { runId: 1 } as never;
      await controller.createPayment(dto, user);
      await controller.updatePaymentStatus(4, { status: 'PAID' } as never, user);
      await controller.bankFile(4, user);
      expect(payments.create).toHaveBeenCalledWith(dto, 9);
      expect(payments.updateStatus).toHaveBeenCalledWith(4, { status: 'PAID' }, 9);
      expect(payments.bankFile).toHaveBeenCalledWith(4, 9);
    });
  });

  describe('fecho salarial', () => {
    it('as validações RH e Finanças são passos distintos', async () => {
      await controller.validateHr(3, user);
      await controller.validateFinance(3, user);
      expect(payments.validate).toHaveBeenNthCalledWith(1, 3, 'hr', 9);
      expect(payments.validate).toHaveBeenNthCalledWith(2, 3, 'finance', 9);
    });

    it('close propaga o resultado e o utilizador', async () => {
      await expect(controller.close(3, user)).resolves.toBe('closed');
      expect(payments.close).toHaveBeenCalledWith(3, 9);
    });

    it('propaga erros do serviço (ex.: fecho sem validação) sem os engolir', async () => {
      payments.close.mockRejectedValue(new Error('Falta validação'));
      await expect(controller.close(3, user)).rejects.toThrow('Falta validação');
    });
  });
});
