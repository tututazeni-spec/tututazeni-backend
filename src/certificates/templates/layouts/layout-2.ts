import { addLogo, addSignature, addVerification, color, drawContent } from '../layout-helpers';
import { Ctx, PAGE, Style } from '../plan-types';

/** 2 · Moderno minimalista — muito espaço em branco, título à esquerda, linha de acento. */
export function layout2(ctx: Ctx): void {
  const { w, h } = PAGE;
  const a = color(ctx, 'accent');
  ctx.ops.push({ kind: 'rect', x: 50, y: 62, w: 5, h: 150, fill: a });
  ctx.ops.push({ kind: 'line', x1: 78, y1: 132, x2: 330, y2: 132, stroke: a, lineWidth: 1.2 });
  ctx.ops.push({ kind: 'rect', x: w - 56, y: h - 56, w: 22, h: 22, fill: a });

  const st: Style = {
    region: { x: 78, w: 640 },
    align: 'left',
    y: { title: 78, recognition: 160, name: 188, course: 262, details: 380, footer: h - 46 },
    size: { issuer: 12, title: 42, recognition: 12, name: 36, course: 22, details: 11, footer: 8 },
    fonts: {
      title: 'Helvetica-Bold',
      body: 'Helvetica',
      name: 'Helvetica-Bold',
      course: 'Helvetica',
      details: 'Helvetica',
      footer: 'Helvetica',
    },
    colors: { title: 'primary', body: 'text', name: 'primary', course: 'primary', details: 'text' },
    qr: { x: w - 170, y: h - 175, size: 80 },
    code: { x: w - 330, y: h - 88, w: 250, align: 'right' },
    signature: { x: 78, y: h - 100, w: 200 },
  };
  addLogo(ctx, { x: w - 170, y: 48, w: 110, h: 46 });
  drawContent(ctx, st);
  addSignature(ctx, st.signature);
  addVerification(ctx, st.qr, st.code);
}
