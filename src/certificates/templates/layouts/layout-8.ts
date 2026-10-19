import { addLogo, addSignature, addVerification, color, drawContent } from '../layout-helpers';
import { Ctx, PAGE, Style } from '../plan-types';

/** 8 · Moderno com faixa lateral — faixa vertical com logótipo e QR; conteúdo à direita. */
export function layout8(ctx: Ctx): void {
  const { w, h } = PAGE;
  const band = 215;
  ctx.ops.push({ kind: 'rect', x: 0, y: 0, w: band, h, fill: color(ctx, 'primary') });
  ctx.ops.push({ kind: 'rect', x: band, y: 0, w: 6, h, fill: color(ctx, 'accent') });
  // O QR precisa de fundo claro para ser lido.
  ctx.ops.push({ kind: 'rect', x: 54, y: h - 196, w: 106, h: 106, fill: color(ctx, 'background') });
  ctx.ops.push({
    kind: 'line',
    x1: 262,
    y1: 150,
    x2: 420,
    y2: 150,
    stroke: color(ctx, 'accent'),
    lineWidth: 2.5,
  });

  const st: Style = {
    region: { x: 262, w: w - 262 - 50 },
    align: 'left',
    y: { title: 84, recognition: 170, name: 198, course: 268, details: 380, footer: h - 46 },
    size: { issuer: 12, title: 36, recognition: 13, name: 32, course: 21, details: 11, footer: 8 },
    fonts: {
      title: 'Helvetica-Bold',
      body: 'Helvetica',
      name: 'Helvetica-Bold',
      course: 'Helvetica-Bold',
      details: 'Helvetica',
      footer: 'Helvetica',
    },
    colors: { title: 'primary', body: 'text', name: 'primary', course: 'primary', details: 'text' },
    qr: { x: 62, y: h - 188, size: 90 },
    code: { x: 22, y: h - 76, w: band - 40, align: 'center' },
    signature: { x: 262, y: h - 100, w: 220 },
  };
  addLogo(ctx, { x: 30, y: 44, w: 155, h: 70 });
  drawContent(ctx, st);
  addSignature(ctx, st.signature);
  addVerification(ctx, st.qr, st.code, 'background');
}
