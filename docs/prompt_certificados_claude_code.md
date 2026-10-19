# PROMPT PARA CLAUDE CODE — DESENVOLVIMENTO DO MÓDULO DE CERTIFICADOS DA ACADEMIA CORPORATIVA

## 1. Objetivo principal

Analisa a arquitetura atual da minha plataforma de Academia Corporativa, Formação e Recursos Humanos e implementa um sistema completo de certificados, integrado com os módulos existentes.

Atualmente, existe uma aba **Certificados dentro do módulo Cursos**. Pretendo disponibilizar também essa funcionalidade dentro do módulo **Gestão de Formações**, garantindo que ambos utilizem o mesmo sistema central de emissão, configuração, gestão e validação de certificados.

O objetivo é transformar a funcionalidade num verdadeiro subsistema de credenciais corporativas, capaz de certificar cursos, formações, trilhas de aprendizagem, eventos e outras atividades elegíveis.

**Regra fundamental:** antes de programar, inspeciona o código existente, identifica as páginas, componentes, rotas, serviços, base de dados, permissões e integrações relacionadas com Cursos, Certificados e Gestão de Formações. Reutiliza a arquitetura, os componentes e os padrões já existentes. Não cries funcionalidades duplicadas, não substituas componentes funcionais sem necessidade e não alteres módulos alheios ao objetivo.

Não te limites a criar uma interface visual ou dados fictícios. Implementa a funcionalidade de ponta a ponta, utilizando a infraestrutura real do projeto.

---

## 2. Localização e organização da funcionalidade

A funcionalidade Certificados deverá estar acessível em dois locais:

- **Módulo Cursos → Aba Certificados**
- **Módulo Gestão de Formações → Aba Certificados**

As duas entradas devem utilizar os mesmos serviços, registos, modelos, configurações, regras de emissão e histórico.

Não devem existir duas bases de dados ou dois sistemas independentes de certificados.

Se um administrador criar um template, configurar uma regra, emitir um certificado ou revogar um documento numa das áreas, a alteração deve refletir-se na outra.

Preserva a navegação, o menu lateral, o sistema de permissões, a identidade visual e os padrões de interface já utilizados pela plataforma.

A experiência deve ser consistente com uma plataforma empresarial moderna, com boa hierarquia visual, cartões informativos, tabelas organizadas, filtros, pesquisa, indicadores de estado, diálogos de confirmação e feedback claro das operações.

---

## 3. Centro de gestão de certificados

A aba Certificados deve funcionar como o centro de controlo de todas as certificações da academia.

Implementa uma interface com as seguintes áreas funcionais, respeitando a estrutura visual atual do projeto:

### 3.1. Visão geral

Apresenta indicadores atualizados a partir dos dados reais:

- Total de certificados emitidos.
- Certificados ativos e válidos.
- Certificados pendentes de aprovação.
- Certificados expirados.
- Certificados com vencimento próximo.
- Certificados revogados.
- Percentagem de cobertura das formações obrigatórias.

Permite navegar dos indicadores para as respetivas listas filtradas.

### 3.2. Lista e gestão de certificados

Disponibiliza uma tabela com pesquisa, ordenação, paginação e filtros por:

- Nome do colaborador.
- Curso ou formação.
- Trilha de aprendizagem.
- Área ou departamento.
- Data de emissão.
- Data de validade.
- Estado do certificado.
- Tipo de certificação.
- Código de verificação.

Cada registo deve permitir consultar os detalhes do certificado, visualizar ou descarregar o PDF, consultar o histórico e executar as ações autorizadas pelo perfil do utilizador.

Inclui, quando aplicável, ações de reenvio, reemissão e revogação, com confirmação e registo da operação.

### 3.3. Modelos de certificados

Cria uma área de gestão dos templates, permitindo consultar, pré-visualizar, criar versões, editar e selecionar modelos de certificação.

### 3.4. Regras de emissão

