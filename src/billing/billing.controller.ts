import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { CurrentUser, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { BillingInvoicesService } from './billing-invoices.service';
import { BillingMetricsService } from './billing-metrics.service';
import { BillingPlansService } from './billing-plans.service';
import { BillingSubscriptionsService } from './billing-subscriptions.service';
import {
  AcquisitionSpendDto,
  CancelSubscriptionDto,
  FiscalUpdateDto,
  PaymentFailedDto,
  PlanCodeDto,
  RegisterPaymentDto,
  SubscribeDto,
  UpsertPlanDto,
  VoidInvoiceDto,
} from './billing.dto';

@ApiTags('Billing')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('billing')
export class BillingController {
  constructor(
    private readonly plans: BillingPlansService,
    private readonly subs: BillingSubscriptionsService,
    private readonly invoices: BillingInvoicesService,
    private readonly metrics: BillingMetricsService,
  ) {}

  // ── Planos ──
  @Get('plans')
  @ApiOperation({ summary: 'Catálogo de planos e limites' })
  listPlans() {
    return this.plans.list(true);
  }

  @Put('plans/:code')
  @ApiOperation({ summary: 'Criar/actualizar um plano (preços e limites)' })
  upsertPlan(@Param('code') code: string, @Body() dto: UpsertPlanDto) {
    return this.plans.upsert(code.toUpperCase(), dto);
  }

  // ── Subscrição ──
  @Get('subscription')
  @ApiOperation({ summary: 'Subscrição actual, limites e consumo' })
  current() {
    return this.subs.current();
  }

  @Post('subscription/trial')
  @ApiOperation({ summary: 'Iniciar período de teste (uma vez por cliente)' })
  startTrial(@Body() dto: PlanCodeDto, @CurrentUser() u: CurrentUserData) {
    return this.subs.startTrial(dto.planCode.toUpperCase(), u.id);
  }

  @Post('subscription/subscribe')
  @ApiOperation({ summary: 'Contratar um plano e emitir a fatura do 1.º período' })
  subscribe(@Body() dto: SubscribeDto, @CurrentUser() u: CurrentUserData) {
    return this.subs.subscribe(dto.planCode.toUpperCase(), dto.interval, u.id);
  }

  @Post('subscription/change-plan')
  @ApiOperation({ summary: 'Mudar de plano (limites imediatos; preço na próxima fatura)' })
  changePlan(@Body() dto: PlanCodeDto, @CurrentUser() u: CurrentUserData) {
    return this.subs.changePlan(dto.planCode.toUpperCase(), u.id);
  }

  @Post('subscription/cancel')
  @ApiOperation({ summary: 'Cancelar (por omissão no fim do período pago)' })
  cancel(@Body() dto: CancelSubscriptionDto, @CurrentUser() u: CurrentUserData) {
    return this.subs.cancel(dto.reason, dto.atPeriodEnd ?? true, u.id);
  }

  // ── Faturas ──
  @Get('invoices')
  @ApiOperation({ summary: 'Listar faturas' })
  listInvoices(@Query('status') status?: string, @Query('subscriptionId') subscriptionId?: string) {
    return this.invoices.list({ status, subscriptionId });
  }

  @Get('invoices/verify-chain')
  @ApiOperation({ summary: 'Verificar a cadeia de hash das faturas' })
  verifyChain() {
    return this.invoices.verifyChain();
  }

  @Get('invoices/:id')
  getInvoice(@Param('id') id: string) {
    return this.invoices.get(id);
  }

  @Post('invoices/:id/payments')
  @ApiOperation({ summary: 'Registar pagamento confirmado (transferência/referência)' })
  pay(@Param('id') id: string, @Body() dto: RegisterPaymentDto, @CurrentUser() u: CurrentUserData) {
    return this.invoices.registerPayment(id, dto, u.id);
  }

  @Post('invoices/:id/payment-failed')
  @ApiOperation({ summary: 'Registar cobrança falhada (entra em dunning)' })
  paymentFailed(
    @Param('id') id: string,
    @Body() dto: PaymentFailedDto,
    @CurrentUser() u: CurrentUserData,
  ) {
    return this.invoices.recordFailedPayment(id, dto, u.id);
  }

  @Post('invoices/:id/void')
  @ApiOperation({ summary: 'Anular fatura (só sem pagamento nem submissão fiscal)' })
  voidInvoice(
    @Param('id') id: string,
    @Body() dto: VoidInvoiceDto,
    @CurrentUser() u: CurrentUserData,
  ) {
    return this.invoices.voidInvoice(id, dto.reason, u.id);
  }

  @Patch('invoices/:id/fiscal')
  @ApiOperation({ summary: 'Registar submissão/certificação no software certificado AGT' })
  fiscal(@Param('id') id: string, @Body() dto: FiscalUpdateDto, @CurrentUser() u: CurrentUserData) {
    return this.invoices.setFiscal(id, dto, u.id);
  }

  // ── Métricas de negócio ──
  @Get('metrics/history')
  @ApiOperation({ summary: 'Série mensal de MRR, clientes e receita' })
  history(@Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number) {
    return this.metrics.history(months);
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'MRR, ARR, cobrança, churn, LTV, CAC e conversão (com indicador de fiabilidade)',
  })
  summary(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.metrics.summary(Math.min(Math.max(days, 1), 365));
  }

  @Get('acquisition-spend')
  listSpend() {
    return this.metrics.listSpend();
  }

  @Post('acquisition-spend')
  @ApiOperation({ summary: 'Registar gasto de aquisição mensal (base do CAC)' })
  addSpend(@Body() dto: AcquisitionSpendDto) {
    return this.metrics.addSpend(dto);
  }
}
