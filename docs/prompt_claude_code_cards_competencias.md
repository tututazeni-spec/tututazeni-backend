# Prompt para Claude Code

## Redesign dos Cards de Competências

Quero que reformules o design visual dos cards de competências da minha plataforma, seguindo fielmente a imagem de referência fornecida. O objetivo é transformar os cards atuais num design moderno, premium e profissional, com uma cor diferente por competência.

---

## 1. Estrutura dos cards

- Organiza os cards numa grelha responsiva de **3 colunas** em ecrãs grandes, **2 colunas** em tablets e **1 coluna** em dispositivos móveis.
- Cada card deve conter, pela ordem indicada:
  1. ícone da competência num círculo branco translúcido;
  2. seta de navegação (→) no canto superior direito;
  3. nome da competência;
  4. badge da categoria;
  5. número de Cursos (ex.: `3 Cursos`);
  6. número de Cargos (ex.: `2 Cargos`).
- Mantém os dados reais já existentes na aplicação.

---

## 2. Design visual

- **Fundo:** cada competência tem uma cor diferente, atribuída de forma estável pelo id (`id % 8`), **a 50% de opacidade** (só o fundo; texto e ícones ficam a 100%). Paleta: `#0F1F3D`, `#1E40AF`, `#0F766E`, `#6D28D9`, `#B91C1C`, `#B45309`, `#BE185D`, `#15803D`. Não utilizar fundos brancos nos cards.
- **Cantos:** arredondamento entre 14 px e 18 px.
- **Ícones:** brancos, dentro de círculos com fundo branco translúcido (`bg-white/15`), com cerca de 52 px. Reutiliza a biblioteca de ícones já instalada.
- **Tipografia:** títulos brancos (`#FFFFFF`), peso 600–700 e tamanho 14–16 px. Todos os textos e números a branco 100% (`#FFFFFF`), sem transparência.
- **Badge:** fundo branco translúcido (`bg-white/20`), texto branco, cantos entre 5 px e 8 px e padding compacto.
- **Contadores:** cursos e cargos na parte inferior, na mesma linha quando houver espaço, com texto branco a 100% e tamanho entre 11 px e 12 px.
- **Seta:** branca, cerca de 16 px, no canto superior direito, sem fundo sólido; preserva a ação de navegação existente.

### Ícones sugeridos

| Competência | Ícone |
|---|---|
| Foco em Resultados | `target` |
| Inovação | `lightbulb` |
| Pensamento Estratégico | `chess-king` |
| Adaptabilidade | `monitor` |
| Bem-estar e Disciplina | `users-round` |
| Comunicação | `message-circle-more` |

---

## 3. Espaçamento e dimensões

- Padding interno de 16 px e espaçamento entre cards de 10 px a 16 px.
- Mantém alturas consistentes, alinhamento equilibrado e espaço adequado entre ícone, título, badge e contadores.
- Evita que títulos longos ultrapassem os limites dos cards e que os badges provoquem overflow.

---

## 4. Interações e efeitos

- Elimina qualquer tremelique ou deslocamento indesejado ao clicar nos cards.
- Não aplicar animações de escala que alterem visivelmente o tamanho dos cards.
- Se existir hover, utiliza apenas uma transição subtil de cor ou sombra.
- Preserva a navegação e as interações atuais.

---

## 5. Cards a atualizar

- Foco em Resultados
- Inovação
- Pensamento Estratégico
- Adaptabilidade
- Bem-estar e Disciplina
- Comunicação

Implementa o estilo no componente reutilizável dos cards, caso exista, para manter a consistência. Aplica-o também às competências carregadas dinamicamente.

---

## 6. Pesquisa e filtros

- Mantém a barra de pesquisa e os filtros existentes fora dos cards, sem remover nem alterar o seu funcionamento.
- Preserva:
  - a pesquisa de competências e tags;
  - o filtro por categoria;
  - o filtro por estado;
  - as contagens de cursos e cargos;
  - os dados e as ligações existentes.

---

## 7. Requisitos técnicos

- Antes de implementar, analisa a estrutura do projeto, identifica o componente dos cards e o sistema de estilos utilizado.
- Reutiliza componentes, tokens de design e bibliotecas de ícones existentes. Evita duplicações e dependências desnecessárias.
- Altera apenas o necessário. Não substituas dados reais por dados fictícios, nem alteres APIs, lógica de negócio, rotas ou permissões.
- Mantém a acessibilidade, contraste adequado e foco visível para navegação por teclado.
- Executa os testes ou verificações disponíveis, corrige erros introduzidos e confirma responsividade, alinhamento e ausência de tremelique.

---

## Resultado final esperado

- Cards semelhantes à imagem de referência: cor própria por competência a 50% de opacidade, ícones brancos em círculos translúcidos, títulos brancos, badges translúcidos, contadores e setas no canto superior direito.
- O resultado deve transmitir uma plataforma empresarial premium, moderna, limpa e consistente.

> **Importante:** não te limites a apresentar uma proposta ou exemplo. Implementa efetivamente as alterações no código existente, respeitando os dados, a estrutura e o funcionamento real do projeto.
