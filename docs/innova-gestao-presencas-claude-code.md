# Implementação do controlo de presenças --- Innova

## Objetivo

Implementar no módulo **Cursos** da plataforma Innova um sistema de
gestão de presenças associado às **Turmas**. O sistema deve registar a
participação dos formandos inscritos em cada sessão, calcular a
assiduidade e disponibilizar relatórios.

> **Importante para a implementação:** a plataforma Innova já existe e
> foi desenvolvida à medida. Antes de alterar código, analise a
> arquitetura, as convenções, os componentes, o modelo de dados, a
> autenticação/autorização e os padrões visuais já utilizados. Reutilize
> o que existe. Não crie uma segunda arquitetura nem substitua
> funcionalidades atuais sem necessidade.

## 1. Estrutura de navegação

Manter as duas abas principais atuais do módulo **Cursos**:

-   **Cursos** --- catálogo, criação e edição de cursos, módulos,
    conteúdos, carga horária e configurações de conclusão/certificado.
-   **Turmas** --- criação e gestão de turmas, inscrições,
    calendário/sessões, presenças e relatórios.

Não criar, nesta primeira fase, uma aba global de Presenças no menu
principal. O registo deve estar contextualizado dentro de cada turma.

### Navegação dentro de uma turma

Criar ou adaptar a página de detalhe da turma com as seguintes
secções/abas:

1.  **Visão geral** --- dados principais da turma, curso associado,
    estado, datas, formador e indicadores.
2.  **Participantes** --- lista de formandos inscritos e respetivos
    dados relevantes.
3.  **Sessões** --- calendário/lista de sessões da formação.
4.  **Presenças** --- registo e consulta da assiduidade por sessão.
5.  **Relatórios** --- indicadores e exportação de relatórios.

Se a aplicação já utilizar outro padrão de navegação para detalhes,
respeitar esse padrão.

## 2. Modelo funcional

A presença deve ser registada **por participante e por sessão**, e não
apenas ao nível geral do curso ou da turma.

Relações esperadas:

-   Um curso pode ter várias turmas.
-   Uma turma pertence a um curso.
-   Uma turma tem vários participantes inscritos.
-   Uma turma tem várias sessões.
-   Cada sessão tem registos de presença dos participantes inscritos.
-   Cada registo de presença pertence a uma sessão e a um participante.

Antes de criar tabelas/entidades, verificar se já existem estruturas
equivalentes e adaptá-las.

### Dados mínimos de uma sessão

-   Turma associada.
-   Título ou identificação da sessão.
-   Data.
-   Hora de início e fim.
-   Duração, calculada ou registada.
-   Formador responsável.
-   Modalidade: presencial, online ou híbrida.
-   Estado: agendada, em curso, concluída ou cancelada.
-   Observações, quando aplicável.

### Dados mínimos de um registo de presença

-   Sessão.
-   Participante/inscrição na turma.
-   Estado da presença.
-   Hora de entrada, quando aplicável.
-   Hora de saída, quando aplicável.
-   Observação/justificação.
-   Método de registo: manual, QR Code ou integração online.
-   Utilizador que registou/alterou.
-   Data e hora de criação/última alteração.

Usar a inscrição na turma como referência do participante sempre que o
modelo de dados existente o permita, evitando duplicar dados pessoais.

## 3. Estados de presença

Disponibilizar os seguintes estados:

  -----------------------------------------------------------------------
  Estado                              Significado
  ----------------------------------- -----------------------------------
  Presente                            Participou na sessão.

  Ausente                             Não participou.

  Atrasado                            Participou, mas chegou depois da
                                      hora definida.

  Justificado                         Ausência aceite/justificada,
                                      conforme as regras da organização.
  -----------------------------------------------------------------------

Os estados devem ser visualmente distintos, com texto e não apenas cor.
Não assumir que "Justificado" conta como presença: permitir que a regra
de assiduidade da organização defina se ausências justificadas entram ou
não no cálculo, documentando o comportamento adotado.

## 4. Interface de presenças

Dentro da turma, a secção **Presenças** deve permitir selecionar uma
sessão e consultar os participantes inscritos nessa turma.

### Cabeçalho da sessão

Apresentar:

-   Nome da turma.
-   Curso associado.
-   Data e horário da sessão.
-   Formador.
-   Modalidade.
-   Estado da sessão.

### Indicadores rápidos

Mostrar, no mínimo:

-   Total de inscritos elegíveis.
-   Presentes.
-   Ausentes.
-   Atrasados.
-   Justificados.

Os números devem ser atualizados após guardar os registos.

### Tabela de participantes

Colunas recomendadas:

  -----------------------------------------------------------------------
  Coluna                              Conteúdo
  ----------------------------------- -----------------------------------
  Participante                        Nome do formando.

  Identificador                       Número interno, e-mail ou
                                      identificador já utilizado na
                                      plataforma.

  Estado                              Presente, Ausente, Atrasado ou
                                      Justificado.

  Entrada                             Hora de entrada, quando registada.

  Saída                               Hora de saída, quando registada.

  Observação                          Nota ou justificação.

  Ações                               Editar registo, conforme
                                      permissões.
  -----------------------------------------------------------------------

