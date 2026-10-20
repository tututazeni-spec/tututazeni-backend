# PROMPT PARA CLAUDE CODE — CORRIGIR A RECICLAGEM E A EMISSÃO DE CERTIFICADOS

## 1. Contexto

Estou a desenvolver uma plataforma de Academia Corporativa e RH que possui os módulos Cursos, Gestão de Formações e Certificados.

Existe atualmente a seguinte pendência:

> Reciclagem automática por matrícula: não é possível, porque a matrícula tem unicidade (curso, utilizador). O alerta de validade encaminha o colaborador para refazer a formação, sem o matricular.

Quero resolver definitivamente esta limitação, implementando uma arquitetura correta para permitir múltiplas realizações do mesmo curso pelo mesmo colaborador, com emissão de novos certificados e preservação do histórico.

## 2. Primeira etapa: analisar o código existente

Antes de modificar qualquer ficheiro:

1. Analisa a arquitetura atual do projeto.
2. Identifica o módulo de Cursos, a aba Certificados e o módulo Gestão de Formações.
3. Identifica os modelos, tabelas, entidades, relacionamentos, controladores, serviços, componentes, APIs e tarefas automáticas relacionados com matrículas, conclusões, certificados e validade.
4. Localiza a restrição de unicidade `(curso, utilizador)` e determina a sua finalidade.
5. Identifica como são calculadas as datas de validade, como funcionam os alertas e como é emitido o certificado atual.
6. Verifica se já existe algum mecanismo de tentativas, sessões, edições, realizações ou histórico de formação que possa ser reutilizado.
7. Identifica as dependências desta lógica noutros módulos, relatórios, dashboards e indicadores.

Não assumas tecnologias, estruturas de tabelas ou funcionalidades que não existam no projeto. Baseia as alterações no código real encontrado.

## 3. Arquitetura funcional pretendida

Implementa uma solução que distinga claramente:

- **Matrícula:** inscrição do colaborador num curso.
- **Realização da formação:** cada participação ou tentativa de conclusão do curso.
- **Certificado:** documento emitido para uma realização elegível.
- **Reciclagem:** nova realização do mesmo curso, motivada pela validade, por uma regra de formação obrigatória ou por decisão do RH.

A mesma matrícula poderá estar associada a várias realizações ao longo do tempo, caso esta seja a arquitetura mais compatível com o projeto existente.

Se já existir um modelo adequado de realizações ou tentativas, reutiliza-o. Caso contrário, implementa a estrutura necessária.

**Não elimines automaticamente a restrição de unicidade da matrícula.** Mantém-na quando representar corretamente a inscrição principal. Se a análise demonstrar que a restrição está aplicada à entidade errada, altera-a de forma controlada, documentada e compatível com os dados existentes.

## 4. Reciclagem automática e manual

Implementa os dois modos, configuráveis por curso ou formação, quando compatíveis com a arquitetura existente.

### Modo automático

- Detetar certificados próximos do vencimento e certificados expirados.
- Respeitar a antecedência, a validade e as regras de reciclagem configuradas.
- Notificar o colaborador e os responsáveis definidos.
- Criar ou agendar a nova realização da formação de acordo com as regras existentes.
- Evitar criar matrículas ou realizações duplicadas.
- Permitir acompanhar o estado da reciclagem.
- Após a conclusão efetiva da formação e a validação dos requisitos, emitir um novo certificado.
- Calcular a nova validade segundo a política definida para o curso.

### Modo manual

- Permitir ao RH ou ao responsável pela formação iniciar uma reciclagem.
- Permitir acompanhar a inscrição, a realização, a conclusão e a emissão do novo certificado.
- Preservar o histórico do certificado anterior.
- Impedir a emissão de certificados sem que os requisitos de conclusão tenham sido satisfeitos.

Se a infraestrutura atual não suportar tarefas automáticas, identifica a solução compatível com o projeto e implementa-a sem simular funcionalidades que não estejam efetivamente operacionais.

## 5. Emissão e histórico de certificados

Cada conclusão elegível deverá gerar um certificado distinto, com os campos necessários e compatíveis com o sistema atual, incluindo:

- Identificador único.
- Colaborador.
- Curso ou formação.
- Realização associada.
- Data de conclusão.
- Data de emissão.
- Data de validade, quando aplicável.
- Estado do certificado.
- Dados de autenticidade ou verificação, se já suportados pelo sistema.

Regras obrigatórias:

