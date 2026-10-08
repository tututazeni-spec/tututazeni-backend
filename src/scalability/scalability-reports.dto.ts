// modulo_scalability.md §23 — query da exportação de relatórios.

import { IsIn } from 'class-validator';

export class ReportExportQueryDto {
  @IsIn(['csv', 'xlsx', 'pdf']) format!: 'csv' | 'xlsx' | 'pdf';
}
