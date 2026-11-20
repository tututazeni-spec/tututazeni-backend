# Implementação de uma Avaliação de Desempenho Robusta

## Instruções para o Claude Code

Analisa a arquitetura, as tecnologias, os padrões de desenvolvimento e
os módulos existentes no projeto antes de fazer alterações. Implementa
uma solução completa de Avaliação de Desempenho, integrada na estrutura
atual da plataforma, respeitando o design system, a autenticação, as
permissões, os padrões de código e as convenções já existentes.

**Não cries uma aplicação paralela nem substituas funcionalidades
existentes sem necessidade.** Reutiliza componentes, serviços, modelos,
tabelas, layouts e mecanismos de autorização existentes sempre que
adequado. Não te limites a criar uma interface visual: implementa também
persistência, validações, regras de negócio, cálculos, estados e
integração entre os módulos relevantes.

Antes de codificar: 1. Identifica o módulo atual de avaliação de
desempenho e os três campos existentes: Pontos Fortes, Áreas de Melhoria
e Recomendações. 2. Analisa como são geridos colaboradores, cargos,
departamentos, chefias, objetivos, competências, formações e permissões.
3. Identifica se já existem ciclos/períodos de avaliação, escalas de
classificação, formulários, notificações, relatórios ou planos de
desenvolvimento. 4. Apresenta um breve plano técnico e depois implementa
a solução de forma consistente com o projeto.

------------------------------------------------------------------------

# 1. Objetivo funcional

Transformar a avaliação de desempenho numa ferramenta estruturada de
gestão de pessoas, que permita:

-   Avaliar resultados, competências e comportamentos.
-   Registar pontos fortes com evidências concretas.
-   Identificar áreas de melhoria e respetivo nível de necessidade de
    desenvolvimento.
-   Criar recomendações e planos de ação mensuráveis.
-   Apoiar autoavaliações e avaliações pela chefia.
-   Permitir, se a arquitetura e as regras do projeto suportarem,
    avaliações 360°.
-   Acompanhar a evolução do colaborador entre ciclos de avaliação.
-   Gerar indicadores, relatórios e informação para decisões de RH.
-   Integrar necessidades de desenvolvimento com o módulo de Gestão de
    Formações, quando existir essa funcionalidade.

A avaliação deve ser justa, rastreável, configurável e baseada em
evidências. Não deve produzir conclusões automáticas sem dados
suficientes.

# 2. Estrutura geral da avaliação

Organizar o processo em três dimensões:

1.  **Resultados:** o que o colaborador alcança.
2.  **Competências:** o que sabe e consegue fazer.
3.  **Comportamentos:** como executa o trabalho e se relaciona com os
    outros.

A avaliação deve permitir configurar critérios diferentes por cargo,
função, departamento ou grupo de colaboradores. Não assumir que todos os
cargos devem ser avaliados exatamente pelos mesmos critérios.

## 2.1. Dimensões e critérios de avaliação

Disponibilizar, como conjunto inicial configurável, os seguintes
critérios:

  -----------------------------------------------------------------------
  Dimensão                            Critérios / aspetos observáveis
  ----------------------------------- -----------------------------------
  Qualidade do Trabalho               Precisão, rigor, organização,
                                      cumprimento de padrões e atenção
                                      aos detalhes.

  Produtividade e Resultados          Volume de trabalho, eficiência,
                                      produtividade e resultados
                                      alcançados.

  Cumprimento de Objetivos            Cumprimento de metas individuais,
                                      objetivos definidos e prazos.

  Conhecimentos Técnicos              Domínio das funções, conhecimentos
                                      profissionais e utilização de
                                      ferramentas.

  Responsabilidade e Compromisso      Assiduidade, pontualidade,
                                      disciplina e cumprimento das
                                      responsabilidades.

  Comunicação                         Clareza, escuta ativa, partilha de
                                      informação e relacionamento
                                      interpessoal.

  Trabalho em Equipa                  Colaboração, partilha de
                                      conhecimentos e apoio aos colegas.

  Iniciativa e Proatividade           Antecipação de problemas,
                                      autonomia, iniciativa e propostas
                                      de melhoria.

  Adaptação e Aprendizagem            Abertura à mudança, aprendizagem
                                      contínua e aplicação de novos
                                      conhecimentos.

  Ética e Conduta Profissional        Integridade, respeito,
                                      confidencialidade e cumprimento das
                                      normas e valores.
  -----------------------------------------------------------------------