Funcionalidades da tabela:

-   Pesquisa por nome ou identificador.
-   Filtro por estado.
-   Ordenação por nome e estado.
-   Paginação, se necessária pelo volume de participantes.
-   Seletor de estado por participante.
-   Campo de observação/justificação.
-   Ação **Marcar todos como presentes**.
-   Ação **Limpar marcações da sessão**, apenas com confirmação e
    permissões adequadas.
-   Botão principal **Guardar presenças**.
-   Feedback claro de sucesso ou erro.
-   Aviso de alterações não guardadas ao sair da página.

A lista deve ser carregada automaticamente a partir dos participantes
inscritos na turma. Não permitir registar presenças de pessoas que não
estejam inscritas, salvo se já existir um fluxo administrativo explícito
para inscrições excecionais.

### Fluxo de utilização

1.  O formador ou administrador abre uma turma.
2.  Entra em **Presenças**.
3.  Seleciona uma sessão existente.
4.  O sistema apresenta os participantes inscritos.
5.  O responsável marca o estado de cada participante e, quando
    necessário, regista horas e observações.
6.  Clica em **Guardar presenças**.
7.  O sistema valida e guarda os registos.
8.  Os indicadores e relatórios são atualizados.

## 5. Gestão de sessões

A secção **Sessões** deve permitir:

-   Criar sessão.
-   Editar sessão.
-   Consultar detalhes.
-   Cancelar sessão.
-   Definir data, início, fim, formador e modalidade.
-   Consultar se as presenças já foram registadas.

Impedir sessões duplicadas apenas quando houver conflito real segundo as
regras da aplicação; não bloquear automaticamente sessões no mesmo dia
se forem horários distintos.

Uma sessão cancelada não deve contar para o cálculo de assiduidade.
Preservar o histórico dos registos caso uma sessão seja cancelada, sem
os apagar silenciosamente.

## 6. Cálculo da assiduidade

Calcular a assiduidade individual por turma com base nas sessões
concluídas e elegíveis.

Fórmula base:

`Taxa de presença (%) = (sessões contabilizadas como presença / total de sessões elegíveis) × 100`

Definir de forma explícita e configurável quais os estados que contam
como presença. Por defeito recomendado:

-   Presente: conta como presença.
-   Atrasado: conta como presença, podendo ser apresentado
    separadamente.
-   Ausente: não conta como presença.
-   Justificado: não conta como presença no cálculo base, mas deve poder
    ser excluído do denominador se essa for a política configurada pela
    organização.

Sessões agendadas, em curso ou canceladas não devem entrar no cálculo
final. Evitar divisão por zero: quando não existirem sessões elegíveis,
apresentar "Ainda sem dados" ou equivalente.

Apresentar a taxa individual e, quando útil, a taxa geral da turma.

### Critério mínimo

Permitir configurar uma percentagem mínima de presença para
conclusão/certificação, ao nível adequado à arquitetura existente
(curso, turma ou política da organização).

Não fixar 75% como regra universal. Se for usado como valor inicial,
deve ser configurável e claramente identificado como predefinição.

A elegibilidade para certificado deve respeitar as regras de conclusão
já existentes na Innova. Não alterar automaticamente o mecanismo atual
de certificados sem verificar as dependências.

## 7. Relatórios

Criar uma área de relatórios dentro da turma, com:

### Relatório geral da turma

-   Total de participantes inscritos.
-   Total de sessões realizadas.
-   Presenças, ausências, atrasos e justificações.
-   Taxa média de presença.
-   Participantes abaixo do mínimo exigido.

### Relatório individual

Para cada participante:

-   Nome e identificador.
-   Curso e turma.
-   Número de sessões elegíveis.
-   Número de presenças.
-   Número de faltas.
-   Número de atrasos.
-   Número de faltas justificadas.
-   Percentagem de presença.
-   Situação face ao mínimo de assiduidade.

### Exportação

Permitir exportar, se a plataforma já tiver suporte ou se for viável
dentro da stack atual:

-   PDF.
-   Excel/CSV.

O relatório deve indicar a turma, o curso, o período, a data de emissão
e os critérios usados no cálculo.

## 8. Métodos de registo --- fases de implementação

### Fase 1 --- Registo manual (obrigatória)

Implementar primeiro o registo manual descrito neste documento. É o
fluxo base e deve funcionar sem serviços externos.

### Fase 2 --- QR Code (preparar, não implementar sem validação)

Possibilitar futuramente que cada sessão gere um QR Code temporário para
check-in dos participantes.

Requisitos futuros:

-   Código único por sessão e com validade limitada.
-   Autenticação do participante.
-   Validação de que o participante está inscrito na turma.
-   Janela de check-in configurável.
-   Proteção contra reutilização indevida e submissões duplicadas.
-   Registo do método e timestamp.
-   Possibilidade de revisão manual pelo formador.

