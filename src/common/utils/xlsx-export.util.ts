// src/common/utils/xlsx-export.util.ts
// Helper partilhado para gerar ficheiros .xlsx a partir de linhas
// tabulares — usado pelos módulos reports e employees (e por
// qualquer módulo futuro que precise de exportação XLSX além de CSV).

import ExcelJS from 'exceljs';

export async function buildXlsxBuffer<T extends Record<string, unknown>>(
  data: T[],
  headers: (keyof T & string)[],
  sheetName = 'Dados',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = headers.map(h => ({ header: h, key: h, width: 20 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of data) {
    sheet.addRow(headers.map(h => row[h] ?? ''));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
