# Módulo Organization

Módulo responsável pela configuração e estrutura corporativa global, enquanto o Departments fica focado na gestão dos departamentos. Ou seja:

- **Organization** → como a empresa está estruturada e configurada
- **Departments** → gestão dos departamentos
- **Users** → gestão dos colaboradores

## Estrutura do módulo Organization

Visão Geral, Organizações & Unidades, Estrutura Organizacional, Localizações, Configurações Corporativas, Responsáveis, Documentação, Histórico, Relatórios

## 1. Visão Geral

Dashboard da organização.

**Informações:**

- Nome da organização
- Logótipo
- NIF
- Código da organização
- País
- Sede
- Número de unidades
- Número de departamentos
- Número de colaboradores
- Número de cargos
- Estado
- Responsável principal
- Data de criação
- Informações de contacto
- Principais indicadores

**Também pode mostrar:** Headcount total, headcount por unidade, colaboradores ativos, departamentos ativos, unidades ativas, distribuição geográfica

## 2. Organizações & Unidades

Área para gerir a empresa e as suas unidades/entidades operacionais.

**Informações:**

- Nome
- Código
- Sigla
- Tipo
- NIF
- Descrição
- Empresa-mãe
- País
- Província
- Município
- Endereço
- Telefone
- E-mail
- Website
- Responsável
- Estado
- Data de criação

**Tipos:** Empresa, filial, unidade operacional, loja, fábrica, centro logístico, escritório, academia, outro

### Ao criar nova unidade

Nome, código, sigla, tipo, organização-mãe, NIF, descrição, país, província, município, endereço, localização, telefone, e-mail, responsável, estado, data de início

## 3. Estrutura Organizacional

Mostra a organização de forma hierárquica.

**Informações:**

- Organização
- Empresa
- Unidade
- Departamento
- Subdepartamento
- Localização
- Responsável
- Nível hierárquico
- Número de colaboradores

**Visualizações:** Organograma, árvore hierárquica, lista, mapa organizacional

**Hierarquia visível:**

```
Grupo → Empresa → Unidade → Departamento → Subdepartamento
```

O detalhe dos departamentos continua no módulo Departments.

## 4. Localizações

Gestão dos locais físicos da organização.

**Informações:**

- Nome da localização
- Código
- Tipo
- Organização
- Unidade
- País
- Província
- Município
- Endereço
- Edifício
- Andar
- Sala
- Código postal
- Telefone
- Responsável
- Estado

**Tipos:** Sede, escritório, loja, fábrica, armazém, centro de distribuição, academia, unidade operacional, outro

**Também pode existir:** Localização principal, localização ativa, capacidade, horário de funcionamento

## 5. Configurações Corporativas

Configurações gerais utilizadas pela plataforma.

**Informações:**

- Nome legal
- Nome comercial
- Logótipo
- NIF
- País
- Moeda
- Fuso horário
- Idioma padrão
- Formato de data
- Formato numérico
- Contacto principal
- E-mail institucional
- Telefone
- Website
- Endereço oficial

**Configurações adicionais:** Moeda padrão, calendário laboral, dias úteis, primeiro dia da semana, formato dos documentos, numeração de documentos, regras de identificação interna

Aqui também se definem configurações globais consumidas por: Payroll, Attendance, Leave, Trainings, Evaluation, Documents, Reports

## 6. Responsáveis

Gestão das pessoas responsáveis pela organização/unidades.

**Informações:**

- Responsável
- Cargo
- Organização
- Unidade
- Área de responsabilidade
- Data de início
- Data de fim
- Substituto
- Contacto
- Estado

**Tipos de responsabilidade:** Administrador da organização, Diretor, Responsável da unidade, Responsável de RH, Responsável financeiro, Responsável da Academia

**Importante:** isto não substitui Roles & Permissions. O responsável organizacional é uma relação de negócio; as permissões continuam no módulo de Roles & Permissions.

## 7. Documentação

Documentos corporativos relacionados à organização.

**Informações:**

- Nome do documento
- Tipo
- Organização/unidade
- Número
- Versão
- Data de emissão
- Data de validade
- Responsável
- Estado
- Ficheiro
- Observações

**Tipos:** Certidão, documento legal, licença, certificado, política corporativa, manual, regulamento, documento institucional, outro

Fazer integração com o módulo Biblioteca/Document Repository, para não criar um segundo sistema de armazenamento.

## 8. Histórico

Auditoria da estrutura organizacional.

**Informações:**

- Data
- Hora
- Utilizador
- Ação
- Entidade
- Informação anterior
- Nova informação
- Motivo
- IP/dispositivo (quando aplicável)

**Exemplos:** Organização criada, unidade criada, unidade transferida, departamento associado, localização alterada, responsável alterado, configuração alterada, unidade desativada

## 9. Relatórios

**Relatórios:** Estrutura organizacional, organizações, unidades, departamentos, headcount por unidade, headcount por localização, distribuição geográfica, departamentos por unidade, colaboradores por unidade, cargos por unidade, evolução do headcount, estrutura hierárquica

**Filtros:** Organização, empresa, unidade, departamento, localização, período, estado

## Relação com o módulo Departments

```
ORGANIZATION
│
├── Organizações / Empresas
│   └── Unidades
│       └── Localizações
│
└── Estrutura Organizacional
        │
        └── Departments
                ├── Departamentos
                └── Subdepartamentos
```

**Divisão de responsabilidades:**

- **Organization** → Empresas, unidades, estrutura global, localizações e configurações corporativas
- **Departments** → Departamentos, subdepartamentos, responsáveis, colaboradores alocados, cargos/funções e hierarquia departamental
- **Users** → Dados do colaborador