Disponibiliza uma área para configurar os critérios de emissão automática, manual ou mediante aprovação.

### 3.5. Histórico e auditoria

Disponibiliza o histórico de emissões, alterações, aprovações, revogações, reemissões e outras ações relevantes.

---

## 4. Nove templates de certificados

Implementa uma biblioteca com **exatamente nove templates de certificados**, visualmente distintos, profissionais e adequados ao contexto corporativo.

Os nove modelos devem estar disponíveis para pré-visualização e seleção antes da emissão.

Utiliza os seguintes conceitos de design como orientação:

1. Corporativo clássico.
2. Moderno minimalista.
3. Executivo premium.
4. Institucional formal.
5. Tecnológico contemporâneo.
6. Elegante com elementos geométricos.
7. Académico tradicional.
8. Moderno com faixa lateral.
9. Premium com moldura e elementos de destaque.

Estes são nove modelos de referência visual, não nove sistemas de geração diferentes. Todos devem utilizar o mesmo motor de geração e suportar os mesmos campos configuráveis.

Cada template deve possuir uma composição visual própria, mantendo legibilidade, boa proporção, alinhamento, qualidade de impressão e consistência profissional.

### 4.1. Personalização dos templates

Em cada um dos nove templates deve ser possível:

- Substituir o logótipo da empresa ou instituição.
- Carregar uma imagem de fundo personalizada.
- Personalizar cores institucionais.
- Alterar o título e os textos do certificado.
- Personalizar o texto de reconhecimento ou conclusão.
- Alterar o nome do curso ou da formação.
- Configurar a carga horária.
- Configurar a data de emissão e a validade.
- Inserir o nome e o cargo do responsável pela assinatura.
- Carregar uma imagem da assinatura digitalizada ou eletrónica, conforme o mecanismo de assinatura suportado pelo projeto.
- Configurar a posição, o tamanho e o alinhamento dos elementos.
- Incluir o código único de verificação e o QR Code.
- Pré-visualizar o resultado antes de guardar.
- Guardar o modelo e reutilizá-lo em emissões futuras.

O editor deve permitir uma personalização prática e segura, sem exigir que o utilizador edite código-fonte.

As imagens carregadas devem ter validação de formato e tamanho. A assinatura e os logótipos devem ser tratados como ativos controlados, com permissões de acesso adequadas.

### 4.2. Campos dinâmicos

Os templates devem suportar variáveis que sejam preenchidas automaticamente a partir dos dados reais do colaborador, curso e emissão.

Exemplos de variáveis:

- `{{nome_completo}}`
- `{{nome_curso}}`
- `{{nome_formacao}}`
- `{{nome_trilha}}`
- `{{nome_empresa}}`
- `{{nome_instrutor}}`
- `{{carga_horaria}}`
- `{{nota_final}}`
- `{{data_emissao}}`
- `{{data_validade}}`
- `{{codigo_certificado}}`
- `{{competencias_adquiridas}}`
- `{{assinatura_responsavel}}`
- `{{qr_code}}`

Implementa um mecanismo de substituição validado, com tratamento de variáveis inexistentes e campos opcionais.

Não apresentes variáveis técnicas sem valores reais no certificado final.

A nota, a validade, o instrutor e as competências só devem aparecer quando forem aplicáveis e estiverem devidamente configurados.

### 4.3. Versionamento dos templates

Quando um modelo for alterado, os certificados já emitidos devem conservar a sua integridade visual e documental.

Guarda a versão do template utilizada em cada emissão e os dados necessários para preservar a representação original do documento.

Uma alteração posterior do logótipo, texto, assinatura ou layout não deve modificar retroativamente certificados anteriormente emitidos.

---

## 5. Regras de emissão automática

Implementa um motor de regras que determine se o colaborador tem direito a receber o certificado.

A emissão automática deve ser configurável por curso, formação, trilha, evento ou tipo de certificação.

### 5.1. Critérios disponíveis

Permite configurar um ou mais dos seguintes critérios:

