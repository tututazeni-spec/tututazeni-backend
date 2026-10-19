import { ElementKey } from './template-config';
import { renderParagraph, renderVariables, VariableValues } from './template-variables';
import { Align } from './template-config';
import { Content, ColorRole, Ctx, FontName, PAGE, RenderData, Style } from './plan-types';
import { TemplateConfig } from './template-config';

export const color = (ctx: Ctx, role: ColorRole) => ctx.config.colors[role];
const MARGIN = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

// Fontes standard do pdfkit só cobrem Latin-1: remove emoji/símbolos fora desse intervalo.
const NOT_LATIN1 = new RegExp(
  '[^\\u0020-\\u007E\\u00A0-\\u00FF\\u2013\\u2014\\u2018\\u2019\\u201C\\u201D\\u2026]',
  'g',
);

export function printable(text: string, max: number): string {
  const clean = text.replace(NOT_LATIN1, '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function buildContent(config: TemplateConfig, data: RenderData): Content {
  const v: VariableValues = {};
  for (const [k, val] of Object.entries(data.values)) if (val) v[k] = printable(val, 300);
  const o = config.options;
  if (!o.showHours) delete v.carga_horaria;
  if (!o.showValidity) delete v.data_validade;
  if (!o.showScore) delete v.nota_final;
  // Com o código desligado ele não pode aparecer em lado nenhum (nem no rodapé).
  if (!o.showCode) delete v.codigo_certificado;
  const joined = (text: string, sep: string) => renderParagraph(text, v).join(sep) || null;
  return {
    title: renderVariables(config.texts.title, v) ?? 'CERTIFICADO',
    recognition: renderParagraph(config.texts.recognition, v),
    name: printable(v.nome_completo ?? '', 120),
    courseLines: renderParagraph(config.texts.courseLine, v),
    details: joined(config.texts.detailsLine, '  ·  '),
    footer: joined(config.texts.footer, ' '),
    issuer: v.nome_empresa ?? null,
    code: o.showCode && v.codigo_certificado ? v.codigo_certificado : null,
    signatoryName: config.signatory.name ? printable(config.signatory.name, 120) : null,
    signatoryTitle: config.signatory.title ? printable(config.signatory.title, 120) : null,
  };
}

// ─── Primitivas: aplicam os ajustes do utilizador (alinhamento, tamanho, posição) ───

interface TextSpec {
  x: number;
  y: number;
  w: number;
  size: number;
  font: FontName;
  color: ColorRole;
  align: Align;
  maxLines?: number;
}

/** Texto com os ajustes do elemento `key` (null = sem ajustes) e limitado à página. */
export function addText(ctx: Ctx, key: ElementKey | null, text: string, s: TextSpec): void {
  const t = key ? ctx.config.elements[key] : undefined;
  if (t?.visible === false) return;
  const size = s.size * (t?.scale ?? 1);
  const maxLines = s.maxLines ?? 1;
  const h = size * 1.3 * maxLines;
  const w = Math.min(s.w, PAGE.w - 2 * MARGIN);
  ctx.ops.push({
    kind: 'text',
    text,
    x: clamp(s.x + (t?.dx ?? 0) * PAGE.w, MARGIN, PAGE.w - MARGIN - w),
    y: clamp(s.y + (t?.dy ?? 0) * PAGE.h, MARGIN, PAGE.h - MARGIN - h),
    w,
    size,
    font: s.font,
    color: color(ctx, s.color),
    align: t?.align ?? s.align,
    maxLines,
  });
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Caixa (imagem, QR, assinatura) com escala e deslocamento, sempre dentro da página. */
export function placeBox(ctx: Ctx, key: ElementKey, b: Box): Box | null {
  const t = ctx.config.elements[key];
  if (t?.visible === false) return null;
  const scale = t?.scale ?? 1;
  const w = Math.min(b.w * scale, PAGE.w - 2 * MARGIN);
  const h = Math.min(b.h * scale, PAGE.h - 2 * MARGIN);
  return {
    w,
    h,
    x: clamp(b.x + (t?.dx ?? 0) * PAGE.w, MARGIN, PAGE.w - MARGIN - w),
    y: clamp(b.y + (t?.dy ?? 0) * PAGE.h, MARGIN, PAGE.h - MARGIN - h),
  };
}

export function addLogo(ctx: Ctx, b: Box): void {
  if (!ctx.data.hasLogo) return;
  const box = placeBox(ctx, 'logo', b);
  if (box) ctx.ops.push({ kind: 'image', asset: 'logo', ...box, fit: true });
}

/** Linha de assinatura + imagem + nome e cargo. Sem nada configurado, não desenha nada. */
export function addSignature(
  ctx: Ctx,
  s: { x: number; y: number; w: number },
  role: ColorRole = 'text',
): void {
  const { signatoryName: name, signatoryTitle: title } = ctx.content;
  const hasImage = ctx.data.hasSignature;
  if (!hasImage && !name && !title) return;
  const box = placeBox(ctx, 'signature', { x: s.x, y: s.y - 52, w: s.w, h: 90 });
  if (!box) return;
  if (hasImage)
    ctx.ops.push({
      kind: 'image',
      asset: 'signature',
      x: box.x,
      y: box.y,
      w: box.w,
      h: 48,
      fit: true,
    });
  ctx.ops.push({
    kind: 'line',
    x1: box.x,
    y1: box.y + 52,
    x2: box.x + box.w,
    y2: box.y + 52,
    stroke: color(ctx, role),
    lineWidth: 0.8,
  });
  if (name) {
    ctx.ops.push({
      kind: 'text',
      text: name,
      x: box.x,
      y: box.y + 56,
      w: box.w,
      size: 11,
      font: 'Helvetica-Bold',
      color: color(ctx, role),
      align: 'center',
      maxLines: 1,
    });
  }
  if (title) {
    ctx.ops.push({
      kind: 'text',
      text: title,
      x: box.x,
      y: box.y + 70,
      w: box.w,
      size: 9,
      font: 'Helvetica',
      color: color(ctx, role),
      align: 'center',
      maxLines: 1,
    });
  }
}

/** QR Code de verificação e, ao lado, o código e a ligação pública. */
export function addVerification(
  ctx: Ctx,
  qr: Style['qr'],
  code: Style['code'],
  role: ColorRole = 'text',
): void {
  const { options } = ctx.config;
  if (options.showQr) {
    const box = placeBox(ctx, 'qr', { x: qr.x, y: qr.y, w: qr.size, h: qr.size });
    if (box) ctx.ops.push({ kind: 'qr', x: box.x, y: box.y, size: Math.min(box.w, box.h) });
  }
  if (ctx.content.code) {
    const font = code.font ?? 'Helvetica';
    addText(ctx, 'code', `Código: ${ctx.content.code}`, {
      x: code.x,
      y: code.y,
      w: code.w,
      size: 9,
      font,
      color: role,
      align: code.align,
    });
    addText(ctx, 'code', `Verifique em: ${ctx.data.verifyUrl}`, {
      x: code.x,
      y: code.y + 14,
      w: code.w,
      size: 7,
      font,
      color: role,
      align: code.align,
      maxLines: 2,
    });
  }
}

/** Blocos de conteúdo comuns a todos os layouts, posicionados pelo `Style` de cada um. */
export function drawContent(ctx: Ctx, st: Style): void {
  const { content: c } = ctx;
  const base = { x: st.region.x, w: st.region.w, align: st.align };
  if (c.issuer && st.y.issuer !== undefined) {
    addText(ctx, null, c.issuer, {
      ...base,
      y: st.y.issuer,
      size: st.size.issuer,
      font: st.fonts.title,
      color: st.colors.title,
    });
  }
  addText(ctx, 'title', c.title, {
    ...base,
    y: st.y.title,
    size: st.size.title,
    font: st.fonts.title,
    color: st.colors.title,
  });
  c.recognition.forEach((line, i) =>
    addText(ctx, 'recognition', line, {
      ...base,
      y: st.y.recognition + i * st.size.recognition * 1.4,
      size: st.size.recognition,
      font: st.fonts.body,
      color: st.colors.body,
    }),
  );
  const nameSize =
    c.name.length > 60
      ? st.size.name * 0.6
      : c.name.length > 35
        ? st.size.name * 0.8
        : st.size.name;
  addText(ctx, 'name', c.name, {
    ...base,
    y: st.y.name,
    size: nameSize,
    font: st.fonts.name,
    color: st.colors.name,
  });
  let y = st.y.course;
  c.courseLines.forEach((line, i) => {
    const last = i === c.courseLines.length - 1 && c.courseLines.length > 0;
    const size = last ? st.size.course : st.size.recognition;
    addText(ctx, 'course', line, {
      ...base,
      y,
      size,
      font: last ? st.fonts.course : st.fonts.body,
      color: last ? st.colors.course : st.colors.body,
      maxLines: last ? 2 : 1,
    });
    y += size * 1.45;
  });
  if (c.details) {
    addText(ctx, 'details', c.details, {
      ...base,
      y: st.y.details,
      size: st.size.details,
      font: st.fonts.details,
      color: st.colors.details,
      maxLines: 2,
    });
  }
  if (c.footer) {
    addText(ctx, null, c.footer, {
      ...base,
      y: st.y.footer,
      size: st.size.footer,
      font: st.fonts.footer,
      color: st.colors.body,
    });
  }
}
