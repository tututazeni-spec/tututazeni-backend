// prisma/seed-org-lists.ts
// Listas iniciais (fictícias) de unidades e áreas por departamento, usadas no
// formulário de utilizador. Cada departamento tem as suas. Idempotente; os
// nomes são editáveis depois no próprio formulário ("Editar listas").
// Corre com: npx ts-node prisma/seed-org-lists.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface Lists {
  units: string[];
  areas: string[];
}

const LISTS: Record<string, Lists> = {
  Engenharia: {
    units: ['Centro de Engenharia Talatona', 'Laboratório de Inovação Viana', 'Núcleo de Projectos Benguela'],
    areas: ['Desenvolvimento de Software', 'Infraestrutura', 'Qualidade e Testes', 'Arquitectura de Soluções', 'Investigação e Inovação'],
  },
  'Recursos Humanos': {
    units: ['Gabinete de Pessoas Maianga', 'Centro de Talento Kilamba', 'Núcleo de RH Lubango'],
    areas: ['Recrutamento e Selecção', 'Formação e Desenvolvimento', 'Processamento Salarial', 'Relações Laborais', 'Saúde e Bem-estar'],
  },
  Comercial: {
    units: ['Loja Central Ingombota', 'Delegação Comercial Huambo', 'Balcão Empresarial Cabinda'],
    areas: ['Vendas Directas', 'Gestão de Grandes Clientes', 'Pós-venda', 'Desenvolvimento de Negócio', 'Televendas'],
  },
  Operações: {
    units: ['Centro Operacional Cazenga', 'Base Operacional Lobito', 'Posto de Controlo Malanje'],
    areas: ['Planeamento Operacional', 'Controlo de Qualidade', 'Gestão de Processos', 'Melhoria Contínua', 'Apoio ao Terreno'],
  },
  'Finanças e Contabilidade': {
    units: ['Direcção Financeira Alvalade', 'Centro de Serviços Partilhados Belas', 'Tesouraria Regional Namibe'],
    areas: ['Contabilidade Geral', 'Tesouraria', 'Controlo de Gestão', 'Fiscalidade', 'Contas a Pagar e a Receber'],
  },
  Auditoria: {
    units: ['Gabinete de Auditoria Miramar', 'Núcleo de Controlo Interno Sambizanga', 'Equipa de Inspecção Uíge'],
    areas: ['Auditoria Interna', 'Controlo Interno', 'Gestão de Risco', 'Auditoria de Sistemas', 'Seguimento de Recomendações'],
  },
  Jurídico: {
    units: ['Gabinete Jurídico Maculusso', 'Assessoria Legal Rangel', 'Núcleo de Contencioso Huíla'],
    areas: ['Contratos', 'Contencioso', 'Assessoria Jurídica', 'Propriedade Intelectual', 'Direito Laboral'],
  },
  'Tecnologias de Informação': {
    units: ['Centro de Dados Cacuaco', 'Help Desk Patriota', 'Núcleo de Sistemas Soyo'],
    areas: ['Suporte Técnico', 'Redes e Segurança', 'Sistemas de Informação', 'Dados e Análise', 'Gestão de Infraestrutura Cloud'],
  },
  Marketing: {
    units: ['Estúdio Criativo Mutamba', 'Agência Interna Morro Bento', 'Núcleo Digital Cuito'],
    areas: ['Comunicação Institucional', 'Marketing Digital', 'Marca e Design', 'Eventos e Patrocínios', 'Estudos de Mercado'],
  },
  Logística: {
    units: ['Plataforma Logística Viana', 'Terminal de Carga Porto de Luanda', 'Centro de Distribuição Catumbela'],
    areas: ['Transportes', 'Armazém', 'Aprovisionamento', 'Distribuição', 'Gestão de Frota'],
  },
  Administrativo: {
    units: ['Secretaria Geral Kinaxixi', 'Arquivo Central Cassenda', 'Serviços Gerais Zango'],
    areas: ['Secretariado', 'Arquivo e Documentação', 'Serviços Gerais', 'Gestão de Instalações', 'Expediente'],
  },
  'Responsabilidade Social': {
    units: ['Fundação Comunitária Cazenga', 'Centro Social Sambizanga', 'Projecto Rural Bié'],
    areas: ['Projectos Sociais', 'Voluntariado', 'Relações com a Comunidade', 'Educação e Juventude', 'Apoio Humanitário'],
  },
  Compliance: {
    units: ['Gabinete de Conformidade Maianga', 'Núcleo Regulatório Ingombota', 'Equipa PBC Talatona'],
    areas: ['Conformidade Regulatória', 'Prevenção de Branqueamento', 'Protecção de Dados', 'Ética e Conduta', 'Políticas Internas'],
  },
  'Gestão de Stocks': {
    units: ['Armazém Geral Cacuaco', 'Depósito Regional Lobito', 'Centro de Reposição Viana'],
    areas: ['Inventário', 'Reposição', 'Controlo de Armazém', 'Previsão de Procura', 'Gestão de Perdas'],
  },
  Produção: {
    units: ['Fábrica Principal Catete', 'Linha de Montagem Benfica', 'Oficina de Manutenção Dondo'],
    areas: ['Linha de Produção', 'Manutenção Industrial', 'Segurança e Higiene', 'Controlo de Processos', 'Planeamento de Produção'],
  },
  'Academia Corporativa': {
    units: ['Campus de Formação Camama', 'Centro de E-learning Luanda Sul', 'Sala de Formação Kilamba'],
    areas: ['Conteúdos e Cursos', 'Formadores', 'Certificação', 'Plataforma e Suporte', 'Avaliação da Aprendizagem'],
  },
  'Departamento de Testes de Carga': {
    units: ['Ambiente de Testes A', 'Ambiente de Testes B', 'Ambiente de Testes C'],
    areas: ['Testes de Carga', 'Testes de Stress', 'Análise de Resultados', 'Automação', 'Monitorização'],
  },
};