- Conclusão de 100% das aulas obrigatórias.
- Conclusão de 100% do conteúdo obrigatório do curso.
- Nota mínima na avaliação, por exemplo, 70%.
- Presença mínima exigida.
- Aprovação numa avaliação prática.
- Aprovação do instrutor ou responsável.
- Aprovação manual do gestor para formações críticas.
- Conclusão integral de uma trilha de aprendizagem.
- Combinação de vários critérios obrigatórios.

Os valores de referência devem ser configuráveis e não fixos no código.

### 5.2. Modos de emissão

Disponibiliza três modos:

**Automático:** o sistema verifica os critérios e emite o certificado quando todos os requisitos forem cumpridos.

**Manual:** um utilizador autorizado pode emitir o certificado após confirmar os requisitos aplicáveis.

**Mediante aprovação:** o sistema identifica que os critérios foram cumpridos, mas aguarda aprovação do gestor, instrutor ou administrador antes da emissão definitiva.

Quando o modo automático estiver ativo, a conclusão dos requisitos deve desencadear o processo de emissão sem exigir uma ação adicional do colaborador.

### 5.3. Segurança e prevenção de emissões indevidas

Nunca emitas um certificado apenas porque o utilizador abriu um curso ou acedeu ao conteúdo.

Antes de emitir, valida novamente os dados de progresso, avaliação, presença e aprovação, de acordo com a configuração aplicável.

Impede a emissão quando existirem requisitos obrigatórios por cumprir.

Evita certificados duplicados para o mesmo colaborador, atividade e ciclo de certificação, exceto quando existir uma regra explícita que permita nova emissão.

Se um requisito for alterado ou deixar de ser válido, não apagues silenciosamente certificados existentes. Encaminha o caso para as regras de revisão e auditoria aplicáveis.

---

## 6. Tipos de certificação

Distingue claramente:

- Certificado de conclusão.
- Certificado de aprovação.
- Certificado de participação.
- Certificação obrigatória de compliance ou segurança.
- Certificado de conclusão de trilha.
- Certificado de evento ou formação presencial.
- Certificado de formação externa importada.

Cada tipo pode ter critérios de elegibilidade diferentes.

Um certificado de participação não deve ser tratado automaticamente como equivalente a uma certificação técnica que exige aprovação.

Deve ser possível emitir certificados individuais por curso e certificados consolidados após a conclusão de uma trilha, sem duplicar indevidamente as certificações já emitidas.

---

## 7. Geração e distribuição dos certificados

Após a validação dos requisitos, o sistema deve:

1. Identificar o colaborador e a atividade concluída.
2. Selecionar o template configurado.
3. Preencher os campos dinâmicos.
4. Gerar um código único para o certificado.
5. Gerar o QR Code de verificação.
6. Aplicar os elementos gráficos e a assinatura configurada.
7. Gerar o documento final em PDF.
8. Registar a emissão e os dados relevantes para auditoria.
9. Disponibilizar o certificado ao colaborador.
10. Enviar uma notificação, quando essa funcionalidade estiver configurada.

O PDF deve ser legível em ecrã e em impressão, com tipografia adequada, imagens de qualidade e posicionamento correto dos elementos.

Utiliza uma solução de geração de PDF compatível com a stack já existente. Evita introduzir dependências desnecessárias.

A geração deve tratar erros de renderização, falhas de armazenamento e problemas de entrega, sem registar como concluída uma operação que tenha falhado.

---

## 8. QR Code e validação pública

Cada certificado emitido deve ter um identificador único e um mecanismo de validação.

Implementa uma página pública de verificação acessível através do QR Code ou de um link seguro.

A página deve permitir confirmar:

- Autenticidade e existência do certificado.
- Nome do titular, conforme a política de privacidade.
- Curso, formação ou programa.
- Empresa ou instituição emissora.
- Carga horária.
- Data de emissão.
- Validade, quando aplicável.
- Estado atual do certificado.
- Tipo de certificação.

