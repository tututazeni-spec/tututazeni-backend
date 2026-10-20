import { buildContent } from './layout-helpers';
import { layoutFor } from './layouts';
import { Ctx, Op, PAGE, RenderData } from './plan-types';
import { TemplateConfig } from './template-config';

export * from './plan-types';

/** Plano de desenho puro e determinístico; o desenhador pdfkit só o executa. */
export function buildLayoutPlan(config: TemplateConfig, data: RenderData): Op[] {
  const ctx: Ctx = { config, data, content: buildContent(config, data), ops: [] };
  ctx.ops.push({ kind: 'rect', x: 0, y: 0, w: PAGE.w, h: PAGE.h, fill: config.colors.background });
  if (data.hasBackground) {
    ctx.ops.push({
      kind: 'image',
      asset: 'background',
      x: 0,
      y: 0,
      w: PAGE.w,
      h: PAGE.h,
      fit: false,
    });
  }
  layoutFor(config.layoutKey)(ctx);
  return ctx.ops;
}
