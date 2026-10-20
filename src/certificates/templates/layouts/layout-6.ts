import { addLogo, addSignature, addVerification, color, drawContent } from '../layout-helpers';
import { Ctx, PAGE, Style } from '../plan-types';

/** 6 · Elegante com elementos geométricos — cantos triangulares e losango separador. */
export function layout6(ctx: Ctx): void {
  const { w, h } = PAGE;
  const p = color(ctx, 'primary');
  const a = color(ctx, 'accent');
  const s = 96;
  ctx.ops.push({
    kind: 'polygon',
    points: [
      [0, 0],
      [s, 0],
      [0, s],
    ],
    fill: p,
  });
  ctx.ops.push({
    kind: 'polygon',
    points: [
      [w, 0],
      [w - s, 0],
      [w, s],
    ],
    fill: a,
  });
  ctx.ops.push({
    kind: 'polygon',
    points: [
      [0, h],
      [s, h],
      [0, h - s],
    ],
    fill: a,
  });
  ctx.ops.push({
    kind: 'polygon',
    points: [
      [w, h],
      [w - s, h],
      [w, h - s],
    ],
    fill: p,
  });
  ctx.ops.push({ kind: 'rect', x: 60, y: 60, w: w - 120, h: h - 120, stroke: a, lineWidth: 0.5 });
  ctx.ops.push({
    kind: 'line',
    x1: w / 2 - 160,
    y1: 158,
    x2: w / 2 - 14,
    y2: 158,
    stroke: p,
    lineWidth: 1,
  });
  ctx.ops.push({
    kind: 'line',
    x1: w / 2 + 14,
    y1: 158,
    x2: w / 2 + 160,
    y2: 158,
    stroke: p,
    lineWidth: 1,
  });
  ctx.ops.push({
    kind: 'polygon',
    points: [
      [w / 2, 149],
      [w / 2 + 9, 158],
      [w / 2, 167],
      [w / 2 - 9, 158],
    ],
    fill: a,
  });

  const st: Style = {
    region: { x: 100, w: w - 200 },
    align: 'center',
    y: { title: 96, recognition: 180, name: 208, course: 268, details: 376, footer: h - 74 },
    size: { issuer: 12, title: 30, recognition: 13, name: 34, course: 20, details: 11, footer: 8 },
    fonts: {
      title: 'Times-Bold',
      body: 'Times-Roman',
      name: 'Times-Italic',
      course: 'Times-Bold',
      details: 'Times-Roman',
      footer: 'Times-Roman',
    },
    colors: { title: 'primary', body: 'text', name: 'primary', course: 'text', details: 'text' },
    qr: { x: 110, y: h - 178, size: 80 },
    code: { x: 200, y: h - 138, w: 320, align: 'left', font: 'Times-Roman' },
    signature: { x: 540, y: h - 112, w: 200 },
  };
  addLogo(ctx, { x: w / 2 - 50, y: 66, w: 100, h: 24 });
  drawContent(ctx, st);
  addSignature(ctx, st.signature);
  addVerification(ctx, st.qr, st.code);
}
