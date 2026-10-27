// prisma/seed-help-articles.ts
//
// Artigos iniciais da categoria "Ajuda INNOVA" (base de conhecimento do produto).
// Idempotente: reconhece artigos já criados pelo título dentro da categoria e não duplica.
// Os artigos ficam PUBLICADOS e públicos; o autor é o primeiro administrador activo.
//
//   npm run seed:help
//
// Manter o texto alinhado com os ecrãs reais (nomes de menus e botões). Para editar um
// artigo depois de criado use o módulo Base de Conhecimento — este seed não sobrescreve.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never);

const CATEGORY = {
  name: 'Ajuda INNOVA',
  slug: 'ajuda-innova',
  description: 'Tutoriais para começar e resolver dúvidas comuns sem abrir um pedido de suporte.',
  icon: 'life-buoy',
  color: '#0F1F3D',
};

interface HelpArticle {
  title: string;
  summary: string;
  tags: string[];
  html: string;
}

const ARTICLES: HelpArticle[] = [
  {
    title: 'Primeiros passos na plataforma',
    summary: 'O que fazer nos primeiros minutos para começar a aprender e a usar a plataforma.',
    tags: ['começar', 'primeiros passos', 'painel'],
    html: `<p>Ao entrar, o <strong>Painel</strong> mostra o seu resumo e, enquanto estiver a começar, um cartão <strong>Primeiros passos</strong> com o que falta fazer. O cartão fecha sozinho quando termina e pode dispensá-lo a qualquer momento.</p>
<ol>
<li>Abra <strong>Cursos</strong> e escolha um curso do catálogo.</li>
<li>Inscreva-se e comece a primeira lição. Bastam alguns minutos.</li>
<li>Acompanhe o progresso em <strong>Cursos → Meus cursos</strong>.</li>
</ol>
<p>No telemóvel, o menu abre pelo botão no canto superior esquerdo. Para qualquer dúvida, use <strong>Ajuda e Suporte</strong> no menu.</p>`,
  },
  {
    title: 'Recuperar o acesso quando esqueci a senha',
    summary: 'Como redefinir a senha e o que fazer se o e-mail não chegar.',
    tags: ['senha', 'palavra-passe', 'acesso', 'login'],
    html: `<ol>
<li>No ecrã de início de sessão escolha <strong>Esqueci a senha</strong>.</li>
<li>Indique o e-mail da sua conta e siga o link que receber.</li>
<li>Defina a nova senha e inicie sessão.</li>
</ol>
<p><strong>O e-mail não chegou?</strong> Aguarde 10 minutos e veja a pasta de spam. Se continuar sem chegar, escreva para o e-mail de suporte indicado em <em>Ajuda e Suporte</em>, ou peça ao responsável de RH da sua empresa para confirmar que o seu e-mail está correcto na ficha de utilizador.</p>
<p>Por segurança, nunca partilhe a sua senha, nem com o suporte: nunca lhe pediremos.</p>`,
  },
  {
    title: 'Inscrever-se num curso e acompanhar o progresso',
    summary: 'Como encontrar cursos, inscrever-se e ver o que já concluiu.',
    tags: ['cursos', 'inscrição', 'progresso'],
    html: `<p>Em <strong>Cursos</strong> encontra o catálogo. Abra o curso que lhe interessa e use o botão de inscrição.</p>
<ul>
<li><strong>Meus cursos</strong> lista as suas inscrições e o progresso de cada uma.</li>
<li>Os cursos <strong>obrigatórios</strong> são atribuídos pela sua empresa e já aparecem em Meus cursos, com prazo.</li>
<li>Para continuar de onde ficou, abra o curso: a plataforma leva-o à próxima lição por concluir.</li>
</ul>
<p>Não vê um curso que um colega vê? A visibilidade depende do seu departamento e perfil; fale com o responsável de RH.</p>`,
  },
  {
    title: 'Certificado: quando é emitido e o que fazer se não aparece',
    summary: 'Condições de emissão do certificado e como verificar o que falta.',
    tags: ['certificado', 'conclusão', 'nota mínima'],
    html: `<p>O certificado é emitido automaticamente quando:</p>
<ol>
<li>todas as lições do curso estão concluídas; e</li>
<li>a nota mínima do curso (se existir) foi atingida.</li>
</ol>
<p>Confirme o progresso em <strong>Cursos → Meus cursos</strong>. Se estiver a 100 % e o certificado não aparecer passados alguns minutos, abra um pedido em <strong>Ajuda e Suporte → Os meus pedidos</strong>, na categoria <em>Algo não funciona</em>, indicando o nome do curso.</p>
<p>Cada certificado tem um código de verificação: quem receber o seu certificado pode confirmar a autenticidade na página pública de verificação.</p>`,
  },
  {
    title: 'Pedir férias ou uma licença',
    summary: 'Passo a passo para submeter um pedido e acompanhar a aprovação.',
    tags: ['férias', 'licença', 'ausência', 'aprovação'],
    html: `<ol>
<li>Abra <strong>Férias e Licenças</strong> no menu.</li>
<li>Escolha <strong>Novo pedido de férias</strong> (ou o tipo de licença pretendido) e indique as datas.</li>
<li>Envie. O seu gestor recebe o pedido para aprovação e você é notificado da decisão.</li>
</ol>
<p>O número de dias é calculado a partir das datas; confirme o saldo antes de enviar. Para cancelar ou alterar um pedido já enviado, fale com o seu gestor ou com RH.</p>`,
  },
  {
    title: 'Como abrir um pedido de suporte e quanto tempo demora a resposta',
    summary: 'Escolher a prioridade certa e o que escrever para obter ajuda mais depressa.',
    tags: ['suporte', 'pedido', 'prazo', 'prioridade'],
    html: `<p>Antes de abrir um pedido, veja as <strong>Perguntas frequentes</strong> e a <strong>página de estado</strong>: se houver um incidente em curso, já estamos a tratar dele.</p>
<p>Em <strong>Ajuda e Suporte → Os meus pedidos → Novo pedido</strong>:</p>
<ul>
<li>escreva um assunto claro e, se aparecerem artigos sugeridos, veja se resolvem o assunto;</li>
<li>escolha a prioridade: <em>Crítica</em> só quando não consegue trabalhar;</li>
<li>descreva o que estava a fazer, o que esperava e o que viu (copie a mensagem de erro, se houver).</li>
</ul>
<p>Os tempos de primeira resposta, em horas úteis (segunda a sexta, 08:00–18:00, hora de Luanda), estão na página <em>Ajuda e Suporte</em> e em cada pedido. A resposta chega ao próprio pedido; pode responder lá para continuar a conversa.</p>`,
  },
];

