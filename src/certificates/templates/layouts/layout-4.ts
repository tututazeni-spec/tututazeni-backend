import { addLogo, addSignature, addVerification, color, drawContent } from '../layout-helpers';
import { Ctx, PAGE, Style } from '../plan-types';

/** 4 · Institucional formal — faixa superior com logótipo, selo oficial e texto à esquerda. */
export function layout4(ctx: Ctx): void {
  const { w, h } = PAGE;
  const p = color(ctx, 'primary');
  const a = color(ctx, 'accent');
  ctx.ops.push({ kind: 'rect', x: 0, y: 0, w, h: 96, fill: p });
  ctx.ops.push({ kind: 'rect', x: 0, y: 96, w, h: 4, fill: a });
  ctx.ops.push({ kind: 'rect', x: 0, y: h - 14, w, h: 14, fill: p });
  // Selo oficial (círculos concêntricos e estrela).
  ctx.ops.push({ kind: 'circle', cx: w - 130, cy: 300, r: 58, stroke: a, lineWidth: 3 });
  ctx.ops.push({ kind: 'circle', cx: w - 130, cy: 300, r: 47, stroke: a, lineWidth: 1 });
  const star: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 24 : 10;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    star.push([w - 130 + r * Math.cos(ang), 300 + r * Math.sin(ang)]);
  }
  ctx.ops.push({ kind: 'polygon', points: star, fill: a });

  const st: Style = {
    region: { x: 60, w: 560 },
    align: 'left',
    y: { title: 34, recognition: 140, name: 168, course: 232, details: 350, footer: h - 46 },
    size: { issuer: 12, title: 26, recognition: 13, name: 30, course: 19, details: 11, footer: 8 },
    fonts: {
      title: 'Helvetica-Bold',
      body: 'Helvetica',
      name: 'Helvetica-Bold',
      course: 'Helvetica-Bold',
      details: 'Helvetica',
      footer: 'Helvetica',
    },
    colors: {
      title: 'background',
      body: 'text',
      name: 'primary',
      course: 'primary',
      details: 'text',
    },
    qr: { x: w - 190, y: h - 190, size: 90 },
    code: { x: w - 300, y: h - 92, w: 250, align: 'right' },
    signature: { x: 60, y: h - 95, w: 220 },
  };
  addLogo(ctx, { x: w - 200, y: 18, w: 150, h: 60 });
  drawContent(ctx, st);
  addSignature(ctx, st.signature);
  addVerification(ctx, st.qr, st.code);
}
