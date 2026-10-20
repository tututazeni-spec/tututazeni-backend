import { addLogo, addSignature, addVerification, color, drawContent } from '../layout-helpers';
import { Ctx, PAGE, Style } from '../plan-types';

/** 3 · Executivo premium — fundo escuro, detalhes dourados, tipografia com serifa. */
export function layout3(ctx: Ctx): void {
  const { w, h } = PAGE;
  const g = color(ctx, 'primary');
  ctx.ops.push({ kind: 'rect', x: 20, y: 20, w: w - 40, h: h - 40, stroke: g, lineWidth: 1.5 });
  ctx.ops.push({ kind: 'rect', x: 28, y: 28, w: w - 56, h: h - 56, stroke: g, lineWidth: 0.5 });
  for (const [cx, cy] of [
    [44, 44],
    [w - 44, 44],
    [44, h - 44],
    [w - 44, h - 44],
  ]) {
    ctx.ops.push({ kind: 'circle', cx, cy, r: 5, fill: g });
  }
  // Divisor com losango central.
  ctx.ops.push({
    kind: 'line',
    x1: w / 2 - 170,
    y1: 150,
    x2: w / 2 - 14,
    y2: 150,
    stroke: g,
    lineWidth: 0.8,
  });
  ctx.ops.push({
    kind: 'line',
    x1: w / 2 + 14,
    y1: 150,
    x2: w / 2 + 170,
    y2: 150,
    stroke: g,
    lineWidth: 0.8,
  });
  ctx.ops.push({
    kind: 'polygon',
    points: [
      [w / 2, 142],
      [w / 2 + 8, 150],
      [w / 2, 158],
      [w / 2 - 8, 150],
    ],
    fill: g,
  });

  const st: Style = {
    region: { x: 70, w: w - 140 },
    align: 'center',
    y: {
      issuer: 64,
      title: 98,
      recognition: 172,
      name: 200,
      course: 262,
      details: 372,
      footer: h - 60,
    },
    size: { issuer: 13, title: 30, recognition: 13, name: 38, course: 21, details: 11, footer: 9 },
    fonts: {
      title: 'Times-Bold',
      body: 'Times-Roman',
      name: 'Times-Italic',
      course: 'Times-Bold',
      details: 'Times-Roman',
      footer: 'Times-Roman',
    },
    colors: { title: 'primary', body: 'text', name: 'text', course: 'primary', details: 'text' },
    qr: { x: 66, y: h - 168, size: 86 },
    code: { x: 162, y: h - 128, w: 360, align: 'left', font: 'Times-Roman' },
    signature: { x: 570, y: h - 105, w: 200 },
  };
  addLogo(ctx, { x: 66, y: 52, w: 100, h: 46 });
  drawContent(ctx, st);
  addSignature(ctx, st.signature);
  addVerification(ctx, st.qr, st.code);
}
