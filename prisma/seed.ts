import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function seedPayroll(prisma: PrismaClient) {
  const taxYear = new Date().getFullYear();

  // ⚠️ Tabela IRT / taxas provisórias — confirmar com AGT antes de produção.
  // Valores espelham PayrollEngineService.getDefaultAngolaConfig().
  const config = await prisma.countryConfig.upsert({
    where: { countryCode_taxYear: { countryCode: 'AO', taxYear } },
    update: {},
    create: {
      countryCode: 'AO',
      name: 'Angola',
      currency: 'AOA',
      locale: 'pt-AO',
      taxYear,
      minimumWage: 70000,
      defaultFoodAllowance: 25000,
      defaultTransportAllowance: 15000,
      socialSecurity: { employeeRate: 0.03, employerRate: 0.08, ceiling: null },
      healthInsuranceRate: 0.02,
      unionFeeRate: 0.01,
      guaranteeFundRate: 0.005,
      active: true,
    },
  });

  const brackets = [
    { min: 0, max: 70000, rate: 0, deduction: 0, order: 0 },
    { min: 70000, max: 100000, rate: 0.07, deduction: 0, order: 1 },
    { min: 100000, max: 150000, rate: 0.11, deduction: 4000, order: 2 },
    { min: 150000, max: 200000, rate: 0.14, deduction: 8500, order: 3 },
    { min: 200000, max: 300000, rate: 0.17, deduction: 14500, order: 4 },
    { min: 300000, max: 500000, rate: 0.21, deduction: 26500, order: 5 },
    { min: 500000, max: null, rate: 0.25, deduction: 46500, order: 6 },
  ];
  const existing = await prisma.irtBracket.count({ where: { configId: config.id } });
  if (existing === 0) {
    await prisma.irtBracket.createMany({
      data: brackets.map(b => ({ ...b, configId: config.id })),
    });
  }

  const components: Array<{
    code: string; name: string; type: 'EARNING' | 'DEDUCTION';
    calcType: 'FIXED' | 'PERCENT' | 'FORMULA' | 'TABLE';
    isTaxable: boolean; isMandatory: boolean; order: number;
  }> = [
    { code: 'BASE_SALARY', name: 'Salário Base', type: 'EARNING', calcType: 'FIXED', isTaxable: true, isMandatory: true, order: 0 },
    { code: 'ALLOWANCE_FOOD', name: 'Subsídio de Alimentação', type: 'EARNING', calcType: 'FIXED', isTaxable: false, isMandatory: false, order: 1 },
    { code: 'ALLOWANCE_TRANSPORT', name: 'Subsídio de Transporte', type: 'EARNING', calcType: 'FIXED', isTaxable: false, isMandatory: false, order: 2 },
    { code: 'OVERTIME', name: 'Horas Extras', type: 'EARNING', calcType: 'FORMULA', isTaxable: true, isMandatory: false, order: 3 },
    { code: 'BONUS', name: 'Bónus', type: 'EARNING', calcType: 'FIXED', isTaxable: true, isMandatory: false, order: 4 },
    { code: 'INSS_EMPLOYEE', name: 'INSS Colaborador', type: 'DEDUCTION', calcType: 'PERCENT', isTaxable: false, isMandatory: true, order: 5 },
    { code: 'IRT', name: 'IRT (Imposto Rendimento Trabalho)', type: 'DEDUCTION', calcType: 'TABLE', isTaxable: false, isMandatory: true, order: 6 },
    { code: 'HEALTH_INSURANCE', name: 'Seguro de Saúde', type: 'DEDUCTION', calcType: 'PERCENT', isTaxable: false, isMandatory: false, order: 7 },
    { code: 'UNION_FEE', name: 'Quota Sindical', type: 'DEDUCTION', calcType: 'PERCENT', isTaxable: false, isMandatory: false, order: 8 },
    { code: 'ADVANCE', name: 'Adiantamento', type: 'DEDUCTION', calcType: 'FIXED', isTaxable: false, isMandatory: false, order: 9 },
    { code: 'ABSENCE_DEDUCTION', name: 'Desconto por Faltas', type: 'DEDUCTION', calcType: 'FIXED', isTaxable: false, isMandatory: false, order: 10 },
  ];
  for (const c of components) {
    await prisma.salaryComponent.upsert({
      where: { code: c.code },
      update: {},
      create: { ...c, countryCode: 'AO' },
    });
  }

  console.log('✅ Payroll seed: CountryConfig AO', taxYear, '+ 7 escalões IRT + 11 componentes');
}

