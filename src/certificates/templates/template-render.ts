import QRCode from 'qrcode';
import { buildLayoutPlan, RenderData } from './layout-plan';
import { PlanAssets, renderPlanToPdf } from './plan-renderer';
import { TemplateConfig } from './template-config';

/**
 * Desenha um certificado a partir da configuração de um template. A presença das
 * imagens (logótipo, fundo, assinatura) decide-se pelos ficheiros realmente
 * disponíveis, nunca por indicadores à parte.
 */
export async function renderConfigPdf(
  config: TemplateConfig,
  data: Pick<RenderData, 'values' | 'verifyUrl'>,
  assets: PlanAssets,
): Promise<Buffer> {
  const qr = await QRCode.toBuffer(data.verifyUrl, { margin: 1, width: 240 });
  const plan = buildLayoutPlan(config, {
    ...data,
    hasLogo: !!assets.logo,
    hasBackground: !!assets.background,
    hasSignature: !!assets.signature,
  });
  return renderPlanToPdf(plan, assets, qr);
}
