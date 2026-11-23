// prisma/seed-org-lists.ts
// Listas iniciais de unidade e áreas por departamento (formulário de utilizador).
// Idempotente: não duplica nem sobrescreve unidade já definida num departamento.
// Corre com: npx ts-node prisma/seed-org-lists.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const AREAS: Record<string, string[]> = {
  Engenharia: ['Desenvolvimento', 'Infraestrutura', 'Qualidade e Testes', 'Arquitectura'],
  'Recursos Humanos': ['Recrutamento e Selecção', 'Formação e Desenvolvimento', 'Processamento Salarial', 'Relações Laborais'],
  Comercial: ['Vendas', 'Gestão de Clientes', 'Pós-venda', 'Desenvolvimento de Negócio'],
  Operações: ['Planeamento Operacional', 'Controlo de Qualidade', 'Gestão de Processos'],
  'Finanças e Contabilidade': ['Contabilidade', 'Tesouraria', 'Controlo de Gestão', 'Fiscalidade'],
  Auditoria: ['Auditoria Interna', 'Controlo Interno', 'Gestão de Risco'],
  Jurídico: ['Contratos', 'Contencioso', 'Assessoria Jurídica'],
  'Tecnologias de Informação': ['Suporte Técnico', 'Redes e Segurança', 'Sistemas de Informação', 'Dados e Análise'],
  Marketing: ['Comunicação', 'Marketing Digital', 'Marca e Design'],
  Logística: ['Transportes', 'Armazém', 'Aprovisionamento'],
  Administrativo: ['Secretariado', 'Arquivo e Documentação', 'Serviços Gerais'],
  'Responsabilidade Social': ['Projectos Sociais', 'Voluntariado', 'Relações com a Comunidade'],
  Compliance: ['Conformidade Regulatória', 'Prevenção de Branqueamento', 'Protecção de Dados'],
  'Gestão de Stocks': ['Inventário', 'Reposição', 'Controlo de Armazém'],
  Produção: ['Linha de Produção', 'Manutenção', 'Segurança e Higiene'],
  'Academia Corporativa': ['Conteúdos e Cursos', 'Formadores', 'Certificação', 'Plataforma e Suporte'],
  'Departamento de Testes de Carga': ['Testes de Carga'],
};

const DEFAULT_UNIT = { name: 'Sede', code: 'UNI-001' };

async function main() {
  let unit = await prisma.unit.findFirst({ orderBy: { id: 'asc' } });
  if (!unit) unit = await prisma.unit.create({ data: DEFAULT_UNIT });

  const departments = await prisma.department.findMany({ select: { id: true, name: true, unitId: true } });
  for (const d of departments) {
    if (!d.unitId) await prisma.department.update({ where: { id: d.id }, data: { unitId: unit.id } });
    for (const name of AREAS[d.name] ?? ['Geral']) {
      await prisma.departmentArea.upsert({
        where: { departmentId_name: { departmentId: d.id, name } },
        update: {},
        create: { departmentId: d.id, name },
      });
    }
  }
  console.log(`Listas criadas para ${departments.length} departamentos (unidade "${unit.name}").`);
}

main().finally(() => prisma.$disconnect());