1. Nunca sobrescrever o certificado histórico quando for emitido um novo.
2. Preservar certificados expirados, anteriores e substituídos.
3. Distinguir o certificado vigente dos certificados históricos.
4. Não considerar um certificado expirado como válido apenas porque existe um novo processo de reciclagem.
5. Não emitir automaticamente um certificado apenas porque o colaborador foi inscrito ou porque a formação foi agendada.
6. Garantir que cada realização elegível gera, no máximo, um certificado para a mesma operação lógica.
7. Manter a possibilidade de consultar, descarregar e verificar os certificados, respeitando as funcionalidades existentes.

## 6. Integração com os módulos existentes

Garante que a implementação funciona de forma consistente nos módulos Cursos, Gestão de Formações e Certificados.

Verifica e atualiza, quando necessário:

- Listagens e detalhes de matrículas.
- Histórico de realizações e reciclagens.
- Estados de conclusão.
- Listagens de certificados.
- Indicadores de certificados válidos, expirados e próximos do vencimento.
- Alertas e notificações.
- Relatórios de formação e de conformidade.
- Pesquisa, filtros, permissões e exportações existentes.

Evita duplicar funcionalidades entre os módulos. Reutiliza os serviços e componentes existentes sempre que adequado.

A interface deve permitir distinguir claramente a matrícula, cada realização da formação e cada certificado emitido.

## 7. Segurança, integridade e migrações

Antes de alterar a base de dados:

1. Verifica os dados existentes e as relações entre as entidades.
2. Planeia as migrações necessárias.
3. Preserva todas as matrículas, conclusões e certificados existentes.
4. Não elimines nem recries dados de produção.
5. Não removas restrições de integridade sem uma justificação técnica.
6. Garante que as novas relações não criam registos órfãos.
7. Respeita as permissões e os limites de acesso dos utilizadores.
8. Implementa operações idempotentes para impedir duplicações em reprocessamentos e execuções simultâneas.
9. Mantém a compatibilidade com os restantes módulos e com os dados históricos.
10. Segue os padrões de código, testes e migrações já adotados pelo projeto.

## 8. Testes obrigatórios

Cria ou atualiza testes para verificar, no mínimo:

- Primeira inscrição e primeira conclusão de um curso.
- Emissão do primeiro certificado.
- Nova realização do mesmo curso pelo mesmo colaborador.
- Reciclagem manual.
- Reciclagem automática.
- Deteção de certificados próximos do vencimento e expirados.
- Emissão de um novo certificado após a conclusão da reciclagem.
- Preservação dos certificados anteriores.
- Atualização correta do certificado vigente.
- Prevenção de matrículas, realizações e certificados duplicados.
- Reprocessamento de tarefas automáticas sem efeitos duplicados.
- Funcionamento das permissões e dos relatórios.
- Compatibilidade com os dados e funcionalidades já existentes.

## 9. Critérios de aceitação

Considera o trabalho concluído apenas quando:

1. Um colaborador puder realizar novamente o mesmo curso sem erros de unicidade.
2. Cada realização elegível puder originar um certificado distinto.
3. Os certificados anteriores continuarem disponíveis no histórico.
4. A validade do certificado vigente for calculada corretamente.
5. A reciclagem manual e automática funcionar de acordo com a configuração definida.
6. Os alertas e indicadores refletirem o estado real dos certificados.
7. Os módulos Cursos, Gestão de Formações e Certificados continuarem funcionais.
8. As migrações e os testes necessários forem concluídos com sucesso.
9. Não existirem duplicações nem perda de dados.

## 10. Execução e relatório final

Executa o trabalho no código real do projeto, não te limites a apresentar sugestões.

Segue esta ordem:

1. Analisa e apresenta um resumo curto da arquitetura e da causa do problema.
2. Define a estratégia de implementação mais segura.
3. Implementa as alterações necessárias.
4. Executa as migrações aplicáveis e os testes disponíveis.
5. Corrige os erros introduzidos pelas alterações.
6. Verifica os fluxos completos de reciclagem e emissão de certificados.
7. Apresenta um relatório final com os ficheiros alterados, as migrações, os testes executados, os resultados, as limitações e qualquer ação manual ainda necessária.

Se encontrares uma decisão arquitetural que possa comprometer dados existentes, interrompe essa alteração específica, explica o risco e apresenta uma alternativa segura antes de prosseguir.

Não refaças o módulo inteiro sem necessidade. Preserva o design, os componentes e as funcionalidades atuais, alterando apenas o que for necessário para resolver corretamente a pendência.
