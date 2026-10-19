import PDFDocument from 'pdfkit';
import { Op, PAGE } from './plan-types';

export interface PlanAssets {
  logo?: Buffer;
  background?: Buffer;
  signature?: Buffer;
}

/**
 * Executa um plano de desenho (ver layout-plan.ts) com o pdfkit. Não decide nada:
 * toda a composição vem do plano, que é puro e testável. Uma imagem em falta ou
 * corrompida é saltada — nunca impede a emissão do documento.
 */
export function renderPlanToPdf(plan: Op[], assets: PlanAssets, qrPng: Buffer): Promise<Buffer> {
  const doc = new PDFDocument({ size: [PAGE.w, PAGE.h], margin: 0 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const paint = (fill?: string, stroke?: string, lineWidth = 1) => {
    if (fill && stroke) doc.lineWidth(lineWidth).fillAndStroke(fill, stroke);
    else if (fill) doc.fill(fill);
    else if (stroke) doc.lineWidth(lineWidth).stroke(stroke);
  };

  for (const op of plan) {
    switch (op.kind) {
      case 'rect':
        doc.rect(op.x, op.y, op.w, op.h);
        paint(op.fill, op.stroke, op.lineWidth);
        break;
      case 'line':
        doc.moveTo(op.x1, op.y1).lineTo(op.x2, op.y2).lineWidth(op.lineWidth).stroke(op.stroke);
        break;
      case 'circle':
        doc.circle(op.cx, op.cy, op.r);
        paint(op.fill, op.stroke, op.lineWidth);
        break;
      case 'polygon':
        doc.polygon(...op.points).fill(op.fill);
        break;
      case 'text': {
        const lines = op.maxLines ?? 1;
        doc
          .font(op.font)
          .fontSize(op.size)
          .fillColor(op.color)
          .text(op.text, op.x, op.y, {
            width: op.w,
            align: op.align,
            height: op.size * 1.3 * lines,
            ellipsis: true,
          });
        break;
      }
      case 'image': {
        const buf = assets[op.asset];
        if (!buf) break;
        try {
          if (op.fit) {
            doc.image(buf, op.x, op.y, { fit: [op.w, op.h], align: 'center', valign: 'center' });
          } else {
            doc.image(buf, op.x, op.y, { width: op.w, height: op.h });
          }
        } catch {
          // imagem ilegível: salta-se, o certificado continua válido
        }
        break;
      }
      case 'qr':
        doc.image(qrPng, op.x, op.y, { width: op.size, height: op.size });
        break;
    }
  }

  doc.end();
  return done;
}