Um certificado revogado ou expirado deve apresentar o respetivo estado, sem ser apresentado como válido.

O QR Code deve apontar para o endereço real da página de verificação, utilizando o domínio e a configuração de rotas do projeto.

Não exponhas informações internas, dados pessoais desnecessários, identificadores privados ou documentos completos na página pública.

A validação deve consultar o registo atual do certificado, em vez de confiar apenas nos dados impressos no PDF.

O código de verificação não deve permitir alterar o certificado nem aceder a dados internos.

---

## 9. Experiência do colaborador

Disponibiliza uma área de certificados pessoais integrada na experiência do colaborador.

Deve permitir:

- Consultar todos os certificados obtidos.
- Pesquisar e filtrar por curso, formação, trilha, data, estado e validade.
- Visualizar o documento.
- Descarregar o PDF.
- Partilhar um link público de verificação.
- Enviar o certificado por e-mail, se o serviço de e-mail estiver configurado.
- Partilhar no LinkedIn através de um fluxo compatível com as funcionalidades oficialmente disponíveis.
- Consultar certificados pendentes.
- Identificar formações obrigatórias ainda não concluídas.
- Receber notificações sobre certificados prestes a expirar.
- Consultar certificados expirados ou revogados e os respetivos estados.

Não apresentes um botão de partilha como funcional se a integração necessária não estiver implementada.

O colaborador só pode consultar os próprios certificados, salvo permissões adicionais explicitamente atribuídas.

---

## 10. Gestão de formações, gestores e RH

### 10.1. Gestão de Formações

Integra a emissão de certificados no ciclo de vida das formações.

A conclusão de uma formação deve poder desencadear a emissão automática, manual ou mediante aprovação, conforme as regras configuradas.

Para formações presenciais, permite considerar presença, carga horária e validação do responsável.

Para formações críticas, permite exigir aprovação adicional.

### 10.2. Visão do gestor

Disponibiliza uma visão consolidada das certificações da equipa, incluindo:

- Certificados por colaborador.
- Certificações obrigatórias pendentes.
- Colaboradores com formação em andamento.
- Certificações expiradas ou próximas do vencimento.
- Cobertura de formação por equipa ou área.
- Pedidos de aprovação pendentes.

O gestor só deve visualizar os colaboradores e os dados abrangidos pelas suas permissões.

### 10.3. Visão de RH e administrador

Permite aos utilizadores autorizados:

- Gerir os nove templates.
- Configurar regras de emissão.
- Emitir certificados individualmente ou em lote.
- Aprovar certificações.
- Consultar e exportar registos.
- Revogar e reemitir certificados.
- Importar certificados externos.
- Configurar validade e reciclagem.
- Consultar histórico e auditoria.

A emissão em lote deve validar cada colaborador individualmente, apresentar os resultados e identificar eventuais falhas sem comprometer os registos que foram processados com sucesso.

### 10.4. Exportação

Disponibiliza exportações em Excel, CSV e PDF, conforme as bibliotecas e funcionalidades existentes.

Permite filtrar os dados antes da exportação e respeita as permissões de acesso.

Os relatórios devem ser adequados para auditorias, comités de formação e análises de RH.

---

## 11. Validade, expiração e recertificação

Cada tipo de certificado deve permitir configurar uma validade opcional.

Exemplos: validade de 12 meses, 24 meses ou sem expiração.

Os prazos devem ser configuráveis, e não codificados de forma fixa.

Quando existir validade, calcula a data de expiração a partir das regras definidas.

Implementa estados coerentes, como:

- Pendente.
- Pendente de aprovação.
- Ativo.
- Expirado.
- Revogado.

O sistema deve identificar certificados que irão expirar, por exemplo, nos próximos 30 dias, com possibilidade de configurar outros intervalos.

Integra a funcionalidade com o sistema de automações e notificações existente, para alertar o colaborador e os responsáveis autorizados.