async function main() {
  const sede = await prisma.unit.findFirst({ where: { name: 'Sede', code: 'UNI-001' } });
  let seq = (await prisma.unit.count()) + 1;
  const nextCode = async (): Promise<string> => {
    for (;;) {
      const code = `UNI-${String(seq++).padStart(3, '0')}`;
      if (!(await prisma.unit.findFirst({ where: { code }, select: { id: true } }))) return code;
    }
  };
  const unitByName = async (name: string): Promise<{ id: number }> =>
    (await prisma.unit.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })) ??
    prisma.unit.create({ data: { name, code: await nextCode() } });

  const departments = await prisma.department.findMany({ select: { id: true, name: true, unitId: true } });
  for (const d of departments) {
    const lists = LISTS[d.name] ?? { units: [`Unidade ${d.name}`], areas: ['Geral'] };
    const units = [];
    for (const name of lists.units) units.push(await unitByName(name));
    for (const u of units) {
      await prisma.departmentUnit.upsert({
        where: { departmentId_unitId: { departmentId: d.id, unitId: u.id } },
        update: {},
        create: { departmentId: d.id, unitId: u.id },
      });
    }
    // A unidade "Sede" genérica do seed anterior dá lugar à 1.ª unidade própria.
    if (!d.unitId || d.unitId === sede?.id) {
      await prisma.department.update({ where: { id: d.id }, data: { unitId: units[0].id } });
    }
    for (const name of lists.areas) {
      await prisma.departmentArea.upsert({
        where: { departmentId_name: { departmentId: d.id, name } },
        update: {},
        create: { departmentId: d.id, name },
      });
    }
  }
  if (sede) await prisma.unit.delete({ where: { id: sede.id } }).catch((): undefined => undefined);
  console.log(`Listas criadas para ${departments.length} departamentos.`);
}

main().finally(() => prisma.$disconnect());
