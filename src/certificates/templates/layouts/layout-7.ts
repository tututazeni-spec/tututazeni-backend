import { addLogo, addSignature, addVerification, color, drawContent } from '../layout-helpers';
import { Ctx, PAGE, Style } from '../plan-types';

/** 7 · Académico tradicional — moldura ornamentada, tipografia clássica e selo circular. */
export function layout7(ctx: Ctx): void {
  const { w, h } = PAGE;
  const p = color(ctx, 'primary');
  const a = color(ctx, 'accent');
  ctx.ops.push({ kind: 'rect', x: 20, y: 20, w: w - 40, h: h - 40, stroke: p, lineWidth: 4 });
  ctx.ops.push({ kind: 'rect', x: 28, y: 28, w: w - 56, h: h - 56, stroke: a, lineWidth: 1 });
  ctx.ops.push({ kind: 'rect', x: 36, y: 36, w: w - 72, h: h - 72, stroke: p, lineWidth: 0.5 });
  for (const [x, y] of [
    [20, 20],
    [w - 44, 20],
    [20, h - 44],
    [w - 44, h - 44],
  ]) {
    ctx.ops.push({ kind: 'rect', x, y, w: 24, h: 24, fill: a });
  }
  // Selo circular central inferior.
  ctx.ops.push({ kind: 'circle', cx: w / 2, cy: h - 112, r: 40, stroke: p, lineWidth: 2 });
  ctx.ops.push({ kind: 'circle', cx: w / 2, cy: h - 112, r: 32, stroke: a, lineWidth: 0.6 });

  const st: Style = {
    region: { x: 80, w: w - 160 },
    align: 'center',
    y: {
      issuer: 64,
      title: 96,
      recognition: 164,
      name: 192,
      course: 254,
      details: 366,
      footer: h - 62,
    },
    size: { issuer: 14, title: 30, recognition: 14, name: 34, course: 20, details: 11, footer: 9 },
    fonts: {
      title: 'Times-Bold',
      body: 'Times-Roman',
      name: 'Times-Italic',
      course: 'Times-Bold',
      details: 'Times-Roman',
      footer: 'Times-Italic',
    },
    colors: { title: 'primary', body: 'text', name: 'text', course: 'primary', details: 'text' },
    qr: { x: 72, y: h - 168, size: 80 },
    code: { x: 162, y: h - 128, w: 280, align: 'left', font: 'Times-Roman' },
    signature: { x: 590, y: h - 105, w: 190 },
  };
  addLogo(ctx, { x: 78, y: 50, w: 90, h: 44 });
  drawContent(ctx, st);
  addSignature(ctx, st.signature);
  addVerification(ctx, st.qr, st.code);
}
