import { addLogo, addSignature, addVerification, color, drawContent } from '../layout-helpers';
import { Ctx, PAGE, Style } from '../plan-types';

/** 5 · Tecnológico contemporâneo — fundo escuro, formas angulares e metadados monoespaçados. */
export function layout5(ctx: Ctx): void {
  const { w, h } = PAGE;
  const p = color(ctx, 'primary');
  const a = color(ctx, 'accent');
  ctx.ops.push({
    kind: 'polygon',
    points: [
      [w - 260, 0],
      [w, 0],
      [w, 190],
    ],
    fill: p,
  });
  ctx.ops.push({
    kind: 'polygon',
    points: [
      [w - 150, 0],
      [w, 0],
      [w, 110],
    ],
    fill: a,
  });
  ctx.ops.push({ kind: 'rect', x: 40, y: 60, w: 3, h: 300, fill: p });
  // Colchetes de canto e moldura do QR.
  ctx.ops.push({ kind: 'line', x1: 40, y1: h - 40, x2: 90, y2: h - 40, stroke: p, lineWidth: 2 });
  ctx.ops.push({ kind: 'line', x1: 40, y1: h - 40, x2: 40, y2: h - 90, stroke: p, lineWidth: 2 });
  ctx.ops.push({ kind: 'rect', x: 56, y: h - 178, w: 98, h: 98, stroke: p, lineWidth: 1 });

  const st: Style = {
    region: { x: 64, w: 600 },
    align: 'left',
    y: { title: 66, recognition: 150, name: 178, course: 246, details: 368, footer: h - 52 },
    size: { issuer: 11, title: 34, recognition: 12, name: 30, course: 20, details: 10, footer: 8 },
    fonts: {
      title: 'Helvetica-Bold',
      body: 'Helvetica',
      name: 'Helvetica-Bold',
      course: 'Helvetica-Bold',
      details: 'Courier',
      footer: 'Courier',
    },
    colors: { title: 'primary', body: 'text', name: 'text', course: 'primary', details: 'accent' },
    qr: { x: 64, y: h - 172, size: 86 },
    code: { x: 170, y: h - 130, w: 340, align: 'left', font: 'Courier' },
    signature: { x: w - 290, y: h - 100, w: 210 },
  };
  addLogo(ctx, { x: 64, y: 28, w: 100, h: 34 });
  drawContent(ctx, st);
  addSignature(ctx, st.signature);
  addVerification(ctx, st.qr, st.code, 'accent');
}