Para cargos de liderança, permitir critérios adicionais, por exemplo:

-   Liderança e capacidade de motivar equipas.
-   Tomada de decisão.
-   Gestão de equipas e conflitos.
-   Planeamento e organização.
-   Desenvolvimento de pessoas.
-   Gestão de resultados.
-   Alinhamento estratégico.

Os critérios devem ser configuráveis. Permitir ativar, desativar,
editar, ordenar e associar critérios a cargos, departamentos ou modelos
de avaliação, conforme as permissões existentes.

# 3. Escala de avaliação de desempenho de 1 a 5

Utilizar uma escala padronizada de cinco níveis para pontuar o
desempenho nas competências e critérios avaliáveis.

  ------------------------------------------------------------------------
                          Nota Classificação         Descrição
  ---------------------------- --------------------- ---------------------
                             1 Muito fraco           Não demonstra a
                                                     competência ou
                                                     apresenta desempenho
                                                     muito abaixo do
                                                     esperado.

                             2 Insuficiente          Demonstra a
                                                     competência de forma
                                                     limitada e abaixo do
                                                     esperado.

                             3 Bom                   Cumpre o nível de
                                                     desempenho esperado.

                             4 Muito bom             Demonstra desempenho
                                                     acima do esperado com
                                                     consistência.

                             5 Excelente             Demonstra domínio
                                                     elevado e supera
                                                     consistentemente as
                                                     expectativas.
  ------------------------------------------------------------------------

Requisitos da escala: - Mostrar sempre o significado de cada nível junto
ao controlo de pontuação, por exemplo através de legenda, tooltip ou
texto auxiliar. - Não apresentar apenas números sem explicação. -
Permitir selecionar uma única nota por critério. - Validar que a nota
está entre 1 e 5. - Permitir comentário e evidência associados à
classificação, quando aplicável. - Não atribuir automaticamente uma nota
quando o avaliador não respondeu. - Distinguir claramente campos não
avaliados de notas zero. A escala não inclui zero. - Se existir a opção
"Não aplicável", tratá-la separadamente e excluí-la dos cálculos,
registando a justificação quando necessário.

## 3.1. Apresentação visual da escala

Utilizar um controlo de seleção de 1 a 5, como botões segmentados,
estrelas numeradas ou escala horizontal.

A interface deve indicar visualmente a opção selecionada e a respetiva
descrição. Garantir acessibilidade por teclado, contraste adequado e
utilização em ecrãs pequenos.

# 4. Secção Pontos Fortes

Manter a secção **Pontos Fortes**, transformando-a num registo
estruturado de competências e comportamentos positivos.

Cada ponto forte deve permitir registar:

  -----------------------------------------------------------------------
  Campo                   Obrigatório?            Descrição
  ----------------------- ----------------------- -----------------------
  Competência             Sim                     Critério ou competência
  identificada                                    em que o colaborador se
                                                  destaca.

  Pontuação               Sim                     Nota de 1 a 5, segundo
                                                  a escala de desempenho.

  Descrição               Sim                     Explicação do ponto
                                                  forte identificado.

  Evidência / Exemplo     Recomendado             Situação, comportamento
                                                  ou resultado concreto
                                                  que sustenta a
                                                  avaliação.

  Impacto organizacional  Recomendado             Contributo para a
                                                  equipa, departamento ou
                                                  organização.

  Comentário adicional    Não                     Observações
                                                  complementares.
  -----------------------------------------------------------------------

Funcionalidades: - Permitir adicionar vários pontos fortes. - Permitir
editar e remover registos antes da submissão final, respeitando as
permissões. - Permitir associar um ponto forte a uma competência já
existente. - Permitir pesquisar e selecionar competências do catálogo,
quando existir. - Apresentar a pontuação e a descrição do nível
selecionado. - Exigir evidências ou justificações conforme a
configuração do processo. - Evitar duplicados desnecessários da mesma
competência no mesmo registo de avaliação.

