# Prompt para Claude Code

## Matriz de Competências — Pessoas × Competências | Design Heatmap Azul Corporativo

Anexa a imagem de referência no Claude Code e utiliza o seguinte prompt para atualizar a matriz existente, preservando dados e funcionalidades.

---

## Objetivo

- Reformular a página **Matriz de Competências (Pessoas × Competências)**, reproduzindo o estilo visual da imagem: tabela compacta, cabeçalho azul-marinho, nomes das pessoas à esquerda e células de avaliação coloridas em formato heatmap.
- Implementa efetivamente as alterações no código existente; não te limites a apresentar uma proposta.

---

## 1. Estrutura da matriz

- Mantém as pessoas nas linhas e as competências nas colunas.
- A primeira coluna deve ter o título **Pessoas**, um ícone discreto de utilizador, avatar circular com iniciais e nome completo.
- Cada cabeçalho de competência deve apresentar um ícone e o nome da competência, podendo quebrar em duas linhas quando necessário.
- Usa os nomes reais existentes na aplicação, incluindo competências como:
  - Foco em Resultados
  - Inovação
  - Pensamento Estratégico
  - Adaptabilidade
  - Bem-estar e Disciplina
  - Comunicação
  - Orientação para o Cliente
- Preserva a ordenação atual e todos os dados reais.

---

## 2. Estilo visual

- **Cabeçalho:** azul-marinho profundo, como `#0F2D55` ou `#0B2E59`, com texto e ícones brancos.
- **Coluna das pessoas:** fundo azul-marinho, nomes brancos e avatares circulares com iniciais. Utiliza tons harmoniosos para distinguir os avatares.
- **Corpo:** células compactas, divisórias finas e claras, sem sombras excessivas nem decoração desnecessária.
- **Cantos externos:** arredondamento de 12–16 px, recortando o conteúdo para manter os cantos limpos.
- **Tipografia:** fonte sem serifa moderna; nomes entre 11–13 px e valores entre 12–14 px, com peso semibold.
- **Espaçamento:** valores centrados nas células; nomes alinhados à esquerda; padding compacto e consistente.

---

## 3. Cores das avaliações — heatmap

- Apresenta os valores numéricos centralizados em células coloridas, inspiradas na imagem.
- Ajusta a cor do texto para manter contraste e legibilidade. Evita gradientes fortes dentro das células.
- Os valores devem vir **exclusivamente dos dados reais**. Não inventes nem alteres classificações.
- Para valores ausentes ou não avaliados, apresenta um traço (—) ou o indicador já utilizado pela aplicação, com fundo neutro cinzento/bege.

### Escala sugerida

| Valor | Cor | Código |
|---|---|---|
| 1 | Coral/vermelho | `#F26B6B` |
| 2 | Laranja | `#F6A36B` |
| 3 | Amarelo | `#F7DF72` |
| 4 | Verde claro | `#76D6A0` |
| 5 | Verde intenso | `#20B981` |
| — | Não avaliado | Fundo neutro cinzento/bege |

---

## 4. Ícones e avatares

- Reutiliza a biblioteca de ícones já instalada, com ícones simples, consistentes e alinhados.
- Mostra as iniciais reais nos avatares. Se já existirem fotografias de perfil, respeita a lógica atual.

### Sugestões de ícones

| Competência | Ícone |
|---|---|
| Foco em Resultados | `target` |
| Inovação | `lightbulb` |
| Pensamento Estratégico | `chess-king` ou `brain-circuit` |
| Adaptabilidade | `monitor` |
| Bem-estar e Disciplina | `users-round` |
| Comunicação | `message-circle` |
| Orientação para o Cliente | `user-round` |

---

## 5. Responsividade e usabilidade

- Em ecrãs pequenos, mantém a matriz legível usando scroll horizontal quando necessário.
- Se for compatível com a arquitetura atual, mantém a coluna das pessoas fixa (*sticky*) à esquerda durante o scroll horizontal e o cabeçalho fixo durante o scroll vertical.
- Preserva pesquisa, filtros, ordenação, seleção de pessoas, edição de avaliações, tooltips e todas as ações existentes.
- Garante navegação por teclado, foco visível e contraste adequado.

---

## 6. Requisitos técnicos

- Analisa primeiro a estrutura do projeto, identifica o componente da matriz, a framework e o sistema de estilos.
- Implementa no componente existente e reutiliza componentes e tokens de design. Evita duplicação e dependências desnecessárias.
- Não alteres APIs, lógica de negócio, permissões, rotas ou formato dos dados sem necessidade.
- Não substituas dados reais por exemplos fictícios. A imagem é uma referência visual.
- Evita animações de escala, tremelique, deslocamentos ao clicar e sombras excessivas.

---

## 7. Verificação final

- Executa os testes, lint ou build disponíveis e corrige erros introduzidos.
- Verifica nomes e competências longos, colunas completas, valores legíveis e ausência de conteúdo cortado.
- Confirma que o heatmap corresponde aos valores reais e que os valores ausentes têm apresentação distinta.
- Compara o resultado com a imagem de referência e ajusta cores, espaçamento, alinhamento e proporções.

---

## Resultado esperado

- Uma matriz empresarial moderna e compacta: cabeçalho e coluna de pessoas azul-marinho, avatares circulares, ícones brancos e células heatmap em verde, amarelo, laranja e vermelho.
- Preserva o aspeto limpo e a leitura rápida da imagem, sem comprometer a funcionalidade da plataforma.
