# Prompt para Claude Code

Migrar um card para o design moderno de Onboarding — baseado na imagem de referência.

---

## Como usar

Abra o projeto no Claude Code, anexe/indique a imagem de referência e cole o prompt abaixo. O pedido orienta a adaptar o card existente sem alterar a lógica da plataforma.

---

## Prompt completo

Analisa o projeto existente e migra APENAS o card indicado para reproduzir o design da imagem de referência anexada. Usa […]

> **Nota:** várias linhas do PDF original aparecem cortadas no lado direito (assinaladas com […]). O texto em falta não estava disponível no ficheiro e não foi reconstruído.

### Objetivo

Criar um card moderno, corporativo, limpo e responsivo, com cabeçalho azul com fotografia/visual arquitetónico, conteúdo […]

---

## Estrutura visual

### 1. Card exterior

- Fundo branco, cantos arredondados (aprox. 18–22 px).
- Borda muito subtil azul-acinzentada e sombra suave, sem exagero.
- `overflow: hidden` para o cabeçalho respeitar os cantos.
- Largura responsiva; preservar o comportamento do layout onde o card já aparece.

### 2. Cabeçalho visual

- Altura aproximada de 190–200 px em desktop, ajustável ao espaço disponível.
- Fundo azul corporativo com imagem arquitetónica moderna de edifício envidraçado.
- Aplicar uma camada azul-marinho semitransparente/gradiente sobre a imagem para garantir contraste.
- Padding interno de cerca de 28–36 px.
- No topo, apresentar um ícone de grupo/colaboradores em branco, simples e consistente com os ícones já usados no projeto […]
- No canto superior direito, apresentar badge **"Ativo"** em verde, com ponto circular e formato de cápsula.
- Abaixo, mostrar o título **"Onboarding Colaborador de TI"** em branco, semibold/bold, aproximadamente 23–26 px, podendo ocu […]
- Mostrar a categoria **"TI"** por baixo, em branco com ligeira redução de opacidade, aproximadamente 16–18 px.
- Garantir contraste legível; se não existir imagem no projeto, procurar primeiro um asset já disponível. Não adicionar d […]

### 3. Linha de métricas

- Área branca com padding horizontal de 24–28 px e vertical de 22–26 px.
- Distribuir horizontalmente três métricas, alinhadas e com espaçamento consistente:

| Ícone | Texto |
|---|---|
| Calendário | 30 dias |
| Check circular | 0 tarefas |
| Documento/lista | 0 planos |

- Ícones lineares em azul-acinzentado (aprox. `#49658A`), com tamanho de 22–25 px.
- Texto em azul-marinho escuro, aproximadamente 14–16 px.
- Separadores verticais finos entre métricas, sem linhas pesadas.
- Em ecrãs estreitos, permitir quebra/empilhamento organizado sem overflow horizontal.

### 4. Divisor

- Linha horizontal muito subtil, cor próxima de `#E6ECF4`, com margens laterais de 24–28 px.

### 5. Linhas de informação clicáveis

- Criar duas linhas/mini-cards com fundo azul muito claro (aprox. `#EEF4FD` ou `#EDF3FC`), cantos arredondados de 12–15 px e […]
- Espaço entre linhas de 8–10 px.
- **Primeira linha:** ícone de utilizador, texto "Administrador Executivo" e chevron apontado para a direita.
- **Segunda linha:** ícone de academia/chapéu de graduação, texto "Academia Corporativa" e chevron apontado para a direita.
- Ícones e chevrons em azul corporativo; texto em azul-marinho, aproximadamente 14–16 px.
- Manter os cliques, destinos e handlers existentes. Se estas linhas não forem clicáveis na implementação atual, não inve […]

---

## Paleta de referência

| Uso | Cor |
|---|---|
| Azul-marinho | `#0F1F3D` |
| Azul do cabeçalho | `#0B4F9C` / `#1267B8` |
| Azul de fundo das linhas | `#EEF4FD` |
| Azul dos ícones | `#49658A` |
| Verde do estado ativo | `#16A765` ou equivalente já usado no sistema |
| Divisores | `#E6ECF4` |
| Branco | `#FFFFFF` |

---

## Comportamento e qualidade

- Implementar usando o framework, componentes, tokens e convenções já presentes no repositório.
- Reutilizar a biblioteca de ícones existente; não usar emojis como ícones.
- Não duplicar CSS nem criar uma segunda implementação do mesmo card.
- Preservar textos, dados dinâmicos, estados, acessibilidade, eventos e permissões existentes.
- Incluir hover/focus discretos apenas onde houver interação; evitar tremelique, animações excessivas ou deslocamento do […]
- Garantir responsividade em desktop, tablet e telemóvel.
- Não alterar outros cards, páginas, navegação, API, base de dados ou regras de negócio.
- Não substituir dados reais por valores fixos: os exemplos "30 dias", "0 tarefas" e "0 planos" representam o conteúdo vi […]
- Não adicionar dependências novas sem justificar.

---

## Processo

1. Inspeciona a estrutura do projeto e identifica o componente exato do card.
2. Identifica de onde vêm os dados e quais os handlers atuais.
3. Implementa o novo visual no componente existente, respeitando o design system.
4. Executa os testes, lint ou build disponíveis e corrige erros introduzidos.
5. No final, resume os ficheiros alterados e confirma o que foi preservado.

---

## Critérios de aceitação

- O resultado deve aproximar-se visualmente da imagem de referência: cabeçalho arquitetónico azul, título e estado no top […]
- Alinhamento, espaçamento, tipografia, raios e sombras devem parecer consistentes e profissionais.
- O card deve continuar funcional e responsivo.
- Nenhuma funcionalidade não relacionada deve ser alterada.

Antes de editar, mostra-me brevemente qual componente vais modificar e quais ficheiros esperas alterar. Depois implementa […]

---

## Nota importante

Se quiseres que o Claude Code use exatamente a fotografia da referência, anexa também a imagem no mesmo contexto de trabalho ou coloca-a num asset do projeto e indica o respetivo caminho. A imagem gerada/da referência serve como guia visual; os dados e comportamentos devem continuar ligados à aplicação.
