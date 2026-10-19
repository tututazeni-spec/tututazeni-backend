import { addLogo, addSignature, addVerification, color, drawContent } from '../layout-helpers';
import { Ctx, PAGE, Style } from '../plan-types';

/** 1 · Corporativo clássico — dupla moldura, composição centrada e sóbria. */
export function layout1(ctx: Ctx): void {
  const { w, h } = PAGE;
  const p = color(ctx, 'primary');
  ctx.ops.push({ kind: 'rect', x: 25, y: 25, w: w - 50, h: h - 50, stroke: p, lineWidth: 3 });
  ctx.ops.push({ kind: 'rect', x: 33, y: 33, w: w - 66, h: h - 66, stroke: p, lineWidth: 0.75 });
  ctx.ops.push({
    kind: 'line',
    x1: w / 2 - 70,
    y1: 148,
    x2: w / 2 + 70,
    y2: 148,
    stroke: color(ctx, 'accent'),
    lineWidth: 2,
  });

  const st: Style = {
    region: { x: 60, w: w - 120 },
    align: 'center',
    y: {
      issuer: 62,
      title: 100,
      recognition: 168,
      name: 195,
      course: 255,
      details: 360,
      footer: h - 62,
    },
    size: { issuer: 15, title: 32, recognition: 13, name: 28, course: 20, details: 12, footer: 9 },
    fonts: {
      title: 'Helvetica-Bold',
      body: 'Helvetica',
      name: 'Helvetica-Bold',
      course: 'Helvetica-Bold',
      details: 'Helvetica',
      footer: 'Helvetica',
    },
    colors: { title: 'primary', body: 'text', name: 'primary', course: 'primary', details: 'text' },
    qr: { x: 60, y: h - 160, size: 90 },
    code: { x: 160, y: h - 130, w: 380, align: 'left' },
    signature: { x: 560, y: h - 105, w: 210 },
  };
  addLogo(ctx, { x: 60, y: 48, w: 110, h: 50 });
  drawContent(ctx, st);
  addSignature(ctx, st.signature);
  addVerification(ctx, st.qr, st.code);
}
