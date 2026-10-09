# Prompt para Claude Code

## Redesign do card "Turma da Manhã" — Opção 2

---

## Objetivo

Redesenhar o card de turma da plataforma corporativa de RH e Academia Corporativa para reproduzir fielmente a **Opção 2** da imagem de referência: um card premium com cabeçalho azul-marinho escuro e corpo branco.

> **IMPORTANTE:** Analisa primeiro o código existente, identifica o componente responsável pela renderização dos cards de turmas e modifica o próprio componente. Não cries uma página de demonstração separada. Preserva integralmente a lógica, os dados, as funcionalidades e as integrações existentes.

---

## 1. Estrutura visual do card

O card deve ter:

- formato retangular horizontal;
- largura total do seu contentor;
- fundo branco na área inferior e cabeçalho azul-marinho escuro;
- cantos arredondados;
- sombra suave;
- borda subtil em azul acinzentado;
- separação visual clara entre cabeçalho e corpo;
- espaçamento interno generoso.

---

## 2. Cabeçalho azul-marinho

- **Cor principal:** `#0F1F3D`. Gradiente subtil opcional entre `#0F1F3D` e `#132B52`.
- **Padding:** aproximadamente 24 px; cantos superiores arredondados.
- **À esquerda:** título **TURMA DA MANHÃ**, branco, 21–23 px, semibold/bold.
- **À direita:** badge **● Encerrada**
  - fundo `#263F67`;
  - texto branco ou branco acinzentado;
  - formato pill;
  - padding horizontal de 14 px e vertical de 8 px;
  - fonte de cerca de 12 px.
- **Segunda linha:**
  - avatar circular de 50 × 50 px, fundo `#0D6EFD`, iniciais **EF** em branco, 18 px bold;
  - à direita do avatar: **Eduardo Pimenta Ferreira**, branco, 16 px semibold;
  - abaixo, ícone de localização e texto **Academia · 3**, 13 px, cor `#C7D4E8`.

---

## 3. Corpo branco do card

Fundo `#FFFFFF`, padding aproximado de 22 px e cantos inferiores arredondados.

Organiza quatro grupos de informação numa única linha horizontal, numa grelha flexível de quatro colunas:

| Grupo | Ícone | Valor | Legenda |
|---|---|---|---|
| Período | Calendário | 10/10/2026 — 23/10/2026 | Período |
| Horário | Relógio | Segunda 10h00 | Horário |
| Inscritos | Grupo de utilizadores | 2/35 | Inscritos |
| Vagas disponíveis | Pasta de trabalho / mala profissional | Vagas: 33 | Disponíveis |

---

## 4. Estilo dos grupos de informação

- Utiliza ícones **Lucide**, se já estiverem disponíveis no projeto.
- Cada ícone dentro de um círculo azul-claro de aproximadamente 40 × 40 px:
  - fundo `#EAF2FF`;
  - ícone `#0D6EFD`;
  - tamanho do ícone de 19–21 px.
- Ícone e valor principal na mesma linha; legenda abaixo do valor.
- Valores em `#0F1F3D`, fonte de 13–14 px.
- Legendas em `#71829B`, fonte de 12 px.
- Separar grupos com linhas verticais de 1 px em `#DCE5F1`, com 55–60 px de altura, sem tocar nos limites superior e inferior do corpo.
- Distribuir o espaço de forma equilibrada e evitar que os textos fiquem demasiado próximos das divisórias.

---

## 5. Dimensões e espaçamento

- **Largura:** 100% do contentor disponível.
- **Altura aproximada:** 240 px, ajustável ao conteúdo real.
- **Cabeçalho:** aproximadamente 130 px.
- **Corpo:** aproximadamente 110 px.
- **Border-radius:** 16 px.
- **Sombra:** `0 8px 24px rgba(15, 31, 61, 0.08)`.
- **Margem inferior entre cards:** 20–24 px.

> Não fixar uma altura rígida se isso provocar cortes de texto ou desalinhamentos.

---

## 6. Comportamento responsivo

- **Desktop:** manter as quatro informações numa única linha.
- **Tablet:** reduzir proporcionalmente espaçamentos e ícones.
- **Telemóvel:** reorganizar os grupos em duas colunas, mantendo a legibilidade e evitando overflow horizontal.
- Adaptar o cabeçalho a ecrãs pequenos sem sobrepor o título e o badge.

---

## 7. Fidelidade visual

Reproduzir a identidade da Opção 2:

- cabeçalho azul-marinho dominante;
- título branco;
- avatar azul vivo;
- nome do responsável em branco;
- badge no canto superior direito;
- corpo branco com quatro grupos alinhados;
- ícones azuis dentro de círculos azul-claros;
- divisórias discretas;
- sombras suaves e cantos arredondados.

**Não adicionar:** gradientes fortes, animações, efeitos de vidro, elementos decorativos desnecessários ou cores fora da paleta definida.

---

## 8. Preservação das funcionalidades

Esta alteração é **exclusivamente visual**.

**Não alterar:**

- endpoints, APIs, base de dados ou modelos;
- a lógica de criação, edição ou encerramento de turmas;
- filtros, pesquisa, paginação ou ordenação.

**Não fazer:**

- substituir dados dinâmicos por valores estáticos;
- remover funcionalidades.

**Manter:** estado, permissões, ações, eventos de clique e navegação.

Utilizar os **dados reais** para nome, período, horário, inscrições, vagas e estado. Preservar a arquitetura e as bibliotecas instaladas. Os valores deste pedido são referências visuais.

---

## 9. Implementação e critério de aceitação

1. Identifica o componente atual do card de turma.
2. Analisa estilos, componentes partilhados e tokens de design existentes.
3. Verifica como os dados são recebidos e apresentados.
4. Implementa o novo visual no componente existente.
5. Reutiliza bibliotecas de ícones e recursos já disponíveis.
6. Verifica o resultado em desktop, tablet e telemóvel.
7. Executa os testes ou verificações disponíveis.

**Critério de aceitação:** o card deve ficar visualmente o mais próximo possível da Opção 2 da referência, com cabeçalho azul-marinho, corpo branco, avatar circular, badge de estado e quatro grupos de informação alinhados horizontalmente. A alteração não pode comprometer nenhuma funcionalidade da plataforma.

---

> **Dica:** anexa também a imagem de referência ao Claude Code e pede que altere apenas o componente do card de turma, sem redesenhar a página inteira.
