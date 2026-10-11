# Prompt para Claude Code

## Reprodução do design — Calculadora Salarial Split Layout

---

## Referência visual

A imagem de referência mostra uma calculadora salarial em layout dividido (*Split Layout*):

- **À esquerda:** cartão branco com o título "Calculadora Salarial", a secção "Dados do salário", cinco campos (Salário base, Subsídio de alimentação, Horas extras, Prémios / Comissões, Outros subsídios) e o botão "Calcular".
- **À direita:** painel azul-marinho "RESULTADO ESTIMADO" com Bruto total, IRT (16%), INSS colaborador (3%), Total deduções, o bloco de destaque "Salário líquido" e o aviso de simulação indicativa.

*(A imagem não está incluída neste ficheiro; anexa o original ao Claude Code.)*

---

## Como utilizar

Anexa a imagem de referência ao Claude Code, abre o projeto existente e cola o prompt abaixo. O pedido prioriza a reprodução visual sem alterar a lógica de cálculo nem as funcionalidades já existentes.

---

## Prompt

Analisa o projeto existente e atualiza a interface da página/componente **"Calculadora Salarial"** para reproduzir o mais fielmente possível o design da imagem de referência anexada.

### Objetivo

Criar uma calculadora salarial moderna em layout dividido (Split Layout): formulário à esquerda, painel de resultados à direita. Mantém a identidade azul corporativa, a hierarquia visual e as proporções da referência.

### Antes de alterar

1. Inspeciona a estrutura do projeto, identifica o framework, a página e os componentes da calculadora salarial.
2. Reutiliza as tecnologias, convenções, componentes e estilos já existentes.
3. Não recries a aplicação do zero e não alteres páginas não relacionadas.
4. Preserva todos os cálculos, validações, estados, integrações, nomes de campos e funcionalidades existentes.

---

## Estrutura visual

- Um único cartão principal horizontal, com cantos arredondados (aprox. 16–20 px), recorte/`overflow: hidden` e sombra azul muito subtil.
- Duas colunas lado a lado:
  - **A) Esquerda (aprox. 46% da largura):** fundo branco ou branco azulado, formulário e botão "Calcular".
  - **B) Direita (aprox. 54% da largura):** painel azul-marinho/azul profundo com o resumo dos valores.
- A coluna esquerda deve ter padding generoso (20–28 px) e separação visual clara.
- No topo esquerdo, ícone de calculadora azul dentro de um pequeno quadrado arredondado e título "Calculadora Salarial".
- Subtítulo/secção "Dados do salário".
- Campos, pela ordem existente:
  1. Salário base (Kz)
  2. Subsídio de alimentação (Kz)
  3. Horas extras (Kz)
  4. Prémios / Comissões (Kz)
  5. Outros subsídios (Kz)
- Cada campo deve ter:
  - um ícone simples de traço azul dentro de uma caixa quadrada arredondada;
  - etiqueta pequena;
  - input branco com borda azul-clara fina, raio de 7–9 px e altura aproximada de 36–42 px;
  - "Kz" alinhado à direita dentro do campo quando aplicável.
- O botão "Calcular" ocupa praticamente toda a largura disponível, com fundo azul vivo, texto branco, ícone de calculadora, cantos arredondados e altura de 42–46 px.

---

## Painel de resultados à direita

- Fundo azul profundo com gradiente discreto, por exemplo de `#0B3D91` para `#06275F`. Pode incluir formas diagonais/curvas muito subtis no fundo, sem prejudicar a leitura.
- Padding interno de 24–30 px e texto branco.
- No topo, ícone de gráfico de barras e título em maiúsculas **"RESULTADO ESTIMADO"**.
- Mostrar linhas organizadas e alinhadas, com descrição à esquerda e montante à direita:
  - Bruto total
  - IRT (16%)
  - INSS colaborador (3%)
  - Total deduções
- Usar divisores finos semitransparentes e espaçamento vertical consistente. Valores numéricos alinhados à direita e com peso tipográfico forte.
- Dar maior destaque ao resultado **"Salário líquido"**:
  - bloco azul mais claro/vivo (ex. `#075FE8`);
  - cantos arredondados (10–12 px);
  - ícone de moedas;
  - etiqueta branca e valor em fonte grande e negrito;
  - o montante deve atualizar dinamicamente com o cálculo real da aplicação.
- Incluir no final um ícone de informação e o aviso: *"Simulação meramente indicativa. Os valores finais podem variar com deduções adicionais aprovadas pelo RH."* O aviso deve ser pequeno, legível e com contraste suficiente.

---

## Sistema visual

| Uso | Cor |
|---|---|
| Azul principal | `#0F1F3D` ou `#0B3D91` |
| Azul de ação | `#0D6EFD` (ou o azul já definido no projeto) |
| Azul do painel | `#06275F` / `#0B3D91` |
| Fundo de inputs | `#FFFFFF` |
| Bordas | `#D6E4F5` |
| Texto principal | `#0F1F3D` |

- Cantos arredondados consistentes; sombras leves; ícones lineares coerentes (usar a biblioteca de ícones já instalada).
- Tipografia moderna e legível, com hierarquia clara.
- Evita efeitos excessivos, brilhos fortes, animações e sombras pesadas.

---

## Comportamento e responsividade

- **Desktop/tablet largo:** duas colunas, como na referência.
- **Ecrãs estreitos:** empilhar o formulário primeiro e o resultado depois; não permitir overflow horizontal.
- Preserva navegação por teclado, labels associados aos inputs, foco visível, contraste acessível e botões com estados hover/focus/disabled adequados.
- Não introduzas animações de tremelique, saltos ou escalas ao clicar; usa transições discretas apenas quando já fizerem sentido no projeto.
- O botão "Calcular" deve continuar a executar a lógica existente, sem simular resultados fixos.

---

## Regras importantes

- Não alteres fórmulas fiscais nem inventes taxas. Mantém as regras e os valores calculados pela aplicação.
- Não fixes no código os números que aparecem na imagem (350000, 25000, 375000, 26500, 10500, 36500, 338500); são apenas conteúdo ilustrativo da referência. Usa os dados reais e o estado atual da aplicação.
- Não removas campos, validações, mensagens, permissões ou integrações.
- Não substituas dados reais por dados de demonstração.
- Evita duplicar componentes ou criar CSS global que afete outras páginas.
- Se o projeto já usar Tailwind, CSS Modules, styled-components ou outra solução, segue o padrão existente.

---

## Validação final

1. Executa as verificações/testes disponíveis no projeto.
2. Confirma que todos os campos continuam editáveis e que "Calcular" funciona.
3. Confirma que os valores do resumo vêm da lógica real existente.
4. Verifica o layout em desktop e mobile.
5. Lista os ficheiros alterados e resume o que foi feito.
6. Se alguma parte da referência não puder ser reproduzida por causa da arquitetura atual, explica o motivo antes de fazer uma alteração estrutural grande.

---

**Implementa agora as alterações diretamente no projeto existente, com foco na fidelidade visual à referência e na preservação total da funcionalidade.**
