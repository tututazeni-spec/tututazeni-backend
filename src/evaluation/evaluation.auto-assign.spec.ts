import { EvaluationService } from './evaluation.service';

function build(status: string) {
  const campaign = { id: 3, name: 'Ciclo', status };
  const prisma: any = {
    evaluationCampaign: { update: jest.fn().mockResolvedValue(campaign) },
  };
  const svc: any = Object.create(EvaluationService.prototype);
  svc.prisma = prisma;
  svc.assertCampaignExists = jest.fn().mockResolvedValue(campaign);
  svc.assignNewParticipants = jest.fn().mockResolvedValue(undefined);
  svc.toPublicCampaign = (c: unknown) => c;
  return { svc: svc as EvaluationService, assign: svc.assignNewParticipants as jest.Mock };
}

describe('EvaluationService.updateCycle — população de um ciclo já activo', () => {
  it('cria os pedidos dos novos participantes quando o público muda num ciclo activo', async () => {
    const { svc, assign } = build('ACTIVE');
    await svc.updateCycle(3, { targetDeptIds: [1, 2] } as never);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('não mexe nos pedidos se o público não mudou', async () => {
    const { svc, assign } = build('ACTIVE');
    await svc.updateCycle(3, { name: 'Novo nome' } as never);
    expect(assign).not.toHaveBeenCalled();
  });

  it('não atribui nada num ciclo que ainda não foi activado', async () => {
    const { svc, assign } = build('DRAFT');
    await svc.updateCycle(3, { targetUnitIds: [5] } as never);
    expect(assign).not.toHaveBeenCalled();
  });
});