Quando aplicável, permite encaminhar o colaborador para uma nova formação ou reciclagem obrigatória.

A inscrição automática numa reciclagem só deve ocorrer quando a regra estiver configurada e o fluxo de inscrições existente suportar essa operação.

---

## 12. Revogação, reemissão e importação externa

### 12.1. Revogação

Permite revogar um certificado apenas a utilizadores autorizados.

Exige motivo da revogação e regista o responsável, a data, o certificado afetado e o histórico da operação.

A revogação deve atualizar imediatamente o estado apresentado na página de validação pública.

Não apagues o registo original.

### 12.2. Reemissão

Permite reemitir um certificado em caso de correção, alteração autorizada ou necessidade de substituição.

A reemissão deve preservar a relação com o certificado anterior e registar o motivo, o responsável, a data e a nova versão.

Não substituas silenciosamente o documento histórico.

### 12.3. Certificados externos

Permite a utilizadores autorizados importar certificados obtidos fora da plataforma.

A funcionalidade deve suportar, conforme os formatos já aceites pelo sistema:

- Upload do documento.
- Identificação do colaborador.
- Nome da formação.
- Entidade emissora.
- Data de conclusão e validade.
- Carga horária, quando conhecida.
- Estado de validação.
- Observações e anexos relevantes.

Os certificados importados devem ser identificados como externos e não podem ser apresentados como emitidos pela própria academia.

---

## 13. Estrutura de dados e integridade

Analisa o modelo de dados existente antes de criar ou modificar tabelas.

Reutiliza as entidades já disponíveis para utilizadores, cursos, formações, matrículas, progresso, avaliações, departamentos e permissões.

Cria ou adapta as entidades necessárias para suportar, no mínimo:

### Certificado

- Identificador interno.
- Código único de verificação.
- Titular.
- Origem da certificação.
- Curso, formação, trilha ou evento associado.
- Tipo de certificado.
- Instrutor ou responsável, quando aplicável.
- Data de emissão.
- Data de validade, quando aplicável.
- Nota ou resultado, quando aplicável.
- Critérios de aprovação aplicados.
- Carga horária.
- Estado.
- Competências associadas, quando existentes.
- Referência ao PDF.
- Referência à versão do template.
- QR Code ou endereço de verificação.
- Referência a uma eventual reemissão ou revogação.

### Template

- Identificador.
- Nome.
- Tipo ou categoria.
- Configuração visual.
- Logótipo e ativos gráficos.
- Campos dinâmicos.
- Configuração de assinatura.
- Estado de publicação.
- Número da versão.
- Data de criação e última alteração.
- Responsável pela alteração.

### Regra de emissão

- Atividade a que se aplica.
- Modo de emissão.
- Critérios obrigatórios.
- Nota mínima, se aplicável.
- Presença mínima, se aplicável.
- Requisitos de aprovação.
- Template selecionado.
- Validade.
- Estado da configuração.
- Responsável e datas de alteração.

### Histórico de auditoria

- Ação realizada.
- Certificado afetado.
- Utilizador responsável.
- Data e hora.
- Motivo, quando aplicável.
- Estado anterior e novo estado.
- Referências relevantes para rastreabilidade.

Adapta estes campos às convenções reais da base de dados e evita criar duplicações desnecessárias.

Implementa as restrições de unicidade, validações, relações e índices necessários. Garante que operações concorrentes não geram certificados duplicados.

O código de verificação deve ser único e suficientemente imprevisível para dificultar tentativas de descoberta.

Se for necessário gerar uma assinatura criptográfica ou um hash de integridade, utiliza mecanismos apropriados à arquitetura existente. Não confundas uma imagem de assinatura com uma assinatura digital criptográfica.

---

## 14. Integrações com os restantes módulos

Inspeciona quais destes módulos existem realmente no projeto. Implementa as integrações suportadas pela arquitetura e documenta as que dependem de sistemas externos ou funcionalidades ainda inexistentes.

