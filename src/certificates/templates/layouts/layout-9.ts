import { addLogo, addSignature, addVerification, color, drawContent } from '../layout-helpers';
import { Ctx, PAGE, Style } from '../plan-types';

/** 9 · Premium com moldura e destaque — moldura dupla grossa, cantos ornamentados e fita para o curso. */
export function layout9(ctx: Ctx): void {
  const { w, h } = PAGE;
  const p = color(ctx, 'primary');
  const a = color(ctx, 'accent');
  ctx.ops.push({ kind: 'rect', x: 22, y: 22, w: w - 44, h: h - 44, stroke: p, lineWidth: 8 });
  ctx.ops.push({ kind: 'rect', x: 38, y: 38, w: w - 76, h: h - 76, stroke: a, lineWidth: 1.5 });
  for (const [cx, cy] of [
    [38, 38],
    [w - 38, 38],
    [38, h - 38],
    [w - 38, h - 38],
  ]) {
    ctx.ops.push({ kind: 'circle', cx, cy, r: 10, fill: a });
    ctx.ops.push({ kind: 'circle', cx, cy, r: 4, fill: p });
  }
  // Fita atrás do nome do curso.
  ctx.ops.push({ kind: 'rect', x: w / 2 - 290, y: 263, w: 580, h: 34, fill: p });
  ctx.ops.push({
    kind: 'polygon',
    points: [
      [w / 2 - 290, 263],
      [w / 2 - 312, 280],
      [w / 2 - 290, 297],
    ],
    fill: a,
  });
  ctx.ops.push({
    kind: 'polygon',
    points: [
      [w / 2 + 290, 263],
      [w / 2 + 312, 280],
      [w / 2 + 290, 297],
    ],
    fill: a,
  });

  const st: Style = {
    region: { x: 90, w: w - 180 },
    align: 'center',
    y: {
      issuer: 66,
      title: 96,
      recognition: 166,
      name: 194,
      course: 246,
      details: 350,
      footer: h - 62,
    },
    size: { issuer: 13, title: 30, recognition: 13, name: 36, course: 20, details: 11, footer: 9 },
    fonts: {
      title: 'Times-Bold',
      body: 'Times-Roman',
      name: 'Times-Italic',
      course: 'Times-Bold',
      details: 'Times-Roman',
      footer: 'Times-Roman',
    },
    colors: { title: 'primary', body: 'text', name: 'text', course: 'background', details: 'text' },
    qr: { x: 72, y: h - 170, size: 84 },
    code: { x: 166, y: h - 130, w: 320, align: 'left', font: 'Times-Roman' },
    signature: { x: 570, y: h - 108, w: 200 },
  };
  addLogo(ctx, { x: 72, y: 56, w: 100, h: 40 });
  drawContent(ctx, st);
  addSignature(ctx, st.signature);
  addVerification(ctx, st.qr, st.code);
}
