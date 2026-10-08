# Módulo Users

## Ponto 1 — Abas e Dashboard

### Acrescentar às abas principais existentes
- Acessos & Contas
- Perfis & Permissões
- Importação
- Utilizadores Inativos
- Histórico & Auditoria

### Acrescentar à aba Dashboard
- Total de utilizadores
- Convites enviados
- Contas bloqueadas
- Novos utilizadores
- Utilizadores por unidade
- Utilizadores por departamento
- Utilizadores por cargo
- Utilizadores por perfil de acesso

## Ponto 2 — Novo Utilizador

Trocar **"Novo colaborador"** por **"Novo utilizador"**.

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
`Ativo` · `Pendente` · `Suspenso` · `Bloqueado` · `Inativo` · `Desativado`

> Quando alguém sai da empresa, o ideal é **desativar** a conta, preservando: avaliações, formações, cursos concluídos, certificados, presenças, feedback, histórico profissional, documentos, atividades e auditoria.

## Ponto 3 — Perfil do colaborador

Ao abrir um utilizador, deve ter estas abas:

1. Resumo
2. Dados Pessoais
3. Dados Profissionais
4. Organização
5. Acesso & Permissões
6. Formação
7. Cursos
8. Competências
9. Desempenho
10. Avaliações
11. PDI
12. Carreira
13. Documentos
14. Férias & Licenças
15. Presenças
16. Histórico
17. Atividade

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

### Registar alterações como
- Utilizador criado
- Dados alterados
- Departamento alterado
- Cargo alterado
- Gestor alterado
- Perfil alterado
- Permissão concedida
- Permissão removida
- Conta ativada
- Conta desativada
- Password alterada
- MFA ativado/desativado
- Login
- Logout
- Bloqueio
- Desbloqueio

### Para cada registo
Quem fez, o que alterou, valor anterior, novo valor, data/hora, origem e motivo (quando aplicável).

## Regra de arquitetura

O **Users** não deve ser responsável por tudo o que pertence ao RH. Por exemplo:

> **Users →** apenas: identidade, conta, cadastro base e acesso.
