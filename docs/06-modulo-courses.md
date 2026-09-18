# Módulo Courses — Cursos → Módulos e Lições

## 1. Ao criar um novo Curso

### Informações gerais

- Título do curso
- Código do curso
- Descrição curta
- Descrição completa
- Imagem/capa
- Categoria
- Área de conhecimento
- Nível: Iniciante / Intermédio / Avançado
- Idioma
- Estado: Rascunho / Publicado / Em pausa / Arquivado
- Visibilidade: Público / Privado / Apenas colaboradores / Apenas grupos seleccionados

### Configuração académica

Carga horária total, duração estimada, data de início, data de término, formação obrigatória? (Sim/Não), requer aprovação para inscrição? (Sim/Não), nota mínima para aprovação, percentagem mínima de conclusão, certificado emitido? (Sim/Não), critérios para emissão do certificado.

### Organização

Instrutor principal, outros instrutores, departamento responsável, unidade, competências desenvolvidas, pré-requisitos, público-alvo, tags.

---

## 2. Dentro do Curso → Módulos

Exemplo (curso "Gestão de Liderança"):

```
Curso
│
├── Módulo 1 — Fundamentos da Liderança
│    ├── Lição 1 — O que é liderança?
│    ├── Lição 2 — Papel do líder
│    └── Lição 3 — Estilos de liderança
│
├── Módulo 2 — Comunicação
│    ├── Lição 1 — Comunicação eficaz
│    ├── Lição 2 — Escuta activa
│    └── Lição 3 — Feedback
│
└── Módulo 3 — Gestão de Equipas
     ├── Lição 1 — Motivação
     └── Lição 2 — Gestão de conflitos
```

## 3. Novo Módulo

**Informações do módulo:** título, código, descrição, imagem, ordem, duração estimada, objectivos de aprendizagem, competências associadas, estado (Rascunho / Publicado / Em pausa / Arquivado).

**Configurações:** módulo obrigatório?, pode avançar sem concluir?, ordem obrigatória?, requer nota mínima?, nota mínima, percentagem mínima de conclusão.

**Conteúdo:** nº de lições, carga horária, recursos, avaliação associada.

## 4. Módulo → Lições

**Informações básicas:** título da lição, código, descrição, ordem, duração estimada, objectivos de aprendizagem, estado.

## 5. Tipo de conteúdo da lição

- **Vídeo:** vídeo, URL, duração, legendas, transcrição
- **Texto:** conteúdo em rich text, imagens, links, tabelas
- **PDF / documento:** ficheiro, descrição
- **Áudio:** ficheiro, duração
- **Apresentação:** PowerPoint/PDF, slides
- **Conteúdo interactivo:** HTML, SCORM, xAPI (se a INNOVA vier a suportar)
- **Aula ao vivo:** data, hora, instrutor, link da sessão, duração

## 6. Configuração da lição

Obrigatória?, tempo mínimo de visualização, permitir avançar antes de concluir?, marcar automaticamente como concluída?, exigir conclusão do conteúdo?, exigir actividade?, exigir avaliação?, permitir download?, disponível a partir de determinada data, data de encerramento.

## 7. Actividades dentro da lição

Texto, vídeo, documento, imagem, áudio, quiz, pergunta aberta, exercício, tarefa, inquérito, discussão, ficheiro para download, link externo.

Exemplo:

```
Módulo 2 — Comunicação
└── Lição 3 — Feedback
     ├── Vídeo — 12 min
     ├── Conteúdo teórico
     ├── Guia de Feedback.pdf
     ├── Actividade prática
     └── Quiz — 10 perguntas
```

## 8. Avaliação da lição

Tipo de avaliação, perguntas, respostas, nº de tentativas, nota mínima, tempo limite, embaralhar perguntas, embaralhar respostas, mostrar respostas correctas, feedback automático.

## 9. Recursos da lição

Separar conteúdo principal de recursos complementares: PDFs, artigos, vídeos, links, livros, ficheiros, modelos/templates, material de apoio.

## 10. Pré-requisitos

Dependência entre conteúdos — por exemplo: para iniciar o Módulo 3 é necessário concluir o Módulo 2; para iniciar a Lição 5 é necessário concluir a Lição 4. Isso permite criar uma progressão académica real.

## 11. Navegação do aluno

```
Curso — Progresso: 65%

✓ Módulo 1 — Fundamentos
  ✓ Lição 1  ✓ Lição 2  ✓ Lição 3

✓ Módulo 2 — Comunicação
  ✓ Lição 1  ✓ Lição 2  → Lição 3

  Módulo 3 — Gestão de Equipas
```

Ao abrir uma lição: ← Voltar ao curso · [Conteúdo da lição] · Recursos · Actividade · ← Lição anterior / Próxima lição →

## 12. Estrutura final do módulo Cursos

Não criar módulos separados no menu principal para Cursos, Módulos e Lições. No menu apenas **Cursos**.

```
Cursos
├── Todos os cursos
├── Meus cursos
├── Rascunhos
├── Publicados
├── Categorias
└── Arquivados
```

Ao abrir um curso:

```
Curso
├── Visão geral
├── Conteúdo (Módulos → Lições)
├── Participantes
├── Avaliações
├── Certificados
├── Recursos
├── Instrutores
├── Estatísticas
└── Configurações
```

**Decisão a manter:** Curso é a entidade principal · Módulo é uma divisão estrutural do curso · Lição é a unidade de aprendizagem dentro do módulo.

Cursos → Curso → Módulos → Lições → Conteúdos/Actividades → Avaliação

Isto facilita integrar Cursos com Percursos de Aprendizagem, porque o percurso pode seleccionar cursos inteiros sem duplicar módulos e lições.

---

## Dashboard Admin → Cursos