### Cursos e biblioteca de conteúdos

Recebe progresso, conclusão, avaliações e critérios de aprovação.

### Gestão de Formações e Eventos

Recebe dados de presença, carga horária, conclusão e aprovação.

### Recursos Humanos e perfis de colaboradores

Associa os certificados ao respetivo titular e à estrutura organizacional.

### Desenvolvimento de Talentos e competências

Regista competências adquiridas quando houver um mapeamento válido entre a formação e as competências existentes.

### Carreiras e planos de desenvolvimento

Disponibiliza certificações como evidências de desenvolvimento, sem alterar automaticamente decisões de promoção ou elegibilidade sem regras explícitas.

### Automações e notificações

Dispara emissão, aprovação, avisos de vencimento, reenvio e reciclagem.

### Relatórios, Analytics e Dashboard de RH

Disponibiliza indicadores de emissão, validade, conformidade, cobertura e conclusão.

### Avaliação de desempenho

Permite consultar certificações como evidências de desenvolvimento. A participação numa avaliação 360° não deve, por si só, emitir certificados.

### Pesquisa

Permite encontrar certificados por colaborador, curso, competência, departamento, código e data, respeitando as permissões.

### Auditoria e histórico

Regista operações relevantes e permite rastrear a origem de cada certificação.

### Integrações externas

Quando existirem APIs e serviços configurados, prepara a integração com HRIS, sistemas de compliance e plataformas profissionais. Não inventes endpoints, credenciais ou integrações que não estejam disponíveis.

---

## 15. Fluxo completo de emissão

Implementa o seguinte fluxo:

1. O colaborador conclui um curso, formação, trilha ou evento.
2. O sistema identifica a atividade e consulta a respetiva regra de certificação.
3. Valida os requisitos obrigatórios de progresso, avaliação, presença e aprovação.
4. Se algum requisito estiver em falta, mantém o certificado pendente ou indisponível e informa o motivo.
5. Se for necessária aprovação, cria um pedido de aprovação para o responsável autorizado.
6. Após a aprovação, seleciona o template e preenche os dados reais.
7. Gera o código único, o QR Code e o PDF.
8. Guarda o registo e o histórico da emissão.
9. Disponibiliza o documento ao colaborador e envia a notificação configurada.
10. Atualiza os dados de certificação e competências nos módulos integrados, quando aplicável.
11. Permite ao gestor e a RH acompanhar a certificação conforme as suas permissões.
12. Antes do vencimento, desencadeia os alertas e os processos de reciclagem configurados.

O fluxo deve ser idempotente: repetir um evento de conclusão ou uma notificação não pode produzir certificados duplicados.

Implementa tratamento de falhas e mecanismos de repetição seguros para operações que dependam de serviços externos.

---

## 16. Permissões, privacidade e segurança

Integra o sistema com o mecanismo de autenticação e controlo de acessos já existente.

Define permissões equivalentes às seguintes, adaptadas aos papéis reais do projeto:

- Colaborador: consultar e descarregar os próprios certificados.
- Gestor: consultar certificados e pendências da sua equipa.
- Instrutor ou responsável: validar critérios e aprovar quando autorizado.
- RH: consultar e gerir certificações no âmbito das permissões atribuídas.
- Administrador da academia: configurar templates e regras e gerir as emissões autorizadas.
- Auditor: consultar e exportar os registos autorizados, sem editar certificados.

Aplica autorização no backend, não apenas escondendo botões na interface.

Valida todos os inputs e uploads, protege os documentos armazenados e impede o acesso indevido a ficheiros privados.

A página pública de verificação deve divulgar apenas os dados estritamente necessários.

Não permitas que um utilizador altere os seus resultados, falsifique a conclusão de um curso ou emita um certificado através de uma chamada direta à API sem autorização.

---

## 17. Requisitos de implementação

Antes de começar:

