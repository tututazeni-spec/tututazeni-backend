import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

/** Dados impressos no certificado — guardados em Certificate.snapshot (JSON). */
export interface CertificateSnapshot {
  code: string;
  recipientName: string;
  title: string;
  hours?: number | null;
  score?: number;
  issuedAt: string;
  expiresAt?: string | null;
  issuerName: string;
}

const NAVY = '#0F1F3D';
const MAX_NAME = 120;
const MAX_TITLE = 160;

export function buildVerifyUrl(code: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/verificar/${code}`;
}

// Fontes standard do pdfkit só cobrem Latin-1: remove emoji/símbolos fora desse
// intervalo (renderizariam como lixo) e limita o comprimento.
function printable(text: string, max: number): string {
  const clean = text
    .replace(/[^ -~ -ÿ–—‘’“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-PT');

/** Layout único "corporativo clássico"; a fatia de templates substitui esta função. */
export async function renderCertificatePdf(
  snapshot: CertificateSnapshot,
  verifyUrl: string,
): Promise<Buffer> {
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 240 });
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const w = doc.page.width;
  const h = doc.page.height;

  doc
    .rect(25, 25, w - 50, h - 50)
    .lineWidth(3)
    .stroke(NAVY);
  doc
    .rect(33, 33, w - 66, h - 66)
    .lineWidth(0.75)
    .stroke(NAVY);

  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(printable(snapshot.issuerName, 60), 0, 70, { align: 'center', width: w });
  doc
    .font('Helvetica-Bold')
    .fontSize(32)
    .text('CERTIFICADO', 0, 105, { align: 'center', width: w });
  doc
    .font('Helvetica')
    .fontSize(13)
    .fillColor('#444444')
    .text('Certificamos que', 0, 160, { align: 'center', width: w });

  const name = printable(snapshot.recipientName, MAX_NAME);
  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(name.length > 60 ? 18 : 28)
    .text(name, 60, 185, { align: 'center', width: w - 120 });

  doc
    .font('Helvetica')
    .fontSize(13)
    .fillColor('#444444')
    .text('concluiu com aproveitamento', 0, 245, { align: 'center', width: w });
  doc
    .fillColor(NAVY)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(printable(snapshot.title, MAX_TITLE), 80, 270, { align: 'center', width: w - 160 });

  const details: string[] = [];
  if (snapshot.hours) details.push(`Carga horária: ${snapshot.hours} h`);
  if (snapshot.score !== undefined) details.push(`Nota: ${snapshot.score}%`);
  details.push(`Emitido em ${fmtDate(snapshot.issuedAt)}`);
  if (snapshot.expiresAt) details.push(`Válido até ${fmtDate(snapshot.expiresAt)}`);
  doc
    .font('Helvetica')
    .fontSize(12)
    .fillColor('#444444')
    .text(details.join('   ·   '), 60, 335, { align: 'center', width: w - 120 });

  doc.image(qr, 60, h - 150, { width: 90 });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#444444')
    .text(`Código: ${snapshot.code}`, 160, h - 125, { width: 380 })
    .text(`Verifique em: ${verifyUrl}`, 160, h - 110, { width: 380 });

  doc.end();
  return done;
}
