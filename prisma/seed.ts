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