// Estrutura organizacional mínima: 4 departamentos + 8 cargos (um por nível).
// Sem isto a tabela Position fica vazia e GET /career/positions devolve [] — o
// Simulador de Carreira (career/DashboardView) esconde o seletor e mostra
// "Sem cargos definidos", tornando a simulação impossível. Mesmo padrão do bug
// dos LeaveTypeConfig (sem seed → wizard preso no passo 1).
async function seedOrgStructure(prisma: PrismaClient) {
  const departments = [
    { code: 'ENG', name: 'Engenharia' },
    { code: 'RH', name: 'Recursos Humanos' },
    { code: 'COM', name: 'Comercial' },
    { code: 'OPS', name: 'Operações' },
  ];
  const deptMap: Record<string, { id: number }> = {};
  for (const d of departments) {
    const dept = await prisma.department.upsert({
      where: { code: d.code },
      update: {},
      create: d,
    });
    deptMap[d.code] = dept;
  }
  console.log('✅ Departamentos criados:', departments.map(d => d.code).join(', '));

  // Um cargo por PositionLevel. Salários em Kz (Angola) — bandas indicativas.
  const positions = [
    { code: 'P-INT', name: 'Estagiário', level: 'INTERN', dept: 'ENG', salaryMin: 150000, salaryMax: 250000 },
    { code: 'P-JR', name: 'Técnico Júnior', level: 'JUNIOR', dept: 'OPS', salaryMin: 300000, salaryMax: 450000 },
    { code: 'P-MID', name: 'Analista', level: 'MID', dept: 'COM', salaryMin: 500000, salaryMax: 750000 },
    { code: 'P-SR', name: 'Engenheiro Sénior', level: 'SENIOR', dept: 'ENG', salaryMin: 800000, salaryMax: 1200000 },
    { code: 'P-LEAD', name: 'Team Lead', level: 'LEAD', dept: 'ENG', salaryMin: 1300000, salaryMax: 1800000 },
    { code: 'P-MGR', name: 'Gestor de Departamento', level: 'MANAGER', dept: 'OPS', salaryMin: 1900000, salaryMax: 2600000 },
    { code: 'P-DIR', name: 'Director', level: 'DIRECTOR', dept: 'RH', salaryMin: 2800000, salaryMax: 4000000 },
    { code: 'P-EXEC', name: 'Administrador Executivo', level: 'EXECUTIVE', dept: 'COM', salaryMin: 4500000, salaryMax: 7000000 },
  ] as const;

  // Position não tem campo @unique além do id — upsert por nome não é possível.
  // Cria só o que ainda não existir (idempotência por nome).
  for (const p of positions) {
    const existing = await prisma.position.findFirst({ where: { name: p.name } });
    if (existing) continue;
    await prisma.position.create({
      data: {
        code: p.code,
        name: p.name,
        level: p.level,
        departmentId: deptMap[p.dept].id,
        salaryMin: p.salaryMin,
        salaryMax: p.salaryMax,
        headcountPlanned: 1,
      },
    });
  }
  console.log('✅ Cargos criados:', positions.map(p => p.name).join(', '));
}

