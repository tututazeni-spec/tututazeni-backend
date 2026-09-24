# Módulo Users

## Ponto 1 — Abas principais a acrescentar

Acessos & Contas, Perfis & Permissões, Importação, Utilizadores Inativos, Histórico & Auditoria

**Acrescentar na aba Dashboard:**

- Total de utilizadores
- Convites enviados
- Contas bloqueadas
- Novos utilizadores
- Utilizadores por unidade
- Utilizadores por departamento
- Utilizadores por cargo
- Utilizadores por perfil de acesso

## Ponto 2 — Trocar "Novo Colaborador" por "Novo Utilizador"

Ao clicar em "Novo Utilizador", acrescentar ao que já existe:

### Dados pessoais

- Nome completo
- Nome preferencial
- Fotografia
- Género
- Data de nascimento
- Nacionalidade
- País de residência
- Número de identificação
- NIF

### Dados profissionais

- Número de colaborador
- Unidade
- Empresa
- Departamento
- Área
- Cargo
- Função
- Categoria profissional
- Gestor direto
- Localização
- Data de admissão
- Tipo de contrato
- Regime de trabalho
- Estado do colaborador

### Dados de contacto

- Email profissional
- Email pessoal
- Telefone
- Telefone alternativo
- Endereço
- Contacto de emergência

### Conta de acesso

- Email de login
- Username
- Perfil de acesso
- Função no sistema
- Permissões adicionais
- Estado da conta
- Autenticação multifator
- Idioma
- Fuso horário

### Academia

- Perfil de aprendizagem
- Área de interesse
- Cursos atribuídos
- Percursos atribuídos
- Formador/instrutor
- Competências
- Nível de acesso aos conteúdos

### RH

- Número de identificação interna
- Centro de custo
- Código da posição
- Data de início
- Data de fim
- Localização de trabalho
- Horário
- Regime de trabalho

### Estado do utilizador

Ativo, Pendente, Suspenso, Bloqueado, Inativo, Desativado

Quando alguém sai da empresa, o ideal é desativar a conta, preservando: avaliações, formações, cursos concluídos, certificados, presenças, feedback, histórico profissional, documentos, atividades e auditoria.

## Ponto 3 — Perfil do colaborador

Ao abrir um utilizador, deve ter estas abas:

Resumo, Dados Pessoais, Dados Profissionais, Organização, Acesso & Permissões, Formação, Cursos, Competências, Desempenho, Avaliações, PDI, Carreira, Documentos, Férias & Licenças, Presenças, Histórico, Atividade

## Ponto 4 — Acessos & Permissões

- Perfil
- Função
- Permissões
- Módulos autorizados
- Unidades autorizadas
- Departamentos autorizados
- Permissões especiais
- Último acesso
- Data de criação da conta
- Último login
- Sessões ativas
- Dispositivos
- MFA
- Bloqueios
- Tentativas de login

## Ponto 5 — Importação

Para uma plataforma com milhares de colaboradores:

- Importar colaboradores
- Excel/CSV
- Mapeamento de campos
- Validação
- Pré-visualização
- Deteção de duplicados
- Erros de importação
- Atualização de utilizadores existentes
- Criação de novos utilizadores
- Relatório de importação
- Histórico de importações

## Ponto 6 — Histórico & Auditoria

**Registar alterações como:**

Utilizador criado, dados alterados, departamento alterado, cargo alterado, gestor alterado, perfil alterado, permissão concedida, permissão removida, conta ativada, conta desativada, password alterada, MFA ativado/desativado, login, logout, bloqueio, desbloqueio

**Para cada registo:** quem fez, o que alterou, valor anterior, novo valor, data/hora, origem e motivo (quando aplicável)

## Regra de arquitetura

O Users não deve ser responsável por tudo o que pertence ao RH.

> Users → apenas: identidade, conta, cadastro base e acesso.