A pontuação dos pontos fortes representa o nível de desempenho
demonstrado naquela competência. Uma nota elevada não deve ser atribuída
sem fundamentação quando a política da organização exigir evidências.

# 5. Secção Áreas de Melhoria

Utilizar a designação **Áreas de Melhoria**. Não utilizar "Falhas de
Melhoria".

Esta secção identifica competências, resultados ou comportamentos que
precisam de desenvolvimento.

Cada área de melhoria deve conter:

  -----------------------------------------------------------------------
  Campo                   Obrigatório?            Descrição
  ----------------------- ----------------------- -----------------------
  Competência / área      Sim                     Competência ou aspeto
  identificada                                    que precisa de
                                                  evolução.

  Pontuação de desempenho Sim                     Nota de 1 a 5, usando a
                                                  escala geral de
                                                  desempenho.

  Descrição da            Sim                     Explicação objetiva do
  necessidade                                     que precisa de
                                                  melhorar.

  Evidência / Exemplo     Recomendado             Situação observável que
                                                  fundamenta a
                                                  identificação.

  Impacto no desempenho   Recomendado             Consequência da lacuna
                                                  para o trabalho ou
                                                  resultados.

  Prioridade de           Sim                     Baixa, média, alta ou
  desenvolvimento                                 crítica.

  Comentário adicional    Não                     Observações
                                                  complementares.
  -----------------------------------------------------------------------

## 5.1. Interpretação da pontuação nas áreas de melhoria

**Importante:** a nota nesta secção continua a representar o desempenho
atual, e não a gravidade da necessidade de melhoria.

Exemplos: - Nota 1: desempenho muito abaixo do esperado; necessidade de
desenvolvimento muito significativa. - Nota 2: desempenho abaixo do
esperado; necessidade de desenvolvimento. - Nota 3: desempenho esperado;
pode existir oportunidade de aperfeiçoamento. - Nota 4: desempenho acima
do esperado; normalmente não deve ser classificado como uma lacuna sem
justificação específica. - Nota 5: desempenho excelente; normalmente
deve ser registado como ponto forte, salvo se existir uma necessidade de
evolução futura claramente fundamentada.

A **prioridade de desenvolvimento** deve ser um campo separado da
nota: - Baixa. - Média. - Alta. - Crítica.

Não confundir pontuação de desempenho com prioridade. Uma nota baixa
pode exigir prioridade alta ou crítica, mas a prioridade deve considerar
também o impacto, o risco e o contexto da função.

# 6. Secção Recomendações e Plano de Ação

Transformar **Recomendações** numa área estruturada para converter as
conclusões da avaliação em ações concretas.

Não utilizar apenas uma caixa de texto livre. Permitir criar vários
registos de recomendação.

Cada recomendação deve conter:

  -----------------------------------------------------------------------
  Campo                   Obrigatório?            Descrição
  ----------------------- ----------------------- -----------------------
  Ação recomendada        Sim                     Ação concreta a
                                                  executar.

  Área de melhoria        Recomendado             Ligação à área de
  relacionada                                     melhoria que originou a
                                                  ação.

  Objetivo pretendido     Sim                     Resultado que se
                                                  pretende alcançar.

  Tipo de ação            Sim                     Formação, mentoria,
                                                  acompanhamento,
                                                  coaching, projeto
                                                  prático, alteração de
                                                  processo ou outra.

  Responsável             Recomendado             Pessoa responsável pela
                                                  execução ou
                                                  acompanhamento.

  Prazo                   Recomendado             Data prevista para
                                                  conclusão.

  Indicador de sucesso    Sim                     Evidência ou métrica
                                                  que permitirá verificar
                                                  o resultado.

  Prioridade              Sim                     Escala de 1 a 5, em que
                                                  1 é baixa e 5 é
                                                  crítica.

  Estado                  Sim                     Pendente, Em curso,
                                                  Concluída, Cancelada ou
                                                  equivalente adotado no
                                                  projeto.

  Percentagem de          Conforme estado         Progresso da ação,
  conclusão                                       quando aplicável.

  Comentários /           Não                     Registo de
  evidências                                      acompanhamento e
                                                  resultados.
  -----------------------------------------------------------------------