async function main() {
  console.log('🌱 A iniciar seed...');

  // 1. Criar roles necessárias
  // Todos os papéis referenciados em @Roles(...) têm de existir aqui, senão os
  // endpoints protegidos por eles ficam inacessíveis (ninguém os tem na BD).
  const roleNames = [
    'ADMIN',
    'RH',
    'GESTOR',
    'COLABORADOR',
    'LIDER',
    'DIRECTOR',
    'AUDITOR',
    'INSTRUCTOR',
  ];
  const roleMap: Record<string, any> = {};

  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, code: name },
    });
    roleMap[name] = role;
  }
  console.log('✅ Roles criadas:', roleNames.join(', '));

  // 2. Criar / actualizar utilizador admin com role ADMIN
  const adminPassword = await bcrypt.hash('Admin@1234', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@innova.com' },
    update: { roleId: roleMap['ADMIN'].id },
    create: {
      fullName: 'Administrador',
      email: 'admin@innova.com',
      password: adminPassword,
      active: true,
      roleId: roleMap['ADMIN'].id,
      accountStatus: 'PENDING', // A2-8: força troca de senha no 1º login
    },
  });
  console.log('✅ Admin criado/actualizado:', admin.email, '→ role ADMIN');

  // 3. Criar utilizador employee para testes Bruno
  const employeePassword = await bcrypt.hash('Employee@1234', 10);
  const employee = await prisma.user.upsert({
    where: { email: 'test.employee@innova-test.com' },
    update: { roleId: roleMap['COLABORADOR'].id },
    create: {
      fullName: 'Test Employee',
      email: 'test.employee@innova-test.com',
      password: employeePassword,
      active: true,
      roleId: roleMap['COLABORADOR'].id,
      accountStatus: 'PENDING', // A2-8: força troca de senha no 1º login
    },
  });
  console.log('✅ Employee criado/actualizado:', employee.email, '→ role COLABORADOR');

  // 4. Criar tipos de licença (LeaveTypeConfig) — catálogo de configuração do
  // módulo de Gestão de Ausências. Sem isto GET /leave/types devolve [] e o
  // wizard "Solicitar Licença" (NewLeaveModal) fica preso no Passo 1: não há
  // nada para seleccionar e o botão "Continuar" nunca deixa de estar
  // desactivado (disabled={step === 1 && !form.leaveTypeCode}).
  const leaveTypes = [
    {
      code: 'VACATION',
      name: 'Férias',
      description: 'Férias anuais remuneradas',
      category: 'STATUTORY',
      color: '#3B82F6',
      icon: 'Umbrella',
      isPaid: true,
      annualLimit: 22,
      allowCarryOver: true,
      carryOverLimit: 5,
      minNoticeDays: 15,
    },
    {
      code: 'SICK',
      name: 'Baixa Médica',
      description: 'Ausência por doença, com justificação médica',
      category: 'MEDICAL',
      color: '#EF4444',
      icon: 'Stethoscope',
      isPaid: true,
      minNoticeDays: 0,
    },
    {
      code: 'MATERNITY',
      name: 'Licença de Maternidade',
      description: 'Licença parental inicial da mãe',
      category: 'FAMILY',
      color: '#EC4899',
      icon: 'Baby',
      isPaid: true,
      annualLimit: 120,
      minNoticeDays: 0,
    },
    {
      code: 'PATERNITY',
      name: 'Licença de Paternidade',
      description: 'Licença parental inicial do pai',
      category: 'FAMILY',
      color: '#8B5CF6',
      icon: 'Baby',
      isPaid: true,
      annualLimit: 28,
      minNoticeDays: 0,
    },
    {
      code: 'BEREAVEMENT',
      name: 'Luto',
      description: 'Falecimento de familiar',
      category: 'FAMILY',
      color: '#6B7280',
      icon: 'HeartCrack',
      isPaid: true,
      annualLimit: 5,
      minNoticeDays: 0,
    },
    {
      code: 'TRAINING',
      name: 'Formação',
      description: 'Ausência para formação/certificação profissional',
      category: 'TRAINING',
      color: '#F59E0B',
      icon: 'GraduationCap',
      isPaid: true,
      minNoticeDays: 5,
    },
    {
      code: 'UNPAID',
      name: 'Licença sem Vencimento',
      description: 'Ausência não remunerada, sujeita a aprovação',
      category: 'UNPAID',
      color: '#94A3B8',
      icon: 'CalendarOff',
      isPaid: false,
      minNoticeDays: 15,
    },
    {
      code: 'OTHER',
      name: 'Outra',
      description: 'Outro tipo de ausência não coberto acima',
      category: 'OTHER',
      color: '#64748B',
      icon: 'MoreHorizontal',
      isPaid: false,
      minNoticeDays: 0,
    },
  ];

  for (const lt of leaveTypes) {
    await prisma.leaveTypeConfig.upsert({
      where: { code: lt.code },
      update: {},
      create: lt,
    });
  }
  console.log('✅ Tipos de licença criados:', leaveTypes.map(l => l.code).join(', '));

  await seedOrgStructure(prisma);

  await seedPayroll(prisma);

  console.log('🎉 Seed concluído!');
}

main()
  .catch(e => {
    console.error('❌ Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
