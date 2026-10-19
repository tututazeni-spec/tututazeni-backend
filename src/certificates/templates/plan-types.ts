import { Align, TemplateConfig } from './template-config';
import { VariableValues } from './template-variables';

/** A4 horizontal, em pontos pdfkit. */
export const PAGE = { w: 841.89, h: 595.28 };

export type FontName =
  'Helvetica' | 'Helvetica-Bold' | 'Times-Roman' | 'Times-Bold' | 'Times-Italic' | 'Courier';

export type Op =
  | {
      kind: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    }
  | {
      kind: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      lineWidth: number;
    }
  | {
      kind: 'circle';
      cx: number;
      cy: number;
      r: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    }
  | { kind: 'polygon'; points: [number, number][]; fill: string }
  | {
      kind: 'text';
      text: string;
      x: number;
      y: number;
      w: number;
      size: number;
      font: FontName;
      color: string;
      align: Align;
      maxLines?: number;
    }
  | {
      kind: 'image';
      asset: 'logo' | 'background' | 'signature';
      x: number;
      y: number;
      w: number;
      h: number;
      fit: boolean;
    }
  | { kind: 'qr'; x: number; y: number; size: number };

export interface RenderData {
  values: VariableValues;
  hasLogo: boolean;
  hasBackground: boolean;
  hasSignature: boolean;
  verifyUrl: string;
}

export type ColorRole = 'primary' | 'accent' | 'text' | 'background';

/** Conteúdo já resolvido (variáveis substituídas, opcionais omitidas). */
export interface Content {
  title: string;
  recognition: string[];
  name: string;
  courseLines: string[];
  details: string | null;
  footer: string | null;
  issuer: string | null;
  code: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
}

export interface Ctx {
  config: TemplateConfig;
  data: RenderData;
  content: Content;
  ops: Op[];
}

export interface Style {
  region: { x: number; w: number };
  align: Align;
  y: {
    issuer?: number;
    title: number;
    recognition: number;
    name: number;
    course: number;
    details: number;
    footer: number;
  };
  size: {
    issuer: number;
    title: number;
    recognition: number;
    name: number;
    course: number;
    details: number;
    footer: number;
  };
  fonts: {
    title: FontName;
    body: FontName;
    name: FontName;
    course: FontName;
    details: FontName;
    footer: FontName;
  };
  colors: {
    title: ColorRole;
    body: ColorRole;
    name: ColorRole;
    course: ColorRole;
    details: ColorRole;
  };
  logo?: { x: number; y: number; w: number; h: number };
  qr: { x: number; y: number; size: number };
  code: { x: number; y: number; w: number; align: Align; font?: FontName };
  signature: { x: number; y: number; w: number };
}
