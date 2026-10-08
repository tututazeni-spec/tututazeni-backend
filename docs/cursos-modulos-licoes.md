# Módulo Cursos — Estrutura de Módulos e Lições

## 1. Ao criar um novo Curso — Dentro do Curso → Módulos

Depois de criar o curso, aparece a árvore de conteúdo:

```
Curso
Gestão de Liderança
│
├── Módulo 1 — Fundamentos da Liderança
│   ├── Lição 1 — O que é liderança?
│   ├── Lição 2 — Papel do líder
│   └── Lição 3 — Estilos de liderança
│
├── Módulo 2 — Comunicação
│   ├── Lição 1 — Comunicação eficaz
│   ├── Lição 2 — Escuta activa
│   └── Lição 3 — Feedback
│
└── Módulo 3 — Gestão de Equipas
    ├── Lição 1 — Motivação
    └── Lição 2 — Gestão de conflitos
```

## 2. Novo Módulo

Ao clicar: **Curso → Adicionar módulo**

**Informações do módulo:**

- Título
- Código
- Descrição
- Imagem
- Ordem
- Duração estimada
- Objectivos de aprendizagem
- Competências associadas

**Estado:**

- Rascunho
- Publicado
- Em pausa
- Arquivado

**Configurações:**

- Módulo obrigatório?
- Pode avançar sem concluir?
- Ordem obrigatória
- Requer nota mínima?
- Nota mínima
- Percentagem mínima de conclusão

**Conteúdo:**

- Nº de lições
- Carga horária
- Recursos
- Avaliação associada

## 3. Novo Módulo → Lições

Cada módulo pode ter várias lições. Ao clicar em **Adicionar lição**:

**Informações básicas:**

- Título da lição
- Código
- Descrição
- Ordem
- Duração estimada
- Objectivos de aprendizagem
- Estado

## 4. Tipo de conteúdo da lição

Vários tipos permitidos:

- **Vídeo:** Vídeo, URL, Duração, Legendas, Transcrição
- **Texto:** Conteúdo em rich text, Imagens, Links, Tabelas
- **PDF:** documento, Ficheiro, Descrição
- **Áudio:** Ficheiro, Duração
- **Apresentação:** PowerPoint, PDF, Slides
- **Conteúdo interactivo:** HTML, SCORM, xAPI
- **Aula ao vivo:** Data, Hora, Instrutor, Link da sessão, Duração

## 5. Configuração da lição

Cada lição deve poder definir:

- Obrigatória?
- Tempo mínimo de visualização
- Permitir avançar antes de concluir?
- Marcar automaticamente como concluída?
- Exigir conclusão do conteúdo?
- Exigir actividade?
- Exigir avaliação?
- Permitir download?
- Disponível a partir de determinada data
- Data de encerramento

## 6. Actividades dentro da lição

Uma lição não precisa ser apenas conteúdo. Pode conter:

Texto, Vídeo, Documento, Imagem, Áudio, Quiz, Pergunta aberta, Exercício, Tarefa, Inquérito, Discussão, Ficheiro para download, Link externo

**Exemplo:**

```
Módulo 2 — Comunicação
│
└── Lição 3 — Feedback
    ├── Vídeo — 12 min
    ├── Conteúdo teórico
    ├── Guia de Feedback.pdf
    ├── Actividade prática
    └── Quiz — 10 perguntas
```

## 7. Avaliação da lição

Avaliar a aprendizagem dentro da própria lição:

- Tipo de avaliação
- Perguntas
- Respostas
- Nº de tentativas
- Nota mínima
- Tempo limite
- Embaralhar perguntas
- Embaralhar respostas
- Mostrar respostas correctas
- Feedback automático

## 8. Recursos da lição

Separar conteúdo principal de recursos complementares.

**Recursos complementares:** PDFs, Artigos, Vídeos, Links, Livros, Ficheiros, Modelos/templates, Material de apoio

## 9. Pré-requisitos

Pode existir dependência entre conteúdos. Exemplos:

> Para iniciar Módulo 3, é necessário concluir o Módulo 2.

> Para iniciar Lição 5, é necessário concluir a Lição 4.

Isso permite criar uma progressão académica real.

## 10. Navegação do aluno

**No lado do aluno:**

```
Curso
Progresso: 65%

✓ Módulo 1 — Fundamentos
  ✓ Lição 1
  ✓ Lição 2
  ✓ Lição 3

✓ Módulo 2 — Comunicação
  ✓ Lição 1
  ✓ Lição 2
  → Lição 3

  Módulo 3 — Gestão de Equipas
```

**Ao abrir uma lição:**

```
← Voltar ao curso

Módulo 2
Lição 3 — Feedback

[ Conteúdo da lição ]
────────────────────
Recursos
  Guia de Feedback
  Vídeo complementar
────────────────────
Actividade
[ Iniciar actividade ]
────────────────────
← Lição anterior        Próxima lição →
```
