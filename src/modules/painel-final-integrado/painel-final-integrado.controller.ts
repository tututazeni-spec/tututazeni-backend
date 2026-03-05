import { Controller, Get, Param } from '@nestjs/common';
import { PainelFinalIntegradoService } from './painel-final-integrado.service';

@Controller('painel')
export class PainelFinalIntegradoController {
  constructor(private readonly service: PainelFinalIntegradoService) {}

  @Get('executivo')
  getPainelExecutivo() {
    return this.service.painelExecutivoGlobal();
  }

  @Get('departamento/:id')
  getPainelDepartamento(@Param('id') id: string) {
    return this.service.painelDepartamento(Number(id));
  }

  @Get('curso/analytics/:id')
  analyticsCurso(@Param('id') id: string) {
    return this.service.analyticsCurso(Number(id));
  }

  @Get('curso/relatorio/:id')
  relatorioCurso(@Param('id') id: string) {
    return this.service.relatorioCurso(Number(id));
  }

  @Get('unidade/metricas/:id')
  metricasUnidade(@Param('id') id: string) {
    return this.service.metricasUnidade(Number(id));
  }

  @Get('snapshots')
  snapshots() {
    return this.service.snapshotsHistoricos();
  }

  @Get('ranking')
  ranking() {
    return this.service.rankingGamificacao();
  }

  @Get('rh/resumo')
  resumoRh() {
    return this.service.resumoRh();
  }
}