## 6.1. Regras para recomendações

-   Permitir associar uma ou mais recomendações a uma área de melhoria.
-   Permitir criar recomendações independentes quando justificável.
-   Permitir acompanhar o estado e o progresso.
-   Registar datas de criação, atualização e conclusão.
-   Registar quem criou, alterou ou concluiu a ação, conforme o sistema
    de auditoria existente.
-   Não marcar automaticamente uma ação como concluída apenas porque a
    formação foi frequentada; exigir a regra de conclusão definida no
    projeto.
-   Permitir atualizar o indicador de sucesso e registar evidências de
    conclusão.
-   Alertar para ações atrasadas, se o sistema já possuir notificações
    ou tarefas.
-   Permitir consultar recomendações de avaliações anteriores.

## 6.2. Integração com Gestão de Formações

Quando existir o módulo de Gestão de Formações: - Permitir selecionar
uma formação existente como recomendação. - Permitir encaminhar uma
necessidade de formação para o processo adequado do módulo. - Reutilizar
os registos reais de formações, inscrições, presenças e conclusão
existentes. - Associar a formação à avaliação e à área de melhoria de
origem. - Apresentar o estado real da formação, sem inventar ou duplicar
estados. - Permitir recomendar formação sem obrigar à criação automática
de uma inscrição. - Respeitar permissões e regras de inscrição já
existentes.

Se a integração ainda não for tecnicamente possível, criar uma
associação preparada para evolução futura, sem simular uma integração
inexistente.

# 7. Cálculo da classificação global

Implementar cálculo automático da classificação, apenas com base em
critérios efetivamente avaliados.

## 7.1. Ponderações iniciais sugeridas

Utilizar os seguintes pesos como configuração inicial, não como valores
fixos no código:

  Critério                               Peso
  -------------------------------- ----------
  Qualidade do Trabalho                   15%
  Produtividade e Resultados              15%
  Cumprimento de Objetivos                20%
  Conhecimentos Técnicos                  10%
  Responsabilidade e Compromisso          10%
  Comunicação                              5%
  Trabalho em Equipa                       5%
  Iniciativa e Proatividade                5%
  Adaptação e Aprendizagem                 5%
  Ética e Conduta Profissional            10%
  **Total**                          **100%**

Os pesos devem poder ser configurados por modelo de avaliação ou grupo
de funções, conforme as regras de negócio do projeto.

## 7.2. Fórmula

Quando todos os critérios aplicáveis estiverem avaliados:

**Classificação ponderada = soma de (nota do critério × peso do
critério) / soma dos pesos aplicáveis.**

Apresentar o resultado numa escala de 1 a 5, com precisão consistente
(por exemplo, duas casas decimais).

Regras: - Critérios não aplicáveis não entram no denominador. -
Critérios sem resposta não devem ser tratados como zero. - Não permitir
finalizar uma avaliação se faltarem critérios obrigatórios. - Mostrar a
percentagem de preenchimento antes da submissão. - Se houver pesos
configurados, validar que a soma dos pesos dos critérios aplicáveis está
correta segundo o modelo. - Se a avaliação estiver incompleta,
apresentar "Em avaliação" ou "Incompleta", sem exibir uma classificação
final enganadora. - Não incluir a prioridade das áreas de melhoria nem a
prioridade das recomendações no cálculo da classificação global. - Não
calcular a média das secções Pontos Fortes e Áreas de Melhoria como se
fossem duas avaliações independentes. A classificação global deve
resultar dos critérios de desempenho definidos no modelo.

## 7.3. Interpretação da classificação final

Como referência inicial configurável:

      Resultado Classificação
  ------------- ---------------
    1,00 a 1,49 Muito fraco
    1,50 a 2,49 Insuficiente
    2,50 a 3,49 Bom
    3,50 a 4,49 Muito bom
    4,50 a 5,00 Excelente

Validar os limites e evitar lacunas ou sobreposições. Permitir que RH
configure os intervalos e respetivas designações.

# 8. Modalidades de avaliação

Analisar as funcionalidades existentes e implementar, quando compatível
com a arquitetura:

-   **Autoavaliação:** o colaborador avalia o próprio desempenho.
-   **Avaliação pela chefia:** o superior hierárquico avalia o
    colaborador.