function readingMinutes(html: string): number {
  const words = html
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

async function main() {
  const author = await prisma.user.findFirst({
    where: { active: true, role: { name: 'ADMIN' } },
    orderBy: { id: 'asc' },
    select: { id: true, fullName: true },
  });
  if (!author) {
    console.error('Sem administrador activo para ser autor dos artigos. Crie um e volte a correr.');
    process.exit(1);
  }

  const category = await prisma.knowledgeCategory.upsert({
    where: { slug: CATEGORY.slug },
    update: {},
    create: CATEGORY,
  });

  let created = 0;
  for (const a of ARTICLES) {
    const exists = await prisma.knowledgeArticle.findFirst({
      where: { categoryId: category.id, title: a.title },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.knowledgeArticle.create({
      data: {
        title: a.title,
        summary: a.summary,
        content: a.html,
        authorId: author.id,
        categoryId: category.id,
        status: 'PUBLISHED',
        accessLevel: 'PUBLIC',
        readingMinutes: readingMinutes(a.html),
        publishedAt: new Date(),
        tags: { create: a.tags.map(name => ({ name })) },
      },
    });
    created++;
  }
  console.log(
    `Ajuda INNOVA: ${created} artigo(s) criado(s), ${ARTICLES.length - created} já existiam.`,
  );
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
