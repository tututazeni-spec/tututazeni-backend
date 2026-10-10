# Prompt para Claude Code

## Recriar o card "Academia Corporativa" — design premium baseado na opção 6

Quero que redesenhes o card **Academia Corporativa** da minha plataforma, reproduzindo fielmente o design da imagem de referência que forneci.

> **Importante:** antes de começar, analisa a estrutura existente do projeto, identifica o componente responsável por este card e verifica as tecnologias e os estilos já utilizados. Implementa a alteração diretamente no código existente, sem criar uma página de demonstração separada.

---

## 1. Estilo visual

Cria um card moderno, premium e profissional, com estética de dashboard corporativo de formação, utilizando:

| Uso | Cor |
|---|---|
| Azul-marinho | `#0F1F3D` |
| Azul principal | `#0756D9` |
| Azul vibrante | `#078BFF` |
| Fundo branco | `#FFFFFF` |
| Fundo azul-claro | `#EAF3FF` |
| Texto principal | `#102A56` |
| Texto secundário | `#7186A8` |

- Bordas subtis em azul-claro, cantos arredondados de aproximadamente 24 px e sombras suaves.
- Tipografia moderna, limpa e legível.

---

## 2. Cabeçalho ilustrado

Cria um cabeçalho superior com aproximadamente 200–220 px de altura, com fundo em degradê azul-marinho e azul intenso. Deve conter:

- À esquerda, um ícone de capelo de formatura branco dentro de um círculo azul vibrante.
- Ao lado do ícone, o título **"Academia Corporativa"** em branco, com fonte forte e tamanho destacado.
- Abaixo do título, o subtítulo **"ACAD"** em azul-claro.
- À direita, uma ilustração decorativa de um capelo de formatura 3D sobre uma pilha de livros azuis.
- Formas geométricas discretas e abstratas no fundo, criando profundidade.
- Alinhamento horizontal equilibrado e espaçamento generoso.

O cabeçalho deve parecer uma secção premium de uma plataforma de aprendizagem corporativa.

---

## 3. Corpo do card

O corpo deve ter fundo branco, cantos arredondados e sobrepor-se ligeiramente à parte inferior do cabeçalho, criando um efeito de camadas.

| Campo | Ícone | Etiqueta | Valor |
|---|---|---|---|
| Responsável | Utilizador | RESPONSÁVEL | "—" |
| Colaboradores | Grupo de pessoas | COLABORADORES | "0" |
| Subdepartamentos | Organograma | SUBDEPARTAMENTOS | "Nenhum" |
| Cargos | Pasta executiva ou mala profissional | CARGOS | "0" |
| Estrutura descendente | Hierarquia organizacional | ESTRUTURA DESCENDENTE | "Sem sub-estrutura" |

### Estilo dos campos

- Cada campo apresenta um ícone azul-escuro dentro de um pequeno quadrado ou círculo azul-claro.
- O ícone fica à esquerda, e a etiqueta e o valor à direita.
- Etiquetas em maiúsculas, tamanho de 12–14 px e cor azul acinzentada.
- Valores entre 16–20 px, com peso médio ou semibold e cor azul-marinho.
- Separar os campos com linhas horizontais finas em azul-claro.
- Garantir alinhamento vertical perfeito e espaçamento consistente, sem excesso de decoração.

---

## 4. Botão principal

Na parte inferior do card, criar um botão largo com o texto **"Ver detalhe completo →"**.

- Largura de 100% da área útil do card.
- Altura aproximada de 76–88 px em ecrãs grandes, ajustada proporcionalmente em ecrãs menores.
- Fundo em degradê de `#078BFF` para `#1247D8`.
- Texto branco, semibold e legível; seta branca à direita.
- Cantos arredondados de 16–20 px.
- Hover discreto, sem tremelique, saltos ou mudanças bruscas de posição.
- Transição suave de 180–220 ms.
- Preservar a ação original do botão, abrindo os detalhes completos da academia.

---

## 5. Dimensões e responsividade

- O card ocupa 100% da largura disponível no seu contentor, respeitando os limites da grelha atual.
- Em ecrãs grandes, manter uma proporção elegante, semelhante à imagem de referência.
- Em ecrãs pequenos, reduzir o cabeçalho, a ilustração, os ícones e os espaçamentos.
- Impedir que o título ou os campos ultrapassem os limites do card.
- Garantir que o botão permanece acessível e legível em dispositivos móveis.
- Manter espaçamento interno consistente entre 24 e 44 px, adaptado à largura disponível.

---

## 6. Comportamento e integração

- Preservar os dados dinâmicos e a lógica já existente; não substituir dados reais por valores fixos.
- Manter eventos, permissões, navegação e funcionalidades originais.
- Preservar estados de carregamento, ausência de dados e erros, caso já existam.
- Não alterar outros cards, filtros, tabelas ou componentes da plataforma.
- Não modificar a estrutura da base de dados nem as APIs.
- Utilizar componentes, ícones e bibliotecas já existentes sempre que possível.
- Se o projeto utilizar React, reutilizar os componentes e convenções existentes.
- Evitar dependências novas desnecessárias.

---

## 7. Ilustração do cabeçalho

Utiliza uma ilustração de boa qualidade de um capelo de formatura azul sobre livros azuis, com aparência tridimensional.

1. **Prioridade 1:** reutilizar um recurso visual existente no projeto.
2. **Prioridade 2:** utilizar uma imagem local já disponível.
3. **Prioridade 3:** se necessário, criar ou adicionar um recurso visual adequado, respeitando a arquitetura atual.

Requisitos:

- A imagem deve manter boa qualidade, transparência quando apropriado e integração natural com o degradê azul.
- Não utilizar emojis como substitutos da ilustração.

---

## 8. Acabamento profissional

O resultado deve transmitir formação corporativa, educação executiva, organização e hierarquia, tecnologia moderna e qualidade visual premium.

**Evitar:**

- bordas pretas pesadas;
- sombras exageradas;
- gradientes excessivamente luminosos;
- ícones desalinhados;
- fontes demasiado pequenas;
- animações que façam o card tremer;
- alterações de layout ao passar o rato;
- espaçamentos inconsistentes.

---

## 9. Critérios de conclusão

- [ ] O card está implementado na página real da plataforma.
- [ ] O resultado visual é o mais fiel possível à imagem de referência.
- [ ] Todos os campos estão alinhados e legíveis.
- [ ] A ilustração está corretamente posicionada no cabeçalho.
- [ ] O botão continua a executar a funcionalidade original.
- [ ] O layout funciona em desktop e dispositivos móveis.
- [ ] Não existem erros de compilação nem regressões nas funcionalidades existentes.

---

> **Regra principal:** modifica apenas o necessário para reproduzir este card. Mantém intacto o restante design da plataforma e não inventes funcionalidades novas.

> **Dica:** envia também a imagem de referência ao Claude Code, na mesma conversa em que colares o prompt. Assim, ele terá uma referência visual direta para reproduzir o cabeçalho, a ilustração 3D, os ícones, os espaçamentos e o botão com maior fidelidade.