-   **Avaliação 360°:** participação de colegas, subordinados e outros
    avaliadores autorizados.
-   **Avaliação consolidada:** RH ou responsável autorizado consulta e
    consolida os resultados, quando o processo exigir.

Regras: - Cada avaliação deve identificar o avaliador e o tipo de
avaliação. - Respeitar a hierarquia e as permissões. - Evitar que um
colaborador consulte avaliações confidenciais às quais não tem acesso. -
Permitir configurar se o colaborador pode ver a identidade dos
avaliadores. - Não misturar automaticamente notas de autoavaliação e
chefia sem uma regra de ponderação explícita. - Se houver avaliação
360°, permitir configurar os grupos de avaliadores e respetivos pesos. -
Guardar separadamente as respostas de cada avaliador e a consolidação
final.

# 9. Ciclos e períodos de avaliação

Verificar se o projeto já possui ciclos de avaliação. Reutilizar essa
funcionalidade.

Se necessário, permitir configurar: - Nome do ciclo. - Data de início e
fim. - Período de referência. - Colaboradores abrangidos. -
Departamentos e cargos abrangidos. - Modelo de avaliação. - Tipos de
avaliadores. - Prazo para autoavaliação. - Prazo para avaliação da
chefia. - Estado do ciclo: planeado, aberto, em curso, encerrado ou
cancelado.

Não permitir alterações a avaliações encerradas sem autorização
específica e registo de auditoria.

# 10. Fluxo de trabalho e estados

Implementar ou adaptar o fluxo de acordo com o sistema atual:

1.  RH configura o ciclo e o modelo de avaliação.
2.  O sistema associa os colaboradores e avaliadores elegíveis.
3.  O colaborador realiza a autoavaliação, se ativada.
4.  A chefia realiza a avaliação.
5.  São registados critérios, pontuações, pontos fortes e áreas de
    melhoria.
6.  São criadas recomendações e ações de desenvolvimento.
7.  A avaliação é submetida para validação, se aplicável.
8.  RH ou responsável autorizado valida e encerra a avaliação.
9.  O colaborador consulta o resultado, de acordo com as permissões.
10. As ações de desenvolvimento são acompanhadas até à conclusão.
11. No ciclo seguinte, é possível comparar a evolução.

Estados possíveis da avaliação: - Rascunho. - Em preenchimento. -
Submetida. - Em validação. - Devolvida para correção. - Aprovada. -
Encerrada. - Cancelada.

Adaptar os nomes e transições aos estados já existentes, evitando
duplicações.

# 11. Plano de Desenvolvimento Individual (PDI)

Criar ou integrar um Plano de Desenvolvimento Individual associado à
avaliação.

O PDI deve reunir as recomendações e ações resultantes da avaliação e
permitir:

-   Identificar a competência a desenvolver.
-   Definir o objetivo de desenvolvimento.
-   Definir ações concretas.
-   Associar formações, mentoria ou projetos práticos.
-   Definir responsável e prazo.
-   Definir indicadores de sucesso.
-   Acompanhar o estado e a percentagem de conclusão.
-   Registar evidências e comentários de acompanhamento.
-   Consultar o histórico de desenvolvimento.

O PDI não deve ser apenas um texto. Deve ser composto por ações
rastreáveis e mensuráveis.

# 12. Relatórios e indicadores

Criar ou adaptar dashboards e relatórios com base nos dados reais da
avaliação.

Indicadores recomendados: - Classificação média geral. - Classificação
média por departamento. - Classificação média por cargo. - Classificação
média por competência. - Distribuição de colaboradores por nível de
desempenho. - Avaliações concluídas, pendentes e em atraso. - Principais
pontos fortes identificados. - Áreas de melhoria mais recorrentes. -
Necessidades de formação identificadas. - Recomendações por estado e
prioridade. - Percentagem de conclusão dos planos de desenvolvimento. -
Evolução das classificações entre ciclos.

Permitir filtros por: - Ciclo/período. - Departamento. - Unidade/área. -
Cargo. - Colaborador. - Estado. - Tipo de avaliação.

