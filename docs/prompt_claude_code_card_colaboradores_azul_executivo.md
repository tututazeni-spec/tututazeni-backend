# Prompt para Claude Code

## Card de colaboradores — Azul Executivo Premium

---

## Objetivo

Recriar o visual da imagem de referência na tabela/lista de colaboradores da plataforma, mantendo os dados, funcionalidades e comportamento existentes. Alterar apenas a apresentação visual, sem inventar dados nem quebrar filtros, ordenação, responsividade ou integrações.

---

## Texto para copiar e colar no Claude Code

Trabalha no componente de tabela/lista de colaboradores já existente e aplica o seguinte redesign visual, usando a imagem anexada como referência principal.

### 1. Estilo geral

Criar um visual **"Azul Executivo Premium"**: profissional, sóbrio, moderno e limpo. O componente deve parecer um painel de gestão empresarial, com fundo azul-marinho profundo, cantos arredondados e separadores subtis. Evitar efeitos excessivos, gradientes chamativos, animações ou sombras pesadas.

### 2. Cartão principal

- Usar um único cartão de fundo azul-marinho (`#071D3B` ou tom visualmente equivalente), com `border-radius` entre 12 px e 16 px.
- Aplicar uma borda muito discreta e sombra suave.
- Manter o conteúdo alinhado e com espaçamento consistente.
- O cartão deve adaptar-se à largura do contentor sem provocar scroll horizontal desnecessário.

### 3. Cabeçalho da tabela

Criar uma faixa superior ligeiramente mais clara ou diferenciada (`#0B2D5B`), com texto branco, pequeno, em maiúsculas e com peso semibold/bold.

Usar estas colunas, nesta ordem:

| 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|
| Avaliador | Competência | Tipo | Nível obtido | Nível esperado | Lacuna |

- Os títulos "Nível obtido" e "Nível esperado" podem ocupar duas linhas, tal como na referência.
- Alinhar os cabeçalhos numéricos ao centro.

### 4. Linhas e separadores

- Manter cada colaborador numa linha com altura confortável.
- Separar as linhas com uma linha horizontal fina em azul acinzentado, com baixa opacidade.
- Não usar grelha vertical pesada.
- Garantir que o texto não fica encostado às margens e que todas as colunas permanecem visualmente alinhadas.

### 5. Coluna Avaliador

- Mostrar um avatar circular com as iniciais do colaborador, à esquerda do nome.
- Usar cores de avatar distintas e consistentes, ou as cores já existentes no projeto se houver um sistema definido:

| Cor | Código |
|---|---|
| Verde-água | `#22B8A7` |
| Roxo | `#9B35D5` |
| Laranja | `#FF9C2A` |
| Azul vivo | `#1685FF` |

- As iniciais devem ser brancas, centradas e em negrito.
- Ao lado, mostrar o nome em branco, com peso semibold, e o departamento abaixo em tamanho menor e cor azul-acinzentada clara.

### 6. Competência e tipo

- Apresentar a competência em texto branco, com tamanho compacto e *line-height* confortável.
- O tipo deve aparecer como uma pequena etiqueta/pílula azul (`#124A88` ou semelhante), com texto azul-claro ou branco, cantos arredondados e padding horizontal reduzido.
- Na referência, o exemplo de etiqueta é "Autoavaliação".

### 7. Valores numéricos

- Mostrar os valores de "Nível obtido", "Nível esperado" e "Lacuna" em branco ou cinza muito claro, com alinhamento central e espaçamento uniforme.
- Preservar os valores reais da aplicação; não fixar os números do exemplo da imagem como dados permanentes.

### 8. Dados de referência apenas para comparação visual

A imagem mostra exemplos como Nuno Vasconcelos, Carla Mendonça, Eduardo Pimenta e Ferreira. Usa os dados reais já existentes no sistema. Se forem necessários dados fictícios apenas para uma pré-visualização, manter a estrutura de nome, departamento, competência, tipo e três valores numéricos.

### 9. Tipografia e acessibilidade

- Usar a tipografia já adotada no projeto; se não existir uma definida, usar uma sans-serif moderna, como Inter ou `system-ui`.
- Garantir contraste elevado entre texto e fundo, tamanhos legíveis e foco visível nos elementos interativos.
- Não depender apenas da cor para transmitir informação.

### 10. Responsividade

- Em ecrãs largos, manter as seis colunas alinhadas numa única tabela.
- Em ecrãs pequenos, adaptar a tabela de forma utilizável: permitir scroll horizontal dentro do cartão ou converter cada registo num bloco responsivo, sem cortar nomes, competências ou valores.
- Não permitir que a página inteira fique mais larga do que o ecrã.

### 11. Comportamento e integração

- Preservar filtros, pesquisa, seleção, ordenação, paginação, ações e eventos que já existam.
- Não substituir dados reais por dados estáticos.
- Não criar uma nova tabela paralela se já houver um componente existente: modificar o componente atual e reutilizar os componentes, tokens de design e estilos do projeto sempre que possível.
- Evitar dependências novas sem necessidade.

### 12. Implementação

- Antes de alterar, identifica a página e o componente responsáveis por esta tabela.
- Depois aplica o redesign nos ficheiros corretos, mantendo a arquitetura e convenções atuais do projeto.
- Se o projeto usar Tailwind, aproveita as classes e tokens existentes; se usar CSS/SCSS ou outra biblioteca, segue o padrão já adotado.
- Remove ou ajusta estilos antigos que entrem em conflito.

### 13. Critérios de aceitação

O resultado final deve aproximar-se visualmente da imagem: cartão azul-marinho, cabeçalho escuro, texto claro, avatares circulares coloridos, etiquetas compactas, separadores subtis e números centrados.

- Verifica os estados normal, hover e focus.
- Confirma que os dados continuam corretos e que a interface funciona em desktop e mobile.
- No final, indica quais ficheiros foram alterados e resume as decisões tomadas.

---

> **Nota:** anexa também a imagem de referência na conversa com o Claude Code e pede-lhe para comparar o resultado visual com ela antes de concluir.
