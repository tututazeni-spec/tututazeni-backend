# Prompt para Claude Code

## Design de lista de departamentos — azul corporativo

**Objetivo:** redesenhar a lista atual com base na imagem de referência, mantendo as funcionalidades e a arquitetura existentes.

---

## 1. Estrutura visual da lista

- Criar uma lista vertical de cartões horizontais (*list cards*), um por departamento.
- Fundo azul muito claro, próximo de `#F0F6FF`; cantos arredondados de 12 px a 16 px.
- Espaçamento vertical de 6 px a 8 px; margens internas de 12 px a 16 px.
- Bordas subtis em `#E1EAF6` e sombras muito suaves, apenas se forem necessárias.
- Altura compacta e consistente, com a lista a ocupar a largura disponível do contentor.

---

## 2. Ícones dos departamentos

- Colocar à esquerda um ícone representativo dentro de um círculo com cerca de 40 px.
- Fundo do círculo: `#DCEBFF`; ícone: `#1765C1`; tamanho: 18 px a 21 px.
- Usar a biblioteca de ícones já instalada.
- Se existir Lucide, considerar: `GraduationCap`, `Users`, `FileText`, `ShieldCheck`, `ChartNoAxesColumn` e `LockKeyhole`.

---

## 3. Informações de cada departamento

### Primeira linha

- Nome em negrito, 13 px a 14 px, cor `#17365D`.
- Código imediatamente à direita, 10 px a 11 px, cor `#7890AC`.

### Segunda linha

- Número de colaboradores, número de cargos e nível hierárquico, numa linha com separadores verticais discretos.
- Exemplo: `3 colaboradores | 2 cargos | Nível 1`.
- Fonte de 10 px a 11 px, cor `#61758F` e separadores `#C7D6E8`.

> Manter os valores ligados aos dados reais da aplicação; não substituir dados dinâmicos por valores fixos.

---

## 4. Botão de navegação

- Adicionar no extremo direito uma seta `ChevronRight`, entre 16 px e 18 px, cor `#526B89`.
- Alinhar verticalmente ao centro e manter uma margem direita equilibrada.
- O cartão deve continuar a abrir os detalhes do departamento através dos eventos já existentes.

---

## 5. Estado selecionado ou ativo

- Adicionar uma barra vertical azul na extremidade esquerda, com cerca de 5 px de largura e 80% a 90% da altura do cartão.
- Cor da barra: `#2878E5`; cantos arredondados; fundo do cartão próximo de `#E5F0FF`.
- O nome e a seta podem receber um azul ligeiramente mais intenso.
- Integrar a barra no cartão sem aumentar a largura nem deslocar o conteúdo.
- O destaque deve refletir a seleção real da interface.

---

## 6. Cabeçalho de navegação

- Se já existir, manter o cabeçalho com fundo `#0F1F3D` e cantos superiores arredondados.
- Botões compactos com ícones à esquerda; botão ativo em `#1765C1` e inativos em azul-marinho ligeiramente mais claro.
- Texto branco, 11 px a 12 px.
- Preservar opções existentes, como "Árvore organizacional" e "Lista hierárquica", quando implementadas.

---

## 7. Paleta de cores

| Uso | Cor |
|---|---|
| Azul-marinho | `#0F1F3D` |
| Azul corporativo | `#1765C1` |
| Azul de seleção | `#2878E5` |
| Fundo dos cartões | `#F0F6FF` |
| Fundo selecionado | `#E5F0FF` |
| Círculos dos ícones | `#DCEBFF` |
| Texto principal | `#17365D` |
| Texto secundário | `#61758F` |
| Código do departamento | `#7890AC` |
| Bordas | `#E1EAF6` |
| Separadores | `#C7D6E8` |
| Fundo geral | `#FFFFFF` ou fundo atual |

---

## 8. Comportamento e responsividade

- Preservar todos os eventos de clique, navegação, filtros, permissões e lógica de negócio.
- Não alterar dados nem componentes fora do âmbito da lista.
- Em ecrãs pequenos, truncar nomes quando necessário sem sobrepor o código ou a seta.
- Evitar sobreposição das informações da segunda linha e adaptar os espaçamentos de forma responsiva.
- Manter a interface compacta, limpa e consistente.

---

## 9. Regras de implementação

- Antes de alterar o código, identificar o componente da lista, os estilos, os dados, os eventos e o sistema de estilos usado.
- Reutilizar a estrutura e os componentes existentes, alterando apenas o necessário.
- Não recriar toda a página se bastar modificar o componente da lista.
- Não remover funcionalidades nem duplicar componentes ou estilos desnecessários.

---

## 10. Resultado esperado

Uma lista semelhante à imagem de referência:

- cartões horizontais azul-claros;
- ícones circulares azuis;
- nome e código na primeira linha;
- indicadores de colaboradores/cargos/nível na segunda;
- seta à direita;
- barra azul no departamento selecionado.

O resultado deve transmitir uma identidade de software corporativo premium, com hierarquia clara, espaçamento consistente, cantos suaves e excelente legibilidade.

> **Prioridade máxima:** fidelidade à imagem de referência, preservação das funcionalidades e integração com o código atual.

No final, apresenta um resumo dos ficheiros alterados e confirma que a lista mantém o seu funcionamento original.