Total de cursos, cursos publicados, em rascunho, em pausa, arquivados, total de módulos, total de lições, total de inscritos, inscrições pendentes, cursos mais populares, cursos com maior taxa de conclusão, cursos com menor taxa de conclusão, taxa média de conclusão, taxa média de aprovação, nota média dos cursos, horas totais de aprendizagem, certificados emitidos, cursos obrigatórios, cursos opcionais, cursos por categoria, por nível, por modalidade, por unidade, por departamento, por instrutor, cursos recentemente criados, recentemente actualizados, cursos com inscrições abertas, cursos próximos do término, cursos sem inscrições, sem conteúdo, sem instrutor, cursos com conteúdos pendentes, próximas formações/sessões, actividade recente, últimas inscrições, últimas conclusões, últimas avaliações, últimos certificados emitidos, evolução mensal de inscrições, evolução mensal de conclusões, evolução das horas de aprendizagem, desempenho dos cursos, competências mais desenvolvidas, cursos mais procurados, cursos com maior abandono, alertas e pendências, atalhos (criar curso, gerir cursos, gerir módulos e lições, gerir inscrições, gerir avaliações, gerir certificados, consultar relatórios).

---

# Curso — Página de detalhe (a partir do Catálogo)

## 1. Cabeçalho do curso

Capa/banner, categoria, nível, título, descrição curta, avaliação média, nº de participantes, carga horária, nº de módulos, nº de lições, instrutor, idioma, estado do curso.

Exemplo: *Liderança e Gestão de Equipas — 12h · 4 módulos · 18 lições · Intermédio*

## 2. Botão principal

O botão muda automaticamente conforme o estado do colaborador:

| Situação | Botão |
|---|---|
| Não inscrito | Inscrever-me |
| Curso exige aprovação | Solicitar inscrição |
| Já inscrito | Continuar curso |
| Concluído | Rever curso |
| Bloqueado | Curso indisponível |

## 3. Sobre o curso

Descrição completa, para quem se destina, objectivos, benefícios, pré-requisitos.

## 4. O que vai aprender

Objectivos de aprendizagem — ex.: aplicar técnicas de liderança, comunicar eficazmente com a equipa, dar feedback construtivo, gerir conflitos, delegar responsabilidades, tomar decisões de forma estruturada.

## 5. Conteúdo do curso

Mostrar a estrutura de módulos e lições com durações. Antes da inscrição pode mostrar o conteúdo mas bloquear a abertura das lições, dependendo das regras do curso.

## 6. Competências desenvolvidas

Ligar o curso directamente às entidades de Competências / Mapa de Competências. Permite responder a "Que cursos desenvolvem esta competência?" e "Que competências este colaborador desenvolveu através dos cursos?".

## 7. Instrutor(es)

Fotografia, nome, cargo, especialização, biografia curta, nº de cursos ministrados.

## 8. Informações adicionais

| Informação | Detalhe |
|---|---|
| Nível | Intermédio |
| Duração | 12 horas |
| Módulos | 4 |
| Lições | 18 |
| Idioma | Português |
| Modalidade | Online |
| Certificado | Sim |
| Avaliação final | Sim |
| Nota mínima | 70% |

## 9. Certificação

Certificado disponível: Sim/Não, requisitos para emissão, nota mínima, percentagem mínima de conclusão, necessidade de aprovação na avaliação final.

## 10. Avaliação

Nº de perguntas, duração, nota mínima, nº de tentativas, tipo de avaliação. Ex.: *20 perguntas · 30 minutos · aprovação ≥ 70% · 2 tentativas*. Não precisa de permitir iniciar a avaliação nesta página — pode ficar disponível após a conclusão dos módulos necessários.

## 11. Cursos relacionados

Relacionados por categoria, competências, nível, percurso de aprendizagem, departamento, cargo.

## 12. Percursos de aprendizagem

Mostrar "Este curso faz parte de: Percurso de Liderança → Ver percurso", para o colaborador perceber que o curso pode ser apenas uma etapa de uma formação maior.

## 13. Depois de "Inscrever-me"

Progresso: 0% concluído · Botão: **Começar curso**

## 14. Depois de começar o curso

Experiência de aprendizagem com progresso por módulo. O colaborador pode: continuar de onde parou, abrir módulos, abrir lições, ver vídeos, ler conteúdos, fazer actividades, fazer quizzes, fazer avaliações, descarregar recursos, ver o próprio progresso, avançar para a próxima lição.

## 15. Menu interno do curso

Visão geral | Conteúdo | Recursos | Avaliações | Progresso

## 16. Após concluir o curso

Estado: ✅ Curso concluído. Mostrar data de conclusão, percentagem de conclusão, nota final, tempo de aprendizagem, competências desenvolvidas, certificado. Botões: Ver certificado · Descarregar certificado · Rever curso.

---

## Fluxo completo recomendado

```
CATÁLOGO → Clica no curso → PÁGINA DO CURSO
   (Sobre · Objectivos · Competências · Conteúdo · Instrutor ·
    Informações · Certificação · Cursos relacionados)
   ↓
INSCRIÇÃO → CURSO INSCRITO → COMEÇAR CURSO
   ↓
MÓDULO → LIÇÃO → CONTEÚDO → ACTIVIDADE/QUIZ → PRÓXIMA LIÇÃO
   ↓
AVALIAÇÃO FINAL → CONCLUSÃO → CERTIFICADO
```

O catálogo deve ser relativamente limpo e orientado à descoberta:

Catálogo → Curso → Inscrição → Aprendizagem → Avaliação → Certificação

E o mesmo curso continua a ser administrado pelo RH/Administrador através de:
Curso → Módulos → Lições → Conteúdos → Actividades → Avaliações.