1. Analisa a estrutura do projeto e identifica a stack tecnológica.
2. Localiza a aba Certificados existente e verifica o que já está implementado.
3. Identifica o módulo Gestão de Formações e o mecanismo de navegação.
4. Localiza as entidades de cursos, utilizadores, progresso, avaliações, formações e permissões.
5. Identifica os serviços de PDF, armazenamento, notificações e automação existentes.
6. Apresenta um plano curto das alterações necessárias e avança para a implementação.

Durante o desenvolvimento:

- Reutiliza componentes, estilos, serviços e convenções existentes.
- Não substituas páginas funcionais por protótipos.
- Não cries dados fictícios para simular funcionalidades concluídas.
- Não alteres funcionalidades não relacionadas com o pedido.
- Não introduzas dependências sem necessidade.
- Cria migrações de base de dados quando necessárias.
- Mantém a compatibilidade com os dados existentes.
- Implementa estados de carregamento, sucesso, erro e ausência de resultados.
- Utiliza validação no frontend e no backend.
- Garante que os botões e as ações têm comportamento real.
- Evita regressões nas funcionalidades atuais.

Se alguma integração não existir, implementa a parte que a arquitetura permite e identifica claramente a dependência em falta. Não apresentes uma integração simulada como concluída.

---

## 18. Critérios de aceitação

Considera a funcionalidade concluída apenas quando os seguintes testes forem satisfeitos:

1. A aba Certificados está acessível em Cursos e Gestão de Formações.
2. Ambas as áreas consultam os mesmos dados e configurações.
3. Existem exatamente nove templates disponíveis para seleção.
4. Os nove templates podem ser pré-visualizados e personalizados.
5. É possível alterar o logótipo, os textos, as cores, os campos dinâmicos e a assinatura em cada template.
6. A alteração de um template não modifica retroativamente os certificados já emitidos.
7. A emissão automática respeita os critérios configurados.
8. A emissão manual e mediante aprovação respeita as permissões.
9. Não é possível emitir certificados quando faltam requisitos obrigatórios.
10. O sistema impede duplicações indevidas.
11. O PDF gerado apresenta os dados corretos e o layout selecionado.
12. O QR Code e o código único permitem verificar a autenticidade.
13. A página pública apresenta o estado atual, incluindo expiração ou revogação.
14. O colaborador consegue consultar e descarregar os próprios certificados.
15. Gestores e RH só acedem aos dados autorizados.
16. As operações de revogação e reemissão preservam o histórico.
17. A validade e os alertas funcionam de acordo com as regras configuradas.
18. Os relatórios e as exportações respeitam os filtros e as permissões.
19. As integrações existentes recebem os dados necessários.
20. Os testes automatizados e os testes de integração relevantes passam sem regressões.

Cria ou atualiza testes para os principais fluxos, incluindo conclusão de curso, nota insuficiente, aprovação pendente, emissão duplicada, geração de PDF, verificação pública, expiração e revogação.

---

## 19. Entrega final

No final, apresenta um resumo técnico do trabalho realizado, indicando:

- Funcionalidades implementadas.
- Localização das alterações no código.
- Componentes, serviços e páginas criados ou reutilizados.
- Alterações na base de dados e migrações necessárias.
- Implementação dos nove templates.
- Regras de emissão disponíveis.
- Integrações concluídas.
- Testes executados e respetivos resultados.
- Configurações ou variáveis de ambiente necessárias.
- Integrações pendentes que dependam de serviços externos.

Não declares uma funcionalidade como concluída se apenas existir a interface visual.

**Resultado esperado:** um sistema de certificados corporativos funcional, seguro, integrado e reutilizável, com nove templates personalizáveis, emissão automática ou opcional, geração de PDF, verificação por QR Code, gestão de validade, auditoria e acesso através dos módulos Cursos e Gestão de Formações.

Implementa a solução de acordo com a arquitetura real da plataforma, preservando o que já funciona e garantindo que os novos recursos utilizam dados reais de ponta a ponta.