Garantir que cada utilizador só vê os dados autorizados. Dados
individuais e comentários confidenciais não devem ser expostos em
relatórios agregados de forma que permita identificar indevidamente um
colaborador.

# 13. Histórico e comparação de avaliações

Guardar o histórico de cada avaliação e permitir comparar ciclos
anteriores.

Apresentar: - Classificação global atual e anterior. - Evolução por
competência. - Pontos fortes mantidos ou desenvolvidos. - Áreas de
melhoria resolvidas e ainda pendentes. - Recomendações concluídas e em
atraso. - Evolução dos indicadores do PDI.

Não comparar avaliações de modelos incompatíveis sem indicar a
limitação. Se os critérios ou pesos mudarem entre ciclos, identificar
essa alteração e evitar conclusões enganosas.

# 14. Experiência de utilização e interface

Manter o design system e os padrões visuais existentes.

A interface deve ser moderna, clara, responsiva e simples de utilizar.

Recomendações: - Organizar o formulário por secções ou separadores. -
Mostrar progresso de preenchimento. - Distinguir visualmente Pontos
Fortes, Áreas de Melhoria e Recomendações. - Apresentar a escala 1--5 de
forma consistente. - Mostrar a descrição da nota selecionada. - Permitir
adicionar vários registos em cada secção. - Utilizar campos de texto com
instruções e exemplos úteis. - Permitir guardar rascunhos. - Pedir
confirmação antes de submeter ou encerrar. - Mostrar mensagens de
validação claras. - Garantir utilização em desktop, tablet e
telemóvel. - Não sobrecarregar o formulário com todos os campos
expandidos simultaneamente; utilizar cartões, acordeões ou etapas quando
fizer sentido. - Não utilizar apenas cores para comunicar classificação
ou estado; incluir texto e ícones acessíveis.

Textos auxiliares sugeridos: - Pontos Fortes: "Registe competências e
comportamentos positivos, acompanhados de exemplos concretos." - Áreas
de Melhoria: "Identifique aspetos que necessitam de desenvolvimento e
fundamente a avaliação com situações observáveis." - Recomendações:
"Defina ações práticas, responsáveis, prazos e indicadores para
acompanhar a evolução."

# 15. Validações e qualidade dos dados

Implementar validações no frontend e backend.

-   Notas limitadas a valores válidos de 1 a 5.
-   Campos obrigatórios validados antes da submissão.
-   Pesos dentro dos limites permitidos e soma coerente.
-   Datas válidas e prazos consistentes.
-   Responsáveis e avaliadores existentes e autorizados.
-   Impedir submissões duplicadas indevidas.
-   Impedir edição de avaliações encerradas por utilizadores sem
    permissão.
-   Validar relações entre avaliação, colaborador, ciclo, avaliador e
    departamento.
-   Sanitizar e validar conteúdos introduzidos pelo utilizador.
-   Tratar corretamente campos opcionais e "Não aplicável".
-   Garantir que avaliações incompletas não geram resultados finais.

# 16. Segurança, permissões e auditoria

Respeitar o sistema de autenticação e autorização existente.

Definir permissões coerentes para: - Administrador. - RH. -
Gestor/chefia. - Avaliador. - Colaborador avaliado.

As permissões devem controlar, no mínimo: - Criar e configurar ciclos. -
Configurar critérios e pesos. - Iniciar avaliações. - Preencher
avaliações. - Consultar avaliações. - Submeter, devolver, aprovar e
encerrar. - Criar e acompanhar recomendações. - Consultar relatórios. -
Consultar avaliações anteriores.

Registar auditoria para operações relevantes: - Criação e alteração de
avaliações. - Alteração de pontuações. - Submissão e aprovação. -
Reabertura ou cancelamento. - Alterações de recomendações e PDI.

Não confiar apenas em controlos de interface. Aplicar as permissões
também no backend/API.

# 17. Requisitos técnicos de implementação

-   Respeitar a arquitetura e as tecnologias existentes.
-   Reutilizar componentes e serviços do projeto.
-   Criar ou atualizar migrations de base de dados quando necessário.
-   Garantir relações e integridade referencial.
-   Criar índices adequados para consultas frequentes, quando
    necessário.