Não considerar a leitura do QR Code, isoladamente, prova absoluta de
presença física.

### Fase 3 --- Presença em formações online (preparar, não implementar sem validação)

Futuramente, integrar com a solução de videoconferência utilizada pela
Innova ou recolher eventos de participação disponíveis.

Não considerar um simples login ou abertura da página como prova
suficiente de participação. Definir critérios de tempo mínimo, atividade
e tolerância, com transparência para os utilizadores.

## 9. Permissões e auditoria

Respeitar o sistema de perfis e permissões existente.

Permissões recomendadas:

-   **Super Admin:** configuração global e acesso administrativo
    conforme o modelo atual.
-   **Administrador de formação:** gerir turmas, sessões, participantes,
    presenças e relatórios dentro do âmbito autorizado.
-   **Formador:** consultar as suas turmas/sessões e registar presenças
    nas sessões autorizadas.
-   **Participante:** consultar a própria assiduidade, se essa
    funcionalidade estiver alinhada com a experiência atual.

Regras de segurança:

-   Validar permissões no backend/API, não apenas esconder botões no
    frontend.
-   Impedir que um formador altere turmas ou sessões fora do seu âmbito.
-   Guardar auditoria das alterações de presença: valor anterior, valor
    novo, utilizador, data/hora e motivo, quando aplicável.
-   Não permitir apagar silenciosamente registos já guardados.
-   Proteger dados pessoais e limitar a informação apresentada a cada
    perfil.

## 10. Requisitos técnicos e de qualidade

Antes de desenvolver:

1.  Inspecionar a estrutura atual do projeto e identificar o módulo
    Cursos/Turmas.
2.  Identificar framework, padrões de frontend/backend, ORM, base de
    dados e sistema de autenticação.
3.  Identificar entidades existentes para cursos, turmas, inscrições,
    utilizadores, formadores e certificados.
4.  Reutilizar componentes e estilos já existentes.
5.  Propor alterações ao modelo de dados antes de executar migrações.
6.  Garantir compatibilidade com dados já existentes.
7.  Implementar validações no frontend e no backend.
8.  Criar testes para cálculos, permissões, duplicação de registos e
    alterações de estado.
9.  Não introduzir dependências externas sem necessidade.
10. Não modificar módulos não relacionados.

### Validações mínimas

-   Um participante não pode ter dois registos de presença para a mesma
    sessão.
-   Apenas participantes inscritos e elegíveis aparecem na lista.
-   Uma sessão cancelada não conta para a assiduidade.
-   Sessões não concluídas não contam para o cálculo final.
-   A taxa de presença não pode ultrapassar 100% nem ser negativa.
-   A ausência de sessões deve ser tratada sem erro de divisão por zero.
-   Alterações de presença devem ficar auditadas.
-   Utilizadores sem permissão não podem consultar ou alterar dados fora
    do seu âmbito.

## 11. Critérios de aceitação

A implementação estará concluída quando:

-   [ ] As abas principais Cursos e Turmas continuam a funcionar.
-   [ ] Cada turma tem as secções Visão geral, Participantes, Sessões,
    Presenças e Relatórios.
-   [ ] É possível criar, editar e cancelar sessões.
-   [ ] A lista de presenças é preenchida automaticamente com os
    inscritos na turma.
-   [ ] É possível marcar Presente, Ausente, Atrasado e Justificado.
-   [ ] É possível registar horas e observações, quando aplicável.
-   [ ] É possível marcar todos como presentes.
-   [ ] Os registos são guardados e persistem após atualizar a página.
-   [ ] Os indicadores são atualizados corretamente.
-   [ ] A assiduidade individual e geral é calculada corretamente.
-   [ ] O critério mínimo de presença é configurável.
-   [ ] Os relatórios apresentam dados consistentes.
-   [ ] As permissões são verificadas no backend.
-   [ ] As alterações ficam registadas no histórico/auditoria.
-   [ ] Existem testes para os principais cenários.
-   [ ] O desenho visual é consistente com a identidade e os componentes
    atuais da Innova.

## 12. Instrução de execução para Claude Code

Trabalhe diretamente no repositório existente.

**Primeiro, analise e apresente um plano curto** com: - arquitetura e
ficheiros que serão afetados; - entidades/tabelas que serão reutilizadas
ou criadas; - alterações de API/backend; - alterações de interface; -
permissões e testes necessários.

Depois, implemente a solução por etapas, começando pelo modelo de dados
e fluxo manual de presenças. Execute os testes relevantes e corrija os
erros encontrados.

Não invente nomes de ficheiros, tabelas, rotas ou tecnologias antes de
inspecionar o projeto. Não apague nem substitua funcionalidades
existentes. Se encontrar uma decisão de negócio que não possa ser
deduzida com segurança, apresente a dúvida antes de assumir um
comportamento.

No final, entregue: 1. resumo do que foi implementado; 2. lista de
ficheiros alterados; 3. migrações executadas e instruções para as
aplicar noutros ambientes; 4. testes executados e respetivos resultados;
5. limitações ou decisões que ainda precisam de validação.
