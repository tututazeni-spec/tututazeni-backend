// src/roi-impact/roi-reports.controller.ts
// "Relatórios" (docs/roi-impact.md §10). Exportação: Excel via
// buildXlsxBuffer (mesmo helper partilhado de src/reports) para os
// relatórios tabulares; PDF via PdfService para a síntese executiva (#11) —
// PowerPoint não está implementado (sem biblioteca .pptx no projecto; ver
// package.json) e não é fabricado aqui.
import { Controller, Get, Header, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoiReportsService } from './roi-reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
import { RoiReportFilterDto, TopInitiativesReportFilterDto } from './roi-impact.dto';
import { buildXlsxBuffer } from '../common/utils/xlsx-export.util';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact — Relatórios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact/reports')
export class RoiReportsController {
  constructor(private readonly svc: RoiReportsService) {}

  @Get('roi-consolidated')
  @ApiOperation({ summary: 'ROI consolidado da Academia (período)' })
  roiConsolidated(@Query() filter: RoiReportFilterDto) {
    return this.svc.roiConsolidated(filter);
  }

  @Get('roi-by-dimension')
  @ApiOperation({ summary: 'ROI por departamento/unidade/tipo de iniciativa' })
  roiByDimension(@Query() filter: RoiReportFilterDto) {
    return this.svc.roiByDimension(filter);
  }

  @Get('roi-by-dimension/export/xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="roi-por-dimensao.xlsx"')
  @ApiOperation({ summary: 'Exportar "ROI por departamento/unidade/tipo" como XLSX' })
  async exportRoiByDimensionXlsx(@Query() filter: RoiReportFilterDto) {
    const data = await this.svc.roiByDimension(filter);
    const rows = [
      ...data.byDepartment.map(d => ({
        dimensao: 'Departamento',
        chave: d.key,
        avgRoi: d.avgRoi,
        amostra: d.count,
      })),
      ...data.byUnit.map(d => ({
        dimensao: 'Unidade',
        chave: d.key,
        avgRoi: d.avgRoi,
        amostra: d.count,
      })),
      ...data.byInitiativeType.map(d => ({
        dimensao: 'Tipo de iniciativa',
        chave: d.key,
        avgRoi: d.avgRoi,
        amostra: d.count,
      })),
    ];
    const buffer = await buildXlsxBuffer(
      rows,
      ['dimensao', 'chave', 'avgRoi', 'amostra'],
      'ROI por dimensão',
    );
    return new StreamableFile(buffer);
  }

  @Get('impact-by-indicator')
  @ApiOperation({ summary: 'Impacto no negócio por indicador' })
  impactByIndicator(@Query() filter: RoiReportFilterDto) {
    return this.svc.impactByIndicator(filter);
  }

  @Get('training-cost-vs-budget')
  @ApiOperation({ summary: 'Custo total de formação vs. orçamento' })
  trainingCostVsBudget(@Query() filter: RoiReportFilterDto) {
    return this.svc.trainingCostVsBudget(filter);
  }

  @Get('budget-execution')
  @ApiOperation({ summary: 'Execução orçamental da Academia' })
  budgetExecution(@Query() filter: RoiReportFilterDto) {
    return this.svc.budgetExecution(filter);
  }

  @Get('budget-execution/export/xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="execucao-orcamental.xlsx"')
  @ApiOperation({ summary: 'Exportar "Execução orçamental da Academia" como XLSX' })
  async exportBudgetExecutionXlsx(@Query() filter: RoiReportFilterDto) {
    const data = await this.svc.budgetExecution(filter);
    const buffer = await buildXlsxBuffer(
      data.plans,
      [
        'planId',
        'name',
        'year',
        'period',
        'status',
        'plannedBudget',
        'realizedBudget',
        'executionRatePercent',
        'variance',
      ],
      'Execução orçamental',
    );
    return new StreamableFile(buffer);
  }

  @Get('top-initiatives')
  @ApiOperation({ summary: 'Top iniciativas por ROI' })
  topInitiatives(@Query() filter: TopInitiativesReportFilterDto) {
    return this.svc.topInitiativesByRoi(filter);
  }

  @Get('top-initiatives/export/xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="top-iniciativas-roi.xlsx"')
  @ApiOperation({ summary: 'Exportar "Top iniciativas por ROI" como XLSX' })
  async exportTopInitiativesXlsx(@Query() filter: TopInitiativesReportFilterDto) {
    const data = await this.svc.topInitiativesByRoi(filter);
    const buffer = await buildXlsxBuffer(
      data.top,
      [
        'id',
        'name',
        'initiativeType',
        'initiative',
        'roiPercent',
        'computedBenefit',
        'computedCost',
        'status',
      ],
      'Top iniciativas por ROI',
    );
    return new StreamableFile(buffer);
  }

  @Get('insufficient-data')
  @ApiOperation({ summary: 'Iniciativas sem dados suficientes para cálculo' })
  insufficientData(@Query() filter: RoiReportFilterDto) {
    return this.svc.insufficientDataInitiatives(filter);
  }

  @Get('roi-evolution')
  @ApiOperation({ summary: 'Evolução do ROI ano a ano' })
  roiEvolution(@Query() filter: RoiReportFilterDto) {
    return this.svc.roiEvolutionYearly(filter);
  }

  @Get('onboarding-retention')
  @ApiOperation({ summary: 'Impacto do onboarding na retenção' })
  onboardingRetention(@Query() filter: RoiReportFilterDto) {
    return this.svc.onboardingRetentionImpact(filter);
  }

  @Get('leadership-engagement')
  @ApiOperation({ summary: 'Impacto da liderança no engagement de equipa' })
  leadershipEngagement(@Query() filter: RoiReportFilterDto) {
    return this.svc.leadershipEngagementImpact(filter);
  }

  @Get('executive-summary')
  @ApiOperation({ summary: 'Relatório executivo para Administração (síntese de 1–2 páginas)' })
  executiveSummary(@Query() filter: RoiReportFilterDto) {
    return this.svc.executiveSummary(filter);
  }

  @Get('executive-summary/export/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="relatorio-executivo-roi-impacto.pdf"')
  @ApiOperation({ summary: 'Exportar a síntese executiva como PDF' })
  async exportExecutiveSummaryPdf(@Query() filter: RoiReportFilterDto) {
    const buffer = await this.svc.exportExecutiveSummaryPdf(filter);
    return new StreamableFile(buffer);
  }
}