-   Evitar duplicação de lógica entre frontend e backend.
-   Centralizar regras de cálculo e validação no backend ou numa camada
    de domínio reutilizável.
-   Garantir que os cálculos apresentados no frontend correspondem aos
    valores persistidos e validados no backend.
-   Tratar erros de rede, permissões e falhas de validação.
-   Não introduzir dependências sem necessidade.
-   Não eliminar dados existentes.
-   Se for necessário alterar estruturas existentes, criar migrations
    seguras e compatíveis com os dados atuais.
-   Garantir que a solução não quebra os restantes módulos.

# 18. Critérios de aceitação

Considerar a implementação concluída apenas quando os seguintes cenários
forem testados:

1.  RH consegue configurar um modelo com critérios e pesos.
2.  É possível associar critérios diferentes a diferentes cargos ou
    grupos, conforme a configuração.
3.  Um avaliador consegue atribuir notas de 1 a 5 e consultar a legenda
    da escala.
4.  É possível adicionar vários pontos fortes com descrição, evidência e
    pontuação.
5.  É possível adicionar várias áreas de melhoria com nota de
    desempenho, evidência e prioridade separada.
6.  É possível criar várias recomendações com objetivo, responsável,
    prazo, indicador, prioridade e estado.
7.  Uma recomendação pode ser associada à área de melhoria que lhe deu
    origem.
8.  A classificação ponderada é calculada corretamente.
9.  Critérios não aplicáveis são excluídos do cálculo conforme as regras
    definidas.
10. Avaliações incompletas não apresentam uma classificação final como
    se estivessem concluídas.
11. O sistema impede submissões inválidas ou duplicadas indevidas.
12. As permissões são verificadas no backend.
13. O histórico de avaliações é preservado.
14. O PDI permite acompanhar ações e respetiva evolução.
15. A integração com Gestão de Formações utiliza dados reais, quando
    disponível.
16. Os relatórios apresentam dados coerentes com as avaliações
    guardadas.
17. A interface funciona em desktop e dispositivos móveis.
18. As funcionalidades existentes continuam a funcionar.
19. As migrations e testes são executados sem erros.
20. Não existem erros críticos na consola, API ou logs relacionados com
    a implementação.

# 19. Testes a implementar

Criar ou atualizar testes para:

-   Cálculo da classificação ponderada.
-   Validação de notas fora do intervalo.
-   Exclusão de critérios não aplicáveis.
-   Tratamento de avaliações incompletas.
-   Validação da soma dos pesos.
-   Criação, edição e remoção de pontos fortes.
-   Criação e atualização de áreas de melhoria.
-   Criação, associação e conclusão de recomendações.
-   Permissões por perfil.
-   Proteção de avaliações encerradas.
-   Histórico e comparação de ciclos.
-   Integração com formações, se aplicável.

Testar também casos extremos, como: - Avaliação sem critérios
respondidos. - Todos os critérios não aplicáveis. - Alteração de pesos
após início do ciclo. - Avaliador sem autorização. - Colaborador
transferido de departamento durante o ciclo. - Tentativa de consultar
avaliação de outro colaborador. - Reabertura de avaliação encerrada.

# 20. Entrega e relatório final

Depois de implementar:

1.  Apresenta os módulos, páginas e componentes alterados.
2.  Lista as migrations e alterações de base de dados.
3.  Explica as regras de cálculo implementadas.
4.  Explica os perfis e permissões aplicados.
5.  Indica as integrações realizadas com outros módulos.
6.  Apresenta os testes executados e respetivos resultados.
7.  Identifica claramente qualquer funcionalidade que não tenha sido
    possível concluir e explica o motivo.
8.  Não declares uma funcionalidade como concluída se apenas tiver sido
    criada a interface sem persistência ou lógica funcional.

**Prioridade de implementação:** primeiro garantir um fluxo de avaliação
funcional, com critérios, escala 1--5, Pontos Fortes, Áreas de Melhoria,
Recomendações, cálculo correto, persistência e permissões. Em seguida,
implementar PDI, integração com formações, histórico e relatórios,
respeitando a arquitetura existente.

O resultado deve ser uma solução de avaliação de desempenho robusta,
profissional, configurável e pronta para utilização real numa
organização.
