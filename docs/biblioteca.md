# Módulo Biblioteca

Estruturar o módulo Biblioteca como uma **Biblioteca Corporativa de Conhecimento e Documentação**, não apenas como uma biblioteca de conteúdos de aprendizagem. A ideia é separar claramente conteúdos de aprendizagem de documentação institucional, normativa e operacional.

## Abas principais

Visão Geral, Conteúdos, Documentos Corporativos, Normas & Políticas, Circulares, Leis & Regulamentos, Ordens de Serviço, Procedimentos & Manuais, Formulários & Modelos, Favoritos, Recentes, Pendentes de Leitura, Arquivo, Relatórios

## Ao clicar em "Novo Conteúdo"

**Tipo de conteúdo:** artigo, vídeo, áudio, apresentação, documento PDF, e-book, infográfico, guia, material de formação, FAQ, outro

**Campos:**

- Título
- Descrição
- Categoria
- Subcategoria
- Área responsável
- Autor
- Palavras-chave
- Idioma
- Público-alvo
- Unidade
- Departamento
- Cargo/perfil de acesso
- Data de publicação
- Data de validade
- Versão
- Estado
- Ficheiro ou URL
- Miniatura
- Conteúdo interno/externo
- Obrigatório/opcional
- Permitir download
- Permitir partilha
- Requer confirmação de leitura
- Requer aprovação
- Responsável pela aprovação

## Documentos Corporativos

Normas internas, políticas internas, regulamentos internos, procedimentos, manuais, circulares, ordens de serviço, instruções de trabalho, comunicados oficiais, códigos, diretivas, legislação aplicável, formulários, modelos, documentos administrativos, documentos de compliance, documentos de segurança, documentos de RH, outros documentos institucionais

### Ao clicar em "Novo Documento Corporativo"

- Tipo de documento
- Título
- Código do documento
- Número
- Descrição
- Área responsável
- Departamento responsável
- Proprietário do documento
- Elaborador
- Aprovador
- Versão
- Estado
- Data de emissão
- Data de entrada em vigor
- Data de revisão
- Data de validade
- Periodicidade de revisão
- Documento substituído
- Documento relacionado
- Unidade aplicável
- Público-alvo
- Nível de confidencialidade
- Permissões de acesso
- Ficheiro
- Anexos
- Palavras-chave
- Observações
- Requer confirmação de leitura
- Requer aceite
- Histórico de versões

### Estados do documento

Rascunho, Em revisão, Pendente de aprovação, Aprovado, Publicado, Suspenso, Expirado, Substituído, Arquivado

## Controlo de versões

Cada documento deve manter:

- Versão
- Data da versão
- Motivo da alteração
- Autor da alteração
- Aprovador
- Data de aprovação
- Versão anterior
- Ficheiro da versão
- Histórico de alterações

**Exemplo:**

```
Regulamento Interno
  v1.0 — 2025
  v1.1 — 2026
  v2.0 — 2026
```

O colaborador deve conseguir consultar a versão atualmente válida, enquanto o histórico fica preservado.

## Confirmação de leitura

Para documentos importantes, como Normas, Circulares, Ordens de Serviço e Regulamentos, ativar:

- Exigir leitura
- Exigir confirmação de leitura
- Exigir aceite/ciência
- Prazo para leitura
- Data limite
- Colaboradores obrigados
- Percentagem de conclusão
- Colaboradores que ainda não leram

**O sistema regista:**

- Colaborador
- Documento
- Versão
- Data de disponibilização
- Data de leitura
- Data de confirmação
- Estado
- IP/dispositivo
- Versão confirmada

## Pesquisa da Biblioteca

Pesquisa global com filtros:

- Pesquisar por título ou conteúdo
- Tipo de documento
- Categoria
- Área responsável
- Departamento
- Unidade
- Autor
- Estado
- Versão
- Data
- Validade
- Palavra-chave
- Documentos obrigatórios
- Documentos não lidos

**Filtros rápidos:** Todos, Não lidos, Obrigatórios, Recentes, Favoritos, Em vigor, Expirados

## Estrutura de separação

```
Biblioteca
├── Conteúdos
├── Documentos Corporativos
│   ├── Normas
│   ├── Políticas
│   ├── Circulares
│   ├── Ordens de Serviço
│   ├── Regulamentos
│   ├── Procedimentos
│   ├── Manuais
│   ├── Instruções
│   ├── Legislação
│   ├── Formulários
│   └── Modelos
├── Favoritos
├── Recentes
├── Pendentes de Leitura
└── Arquivo
```
